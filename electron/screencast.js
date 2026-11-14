'use strict';
// Compartilhamento de tela "nativo": captura + codificação UMA vez, de preferência na placa de vídeo,
// entregue pra cada pessoa da call pelo auxiliar dusky-screencast (native/screencast/main.go).
//
// Por que: pelo Chromium, a tela é codificada no processador, uma vez POR PESSOA assistindo (a call é
// em malha) — medido no Ryzen 7 5700X: ~1 núcleo por pessoa em 1080p60, derrubando o fps dos jogos.
// O Chromium também não usa o codificador da NVIDIA (NVENC) no Linux. Aqui o ffmpeg captura e
// codifica uma vez (NVENC → VAAPI/QSV/AMF → x264 no processador, o que existir), e o auxiliar só
// empacota e manda o mesmo vídeo pra cada um. Medido: tela real 1080p60 + NVENC pra 3 pessoas =
// ~26% de um núcleo no total, 60 fps chegando nas 3.
//
// Wayland: o ffmpeg não consegue ler a tela sem o portal do sistema. Então o auxiliar abre o portal
// (seletor do Hyprland/GNOME/KDE), recebe o fd do PipeWire e o GStreamer (pipewiresrc) captura e
// codifica na placa de vídeo (nvh264enc / vah264enc), ou no processador (x264enc) se não tiver.
//
// Quando NÃO dá (macOS, sem ffmpeg/GStreamer), available() diz que não, e o site usa o caminho antigo
// (Chromium).

const { spawn, execFile } = require('child_process');
const path = require('path');
const readline = require('readline');
const { app, screen } = require('electron');

const IS_WIN = process.platform === 'win32';
const IS_LINUX = process.platform === 'linux';

function helperPath() {
  const exe = IS_WIN ? 'dusky-screencast.exe' : 'dusky-screencast';
  return app.isPackaged
    ? path.join(process.resourcesPath, 'native', exe)
    : path.join(__dirname, 'native', 'bin', exe);
}

// ambiente pros programas do sistema (ffmpeg, GStreamer): sem o LD_LIBRARY_PATH que o AppImage pode
// injetar, senão o gst-launch do sistema carrega bibliotecas do pacote do app e os plugins quebram
function childEnv() {
  const env = { ...process.env };
  if (IS_LINUX && process.env.APPIMAGE) delete env.LD_LIBRARY_PATH;
  return env;
}

function run(bin, args, timeout = 15000) {
  return new Promise((resolve) => {
    execFile(bin, args, { timeout, maxBuffer: 8 * 1024 * 1024, windowsHide: true, env: childEnv() }, (err, stdout, stderr) => {
      resolve({ ok: !err, stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });
}

// ---------------------------------------------------------------- codificadores

// argumentos de cada codificador H.264 (sem B-frames, quadro-chave a cada 2s, baixa latência).
// kbps = bitrate alvo, gop = quadros entre quadros-chave.
const ENCODERS = {
  h264_nvenc: (kbps, gop) => ['-c:v', 'h264_nvenc', '-preset', 'p4', '-tune', 'll', '-zerolatency', '1', '-rc', 'cbr',
    '-b:v', `${kbps}k`, '-maxrate', `${kbps}k`, '-bufsize', `${Math.round(kbps / 2)}k`, '-g', String(gop), '-bf', '0', '-profile:v', 'baseline'],
  h264_vaapi: (kbps, gop) => ['-c:v', 'h264_vaapi', '-profile:v', 'constrained_baseline', '-b:v', `${kbps}k`, '-maxrate', `${kbps}k`,
    '-g', String(gop), '-bf', '0'],
  h264_qsv: (kbps, gop) => ['-c:v', 'h264_qsv', '-preset', 'veryfast', '-profile:v', 'baseline', '-b:v', `${kbps}k`, '-maxrate', `${kbps}k`,
    '-g', String(gop), '-bf', '0'],
  h264_amf: (kbps, gop) => ['-c:v', 'h264_amf', '-usage', 'ultralowlatency', '-quality', 'speed', '-rc', 'cbr', '-profile:v', 'constrained_baseline',
    '-b:v', `${kbps}k`, '-maxrate', `${kbps}k`, '-g', String(gop), '-bf', '0'],
  libx264: (kbps, gop) => ['-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency', '-profile:v', 'baseline',
    '-b:v', `${kbps}k`, '-maxrate', `${kbps}k`, '-bufsize', `${kbps}k`, '-g', String(gop),
    '-x264-params', 'repeat-headers=1:sliced-threads=0'],
};

// ordem de preferência: placa de vídeo primeiro; x264 (processador) é o último recurso — mesmo assim
// bem melhor que o caminho antigo, porque codifica UMA vez em vez de uma por pessoa
const ORDER = IS_WIN
  ? ['h264_nvenc', 'h264_amf', 'h264_qsv', 'libx264']
  : ['h264_nvenc', 'h264_vaapi', 'h264_qsv', 'libx264'];

const ENCODER_NAMES = {
  h264_nvenc: 'placa de vídeo NVIDIA (NVENC)',
  h264_vaapi: 'placa de vídeo (VA-API)',
  h264_qsv: 'placa de vídeo Intel (Quick Sync)',
  h264_amf: 'placa de vídeo AMD (AMF)',
  libx264: 'processador (x264)',
};

const VAAPI_DEVICE = '/dev/dri/renderD128';

// pedaço extra antes da entrada e filtro de vídeo que cada codificador precisa
function encoderPlumbing(encoder, scaleTo) {
  const scale = scaleTo ? `${scaleTo.w}:${scaleTo.h}` : null;
  if (encoder === 'h264_nvenc') {
    // reduz o tamanho DENTRO da placa (scale_cuda) — sem gastar processador
    return { pre: [], filter: scale ? `hwupload_cuda,scale_cuda=${scale}` : null };
  }
  if (encoder === 'h264_vaapi') {
    return { pre: ['-vaapi_device', VAAPI_DEVICE], filter: `format=nv12,hwupload${scale ? `,scale_vaapi=${scale}` : ''}` };
  }
  if (encoder === 'h264_qsv') {
    return { pre: [], filter: `${scale ? `scale=${scale}:flags=fast_bilinear,` : ''}format=nv12` };
  }
  return { pre: [], filter: scale ? `scale=${scale}:flags=fast_bilinear` : null };
}

// ---------------------------------------------------------------- Wayland: GStreamer

// cadeia de cada codificador do GStreamer, do quadro cru (memória normal, BGRx) até H.264.
// scale = tamanho final ({w, h}) ou null pra manter o da captura.
const GST_ENCODERS = {
  // NVIDIA: sobe o quadro pra placa e codifica lá. Pra reduzir o tamanho, usa o OpenGL (na placa
  // também) — o nvh264enc aceita quadro em memória GL direto.
  nvh264enc: ({ kbps, gop, scale }) => [
    ...(scale
      ? ['glupload', '!', 'glcolorconvert', '!', 'glcolorscale', '!', `video/x-raw(memory:GLMemory),width=${scale.w},height=${scale.h}`]
      : ['cudaupload']),
    '!', 'nvh264enc', 'preset=p4', 'tune=ultra-low-latency', 'rc-mode=cbr', `bitrate=${kbps}`, `gop-size=${gop}`,
    'bframes=0', 'zerolatency=true', 'repeat-sequence-header=true',
  ],
  // AMD/Intel (VA-API): o vapostproc converte (e reduz) na placa
  vah264lpenc: ({ kbps, gop, scale }) => [
    'vapostproc', '!', `video/x-raw(memory:VAMemory),format=NV12${scale ? `,width=${scale.w},height=${scale.h}` : ''}`,
    '!', 'vah264lpenc', 'rate-control=cbr', `bitrate=${kbps}`, `key-int-max=${gop}`, 'b-frames=0', 'target-usage=7',
  ],
  vah264enc: ({ kbps, gop, scale }) => [
    'vapostproc', '!', `video/x-raw(memory:VAMemory),format=NV12${scale ? `,width=${scale.w},height=${scale.h}` : ''}`,
    '!', 'vah264enc', 'rate-control=cbr', `bitrate=${kbps}`, `key-int-max=${gop}`, 'b-frames=0', 'target-usage=7',
  ],
  // processador: o x264 só aceita tamanho par, então sempre reescala pra um tamanho fixo (com bordas
  // pretas se a proporção mudar, ex: janela redimensionada)
  x264enc: ({ kbps, gop, scale }) => [
    'videoconvert', '!', 'videoscale', 'add-borders=true', '!',
    `video/x-raw,format=I420,width=${scale.w},height=${scale.h},pixel-aspect-ratio=1/1`,
    '!', 'x264enc', 'tune=zerolatency', 'speed-preset=veryfast', `bitrate=${kbps}`, `key-int-max=${gop}`, 'bframes=0',
  ],
};

const GST_ORDER = ['nvh264enc', 'vah264lpenc', 'vah264enc', 'x264enc'];

const GST_ENCODER_NAMES = {
  nvh264enc: 'placa de vídeo NVIDIA (NVENC)',
  vah264lpenc: 'placa de vídeo (VA-API)',
  vah264enc: 'placa de vídeo (VA-API)',
  x264enc: 'processador (x264)',
};

// saída comum: H.264 Annex-B, SPS/PPS antes de cada quadro-chave (quem entra no meio consegue
// começar), direto no stdout pro auxiliar
const GST_TAIL = ['!', 'video/x-h264,profile=constrained-baseline,stream-format=byte-stream',
  '!', 'h264parse', 'config-interval=-1', '!', 'fdsink', 'fd=1', 'sync=false'];

async function probeWayland(log) {
  const gst = 'gst-launch-1.0';
  if (!(await run('gst-inspect-1.0', ['pipewiresrc'])).ok) {
    return { available: false, reason: 'falta o GStreamer com o plugin do PipeWire (gst-plugin-pipewire)' };
  }
  for (const enc of GST_ORDER) {
    const scale = enc === 'x264enc' ? { w: 640, h: 360 } : null;
    const args = ['-q', 'videotestsrc', 'num-buffers=15', '!', 'video/x-raw,format=BGRx,width=640,height=360,framerate=30/1',
      '!', ...GST_ENCODERS[enc]({ kbps: 2000, gop: 30, scale }), ...GST_TAIL.slice(0, -4), '!', 'fakesink'];
    const r = await run(gst, args, 20000);
    if (!r.ok) {
      log(`[gstreamer] ${enc} indisponível: ${(r.stderr || r.stdout).trim().split('\n').pop() || 'falhou'}`);
      continue;
    }
    // reduzir o tamanho na NVIDIA passa pelo OpenGL — testa à parte; se falhar, manda no tamanho original
    let canScale = true;
    if (enc === 'nvh264enc') {
      const g = await run(gst, ['-q', 'videotestsrc', 'num-buffers=10', '!', 'video/x-raw,format=BGRx,width=640,height=360,framerate=30/1',
        '!', ...GST_ENCODERS[enc]({ kbps: 2000, gop: 30, scale: { w: 320, h: 180 } }), '!', 'fakesink'], 20000);
      canScale = g.ok;
      if (!g.ok) log('[gstreamer] redução de tamanho pelo OpenGL indisponível — vai no tamanho da tela');
    }
    log(`compartilhamento nativo (Wayland): ${enc} pelo GStreamer`);
    return { available: true, capture: 'portal', gst, encoder: enc, encoderName: GST_ENCODER_NAMES[enc], hardware: enc !== 'x264enc', canScale };
  }
  return { available: false, reason: 'nenhum codificador H.264 funcionou no GStreamer' };
}

function buildGstArgs(info, src, opts) {
  const fps = Math.max(5, Math.min(120, Number(opts.fps) || 30));
  const isWindow = src.sourceType === 2;
  const w = src.width || opts.width || 1920;
  const h = src.height || opts.height || 1080;
  // janela: mantém o tamanho dela (ela pode mudar de tamanho no meio); tela: cabe no pedido
  let scale = isWindow ? null : fitInside(w, h, opts.width, opts.height);
  if (scale && !info.canScale) scale = null;
  if (info.encoder === 'x264enc' && !scale) scale = { w: evenDown(w), h: evenDown(h) };
  const finalSize = scale || { w, h };
  const kbps = Number(opts.bitrateKbps) > 0 ? Math.min(MAX_KBPS, Number(opts.bitrateKbps)) : autoBitrateKbps(finalSize.w, finalSize.h, fps);
  return {
    kbps,
    size: finalSize,
    args: ['-q', 'pipewiresrc', 'fd=3', 'path={node}', 'do-timestamp=true', 'keepalive-time=500', 'client-name=dusky',
      // o portal só manda quadro quando a tela muda: o videorate repete o último pra manter o fps fixo
      // (quadro-chave no tempo certo, e quem entra no meio não espera a tela mudar)
      '!', 'video/x-raw', '!', 'videorate', '!', `video/x-raw,framerate=${fps}/1`,
      '!', ...GST_ENCODERS[info.encoder]({ kbps, gop: fps, scale }), ...GST_TAIL],
  };
}

// ---------------------------------------------------------------- detecção (uma vez por sessão)

let probePromise = null;

function isWayland() {
  return IS_LINUX && (process.env.XDG_SESSION_TYPE === 'wayland' || !!process.env.WAYLAND_DISPLAY);
}

// testa, de verdade, quais codificadores um ffmpeg consegue usar (codificando alguns quadros) —
// "estar na lista" do ffmpeg não garante que a placa/driver aceita (ex: ffmpeg novo demais pro driver)
async function bestEncoderOf(ffmpeg, log) {
  if (!(await run(ffmpeg, ['-hide_banner', '-version'])).ok) return null;
  for (const enc of ORDER) {
    const plumb = encoderPlumbing(enc, null);
    const args = ['-hide_banner', '-loglevel', 'error', ...plumb.pre,
      '-f', 'lavfi', '-i', 'testsrc2=s=640x360:r=30', '-frames:v', '15',
      ...(plumb.filter ? ['-vf', plumb.filter] : []),
      ...ENCODERS[enc](2000, 60), '-f', 'null', '-'];
    const r = await run(ffmpeg, args, 20000);
    if (r.ok) return enc;
    log(`[${path.basename(ffmpeg)}] ${enc} indisponível: ${r.stderr.trim().split('\n').pop() || 'falhou'}`);
  }
  return null;
}

// escolhe o melhor ffmpeg + codificador disponível. Ordem dos candidatos: FFMPEG_PATH (se definido),
// o do sistema, o que o app baixou. Codificador na placa de vídeo ganha de qualquer um no processador.
// Se nenhum tiver placa de vídeo e o app ainda não baixou o dele, baixa em segundo plano e refaz a
// detecção quando terminar (até lá, devolve o melhor que tiver — ou "indisponível").
function probe(log, deps) {
  if (!probePromise) {
    probePromise = (async () => {
      if (!IS_LINUX && !IS_WIN) return { available: false, reason: 'só Linux (X11) e Windows por enquanto' };
      if (!require('fs').existsSync(helperPath())) return { available: false, reason: 'auxiliar de compartilhamento não encontrado' };
      if (isWayland()) return probeWayland(log);
      if (IS_LINUX && !process.env.DISPLAY) return { available: false, reason: 'sem DISPLAY do X11' };

      const candidates = [];
      if (process.env.FFMPEG_PATH) candidates.push(process.env.FFMPEG_PATH);
      candidates.push(IS_WIN ? 'ffmpeg.exe' : 'ffmpeg');
      const managed = deps && deps.managedFfmpeg();
      if (managed) candidates.push(managed);

      let fallback = null;
      for (const ffmpeg of candidates) {
        const enc = await bestEncoderOf(ffmpeg, log);
        if (!enc) continue;
        const result = { available: true, ffmpeg, encoder: enc, encoderName: ENCODER_NAMES[enc], hardware: enc !== 'libx264' };
        if (result.hardware) {
          log(`compartilhamento nativo: ${enc} (${ffmpeg})`);
          return result;
        }
        if (!fallback) fallback = result;
      }

      // nenhum com placa de vídeo: o ffmpeg do app (baixado) pode ter o que falta (ex: Windows sem
      // ffmpeg, Fedora com ffmpeg sem NVENC) — baixa em segundo plano e detecta de novo depois
      if (!managed && deps) {
        deps.ensureFfmpeg().then((p) => { if (p) probePromise = null; });
        if (!fallback) return { available: false, downloading: true, reason: 'baixando o componente de compartilhamento pela placa de vídeo' };
      }
      if (fallback) {
        log(`compartilhamento nativo: ${fallback.encoder} no processador (${fallback.ffmpeg})`);
        return fallback;
      }
      return { available: false, reason: 'nenhum codificador H.264 funcionou no ffmpeg' };
    })().catch((err) => ({ available: false, reason: err.message }));
  }
  return probePromise;
}

// ---------------------------------------------------------------- argumentos de captura

// bitrate "automático": o suficiente pra resolução/fps escolhidos sem desperdiçar a sua internet —
// lembrando que cada pessoa assistindo recebe uma cópia
const MAX_KBPS = 16000; // teto do compartilhamento: 16 Mbps

function autoBitrateKbps(w, h, fps) {
  const pixelsPerSec = w * h * fps;
  return Math.max(2500, Math.min(MAX_KBPS, Math.round(pixelsPerSec / 1920 / 1080 / 60 * 8000)));
}

function evenDown(n) { return Math.max(2, Math.floor(n / 2) * 2); }

// tamanho final: cabe dentro do pedido (ex: 1280x720), mantém a proporção, sempre par (o codificador exige)
function fitInside(srcW, srcH, maxW, maxH) {
  if (!maxW || !maxH || (srcW <= maxW && srcH <= maxH)) return null;
  const k = Math.min(maxW / srcW, maxH / srcH);
  return { w: evenDown(srcW * k), h: evenDown(srcH * k) };
}

function captureArgs(source, fps) {
  const [kind, idPart] = String(source.id).split(':');
  if (IS_LINUX) {
    if (kind === 'window') {
      return { input: ['-f', 'x11grab', '-framerate', String(fps), '-draw_mouse', '1', '-window_id', String(Number(idPart)), '-i', process.env.DISPLAY], size: null };
    }
    const d = screen.getAllDisplays().find((x) => String(x.id) === String(source.display_id)) || screen.getPrimaryDisplay();
    const sf = d.scaleFactor || 1;
    const w = evenDown(Math.round(d.bounds.width * sf));
    const h = evenDown(Math.round(d.bounds.height * sf));
    const x = Math.round(d.bounds.x * sf);
    const y = Math.round(d.bounds.y * sf);
    return {
      input: ['-f', 'x11grab', '-framerate', String(fps), '-video_size', `${w}x${h}`, '-draw_mouse', '1', '-i', `${process.env.DISPLAY}+${x},${y}`],
      size: { w, h },
    };
  }
  // Windows: tela pela Desktop Duplication (na placa), janela pelo gdigrab (título)
  if (kind === 'window') {
    return { input: ['-f', 'gdigrab', '-framerate', String(fps), '-draw_mouse', '1', '-i', `title=${source.name}`], size: null, cpuFrames: true };
  }
  const displays = screen.getAllDisplays();
  const idx = Math.max(0, displays.findIndex((x) => String(x.id) === String(source.display_id)));
  const d = displays[idx] || screen.getPrimaryDisplay();
  return {
    input: ['-f', 'lavfi', '-i', `ddagrab=output_idx=${idx}:framerate=${fps}:draw_mouse=1`],
    size: { w: Math.round(d.bounds.width * (d.scaleFactor || 1)), h: Math.round(d.bounds.height * (d.scaleFactor || 1)) },
    d3d11: true,
  };
}

function buildFfmpegArgs(probeInfo, source, opts) {
  const fps = Math.max(5, Math.min(120, Number(opts.fps) || 30));
  const cap = captureArgs(source, fps);
  const target = cap.size ? fitInside(cap.size.w, cap.size.h, opts.width, opts.height) : null;
  const finalSize = target || cap.size || { w: opts.width || 1920, h: opts.height || 1080 };
  const kbps = Number(opts.bitrateKbps) > 0 ? Math.min(MAX_KBPS, Number(opts.bitrateKbps)) : autoBitrateKbps(finalSize.w, finalSize.h, fps);
  const plumb = encoderPlumbing(probeInfo.encoder, target);

  const filters = [];
  if (cap.d3d11) filters.push('hwdownload', 'format=bgra'); // Windows: traz da placa pra todos os codificadores aceitarem
  // janela: o tamanho pode ser ímpar e o codificador só aceita par — corta 1px se precisar (não reescala)
  if (!cap.size) filters.push('crop=trunc(iw/2)*2:trunc(ih/2)*2');
  if (plumb.filter) filters.push(plumb.filter);

  return {
    kbps,
    size: finalSize,
    args: ['-hide_banner', '-loglevel', 'error', ...plumb.pre, ...cap.input,
      ...(filters.length ? ['-vf', filters.join(',')] : []),
      ...ENCODERS[probeInfo.encoder](kbps, fps), // quadro-chave a cada 1s
      // repete SPS/PPS antes de cada quadro-chave: quem entra no meio consegue começar a decodificar
      '-bsf:v', 'dump_extra', '-f', 'h264', 'pipe:1'],
  };
}

// ---------------------------------------------------------------- sessão (um compartilhamento)

function createScreencast({ log, deps }) {
  let session = null; // { proc, send, onEvent }

  async function start({ source, opts, iceServers, onEvent }) {
    stop();
    opts = opts || {};
    const info = await probe(log, deps);
    if (!info.available) return { ok: false, reason: info.reason };
    const portal = info.capture === 'portal';
    const built = portal ? null : buildFfmpegArgs(info, source, opts);
    if (built) {
      log(`compartilhamento nativo: ${source.name} · ${built.size.w}x${built.size.h} · ${opts.fps} fps · ${built.kbps} kbps · ${info.encoder}`);
      log(`ffmpeg ${built.args.join(' ')}`);
    }

    const proc = spawn(helperPath(), [], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, env: childEnv() });
    const send = (msg) => { if (proc.stdin.writable) proc.stdin.write(JSON.stringify(msg) + '\n'); };
    const current = { proc, send, onEvent, ended: false, waiters: new Set() };
    session = current;

    proc.stderr.on('data', (d) => {
      const text = String(d).trim();
      if (text && !/non monotonically increasing dts|Last message repeated/.test(text)) log('[screencast] ' + text);
    });

    const ready = new Promise((resolve) => {
      const rl = readline.createInterface({ input: proc.stdout });
      rl.on('line', (line) => {
        let ev;
        try { ev = JSON.parse(line); } catch (_) { return; }
        if (ev.ev === 'ready') resolve(true);
        if (ev.ev === 'ended') current.ended = true;
        for (const w of [...current.waiters]) w(ev);
        if (session === current && current.onEvent) current.onEvent(ev);
      });
      proc.on('exit', () => {
        resolve(false);
        for (const w of [...current.waiters]) w({ ev: 'ended', reason: 'o auxiliar fechou' });
        if (!current.ended && session === current && current.onEvent) current.onEvent({ ev: 'ended', reason: 'o auxiliar fechou' });
        if (session === current) session = null;
      });
      proc.on('error', (err) => { log('auxiliar de compartilhamento falhou: ' + err.message); resolve(false); });
    });

    if (!(await ready)) return { ok: false, reason: 'o auxiliar de compartilhamento não iniciou' };

    if (!portal) {
      send({ cmd: 'start', ffmpeg: info.ffmpeg, args: built.args, iceServers: iceServers || [] });
      return { ok: true, encoder: info.encoder, encoderName: info.encoderName, hardware: info.hardware, width: built.size.w, height: built.size.h, kbps: built.kbps };
    }

    // Wayland: o auxiliar abre o seletor do sistema; só depois de escolher dá pra saber o tamanho
    const picked = await new Promise((resolve) => {
      const waiter = (ev) => {
        if (!['source', 'cancelled', 'ended', 'error'].includes(ev.ev)) return;
        current.waiters.delete(waiter);
        resolve(ev);
      };
      current.waiters.add(waiter);
      send({ cmd: 'portal', sourceTypes: 3, cursor: true });
    });
    if (picked.ev === 'cancelled') { stop(); return { ok: false, cancelled: true }; }
    if (picked.ev !== 'source' || session !== current) {
      stop();
      return { ok: false, reason: picked.message || picked.reason || 'o seletor de tela falhou' };
    }
    const gst = buildGstArgs(info, picked, opts);
    log(`compartilhamento nativo (Wayland): ${picked.sourceType === 2 ? 'janela' : 'tela'} ${picked.width}x${picked.height} → ${gst.size.w}x${gst.size.h} · ${opts.fps} fps · ${gst.kbps} kbps · ${info.encoder}`);
    log(`gst-launch-1.0 ${gst.args.join(' ')}`);
    send({ cmd: 'start', bin: info.gst, portal: true, args: gst.args, iceServers: iceServers || [] });
    return { ok: true, encoder: info.encoder, encoderName: info.encoderName, hardware: info.hardware, width: gst.size.w, height: gst.size.h, kbps: gst.kbps, sourceType: picked.sourceType };
  }

  function command(msg) {
    if (session) session.send(msg);
  }

  function stop() {
    if (!session) return;
    const s = session;
    session = null;
    s.send({ cmd: 'stop' });
    setTimeout(() => { try { s.proc.kill(); } catch (_) { /* já saiu */ } }, 1500);
  }

  return { start, command, stop, probe: () => probe(log, deps) };
}

module.exports = { createScreencast };
