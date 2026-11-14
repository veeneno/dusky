// dusky — Compartilhamento de tela pela placa de vídeo (app desktop)
// Parte 20 de 28 do código do site (public/js/app/). Leia o README.md desta pasta antes de mexer.
//
// Todos os arquivos desta pasta são scripts comuns que dividem o MESMO escopo e são carregados em
// ordem pelo app.html: o que um declara no topo (const, let, function) os outros enxergam.
//
// Neste arquivo:
//   - compartilhamento de tela pela placa de vídeo (só no app desktop)

// ===================================================================
// compartilhamento de tela pela placa de vídeo (só no app desktop)
// ===================================================================
// Pelo navegador, a tela é codificada no processador UMA VEZ POR PESSOA assistindo (a call é em
// malha) — ~1 núcleo por pessoa em 1080p60, o que derrubava o fps dos jogos. No app desktop, o
// ffmpeg captura e codifica uma vez só (NVENC/AMF/QSV/VA-API) e o auxiliar dusky-screencast
// manda o mesmo vídeo pra cada um, numa conexão própria por pessoa (ver electron/screencast.js).
//
// Sinalização (pelo mesmo rtc_signal das calls):
//   quem compartilha → quem assiste:  sc-offer, sc-cand-s
//   quem assiste → quem compartilha:  sc-answer, sc-cand-v
// O áudio da tela continua pelo caminho de sempre (transceiver de áudio da tela em cada conexão).

const nativeApi = () => (window.duskyDesktop && window.duskyDesktop.screencast) || null;

// app Tauri no Linux: o "jeito normal" seria o getDisplayMedia do WebKitGTK, que abre o seletor do
// sistema e TRAVA o app (1.0.2, Wayland). Lá não existe plano B: se a placa de vídeo/GStreamer não
// der, mostra o motivo e para por aí.
function nativeScreenShareOnly() {
  const d = window.duskyDesktop;
  return !!(d && d.shell === 'tauri' && d.platform === 'linux');
}

function explainNativeUnavailable(reason) {
  toast(`não deu pra compartilhar a tela${reason ? `: ${reason}` : ''}`, 'error');
}

// a Metered manda cada servidor com "urls" em TEXTO ("turn:..."); o auxiliar (Pion) só aceita LISTA
// e recusava o comando "start" inteiro ("invalid ICEServer") — o ffmpeg nem ligava e quem assistia
// via preto. Aqui sempre vira lista.
function iceServersForHelper() {
  return (iceServers || []).map((srv) => {
    const urls = Array.isArray(srv.urls) ? srv.urls : [srv.urls];
    const out = { urls: urls.filter(Boolean).map(String) };
    if (srv.username) out.username = String(srv.username);
    if (srv.credential) out.credential = String(srv.credential);
    return out;
  }).filter((srv) => srv.urls.length);
}

// se a transmissão pela placa de vídeo não começar de verdade logo, desiste e volta pro jeito antigo
const NATIVE_START_TIMEOUT_MS = 10000;
let nativeStartTimer = null;

function abandonNativeScreenShare(why) {
  console.warn('[screencast] desistindo da placa de vídeo:', why);
  clearTimeout(nativeStartTimer);
  nativeStartTimer = null;
  stopScreenShare();
  if (nativeScreenShareOnly()) {
    explainNativeUnavailable(why);
    return;
  }
  toast('não deu pra compartilhar pela placa de vídeo — escolha a tela de novo pra ir pelo jeito normal', 'error');
  startScreenShare({ skipNative: true });
}

// quem compartilha: garante que o auxiliar esteja (ou não) mandando a tela pra essa pessoa
function syncNativeViewer(userId, want) {
  const api = nativeApi();
  if (!api || !nativeScreencast) return;
  if (nativeScreencast.viaSfu) return; // pelo servidor de mídia não tem conexão por pessoa
  const has = nativeScreencast.viewers.has(userId);
  if (want && !has) {
    nativeScreencast.viewers.add(userId);
    api.command({ cmd: 'add', viewer: String(userId), iceServers: iceServersForHelper() });
  } else if (!want && has) {
    nativeScreencast.viewers.delete(userId);
    api.command({ cmd: 'remove', viewer: String(userId) });
  }
}

// a conexão da tela com essa pessoa caiu: pede pro auxiliar refazer (ele descarta a antiga e manda
// uma oferta nova). No máximo uma vez a cada 5s por pessoa, e com credencial TURN fresca.
const nativeResyncAt = new Map();
function resyncNativeViewer(userId, why) {
  const api = nativeApi();
  if (!api || !nativeScreencast || !nativeScreencast.viewers.has(userId)) return;
  if (Date.now() - (nativeResyncAt.get(userId) || 0) < 5000) return;
  nativeResyncAt.set(userId, Date.now());
  console.warn('[screencast] refazendo a conexão da tela com', userId, '—', why);
  refreshIceServers().finally(() => {
    if (!nativeScreencast || !nativeScreencast.viewers.has(userId)) return;
    api.command({ cmd: 'add', viewer: String(userId), iceServers: iceServersForHelper() });
  });
}

// ---------- a tela pela placa de vídeo passando pelo servidor de mídia ----------
// Com a call no servidor de mídia (ver 21-call-sfu.js) e o app na versão 0.5.2 ou mais nova, o
// auxiliar entra na sala como "tela-<meu id>" e publica o vídeo lá: sai UMA cópia do meu PC e o
// servidor distribui. Se não der (app antigo, servidor de mídia fora), vale o jeito de sempre: uma
// conexão direta do auxiliar com cada pessoa (syncNativeViewer).

async function publishNativeToSfu() {
  const api = nativeApi();
  const share = nativeScreencast;
  if (!api || !share || !share.sfuCapable || !sfu || !voiceChannel) return false;
  try {
    const res = await fetch(`/api/rtc/sfu?channelId=${voiceChannel.id}&screen=1`);
    const info = res.ok ? await res.json() : null;
    if (!info || !info.enabled || nativeScreencast !== share) return false;
    share.viaSfu = true;
    api.command({ cmd: 'publish', path: info.path, token: info.token, width: share.width, height: share.height });
    return true;
  } catch (_) {
    return false;
  }
}

// não deu pelo servidor de mídia: liga o auxiliar direto em cada pessoa que está assistindo
function fallbackNativeToViewers(why) {
  if (!nativeScreencast || !nativeScreencast.viaSfu) return;
  console.warn('[screencast] tela pelo servidor de mídia indisponível, indo direto pra cada pessoa:', why);
  nativeScreencast.viaSfu = false;
  const api = nativeApi();
  if (api) api.command({ cmd: 'unpublish' });
  for (const peer of peers.values()) applyScreenSendersToPeer(peer);
}

let nativeSfuRetryTimer = null;
function retryNativeSfuPublish() {
  clearTimeout(nativeSfuRetryTimer);
  const share = nativeScreencast;
  nativeSfuRetryTimer = setTimeout(async () => {
    if (nativeScreencast !== share || !share.viaSfu) return;
    if (!(await publishNativeToSfu())) retryNativeSfuPublish(); // o servidor de mídia ainda não voltou
  }, 3000);
}

// eventos do auxiliar (ofertas pra cada pessoa, estatísticas, fim)
function handleNativeScreencastEvent(ev) {
  if (!ev || !nativeScreencast) return;
  if (ev.ev === 'published') { console.log('[screencast] tela publicada no servidor de mídia'); return; }
  if (ev.ev === 'sfu') {
    // caiu de vez: pede pra publicar de novo (com ingresso novo) até voltar
    if (ev.state === 'disconnected' && nativeScreencast.viaSfu) retryNativeSfuPublish();
    return;
  }
  if (ev.ev === 'error' && ev.sfu) { fallbackNativeToViewers(ev.message); return; }
  const to = Number(ev.viewer);
  if (ev.ev === 'offer' && to) {
    Realtime.send('rtc_signal', { to, data: { kind: 'sc-offer', sdp: ev.sdp } });
  } else if (ev.ev === 'candidate' && to) {
    Realtime.send('rtc_signal', { to, data: { kind: 'sc-cand-s', candidate: ev.candidate } });
  } else if (ev.ev === 'state' && to) {
    if (ev.state === 'failed') resyncNativeViewer(to, 'a conexão caiu');
  } else if (ev.ev === 'started') {
    nativeScreencast.started = true;
    clearTimeout(nativeStartTimer);
    nativeStartTimer = null;
  } else if (ev.ev === 'stats') {
    nativeScreencast.stats = ev;
    updateNativeScreencastBadge();
  } else if (ev.ev === 'ended' && !nativeScreencast.started) {
    // morreu antes do primeiro quadro (captura falhou, comando recusado...)
    abandonNativeScreenShare(ev.reason || 'terminou antes de começar');
  } else if (ev.ev === 'ended') {
    // parou sozinho (ffmpeg caiu, janela fechada...) — se fomos nós que paramos, nativeScreencast já é null
    const reason = ev.reason || '';
    stopScreenShare();
    toast(`o compartilhamento de tela parou${reason ? ` (${reason})` : ''}`, 'error');
  } else if (ev.ev === 'error') {
    console.warn('[screencast]', ev.message);
    // erro antes do primeiro quadro = não vai funcionar; depois disso, costuma ser só de uma pessoa
    if (!nativeScreencast.started && !ev.viewer) abandonNativeScreenShare(ev.message);
  }
}

let nativeEventsWired = false;
function wireNativeScreencastEvents() {
  const api = nativeApi();
  if (!api || nativeEventsWired) return;
  nativeEventsWired = true;
  api.onEvent(handleNativeScreencastEvent);
}

function updateNativeScreencastBadge() {
  const el = callScreenShareArea.querySelector('.native-screencast-stats');
  if (!el || !nativeScreencast) return;
  const st = nativeScreencast.stats;
  const viewers = nativeScreencast.viewers.size;
  const parts = [];
  if (nativeScreencast.width) parts.push(`${nativeScreencast.width}\u00d7${nativeScreencast.height}`);
  if (st) parts.push(`${Math.round(st.fps)} fps`, st.kbps >= 1000 ? `${(st.kbps / 1000).toFixed(1)} Mbps` : `${st.kbps} kbps`);
  parts.push(nativeScreencast.viaSfu ? 'pelo servidor de mídia' : viewers === 1 ? '1 pessoa assistindo' : `${viewers} pessoas assistindo`);
  el.textContent = parts.join(' · ');
}

// tenta compartilhar pela placa de vídeo. Devolve 'started' | 'cancelled' | 'fallback' (usar o jeito antigo)
async function startNativeScreenShare({ fps, width, height, wantAudio }) {
  const api = nativeApi();
  if (!api) return 'fallback';
  let info;
  try { info = await api.available(); } catch (err) {
    if (nativeScreenShareOnly()) { explainNativeUnavailable(String((err && err.message) || err || '')); return 'cancelled'; }
    return 'fallback';
  }
  if (!info || !info.available) {
    if (nativeScreenShareOnly()) {
      const downloading = info && info.deps && info.deps.state === 'downloading';
      explainNativeUnavailable(downloading
        ? `baixando o componente de compartilhamento (${Math.round((info.deps.progress || 0) * 100)}%) — tente de novo em instantes`
        : (info && info.reason) || 'compartilhamento indisponível neste computador');
      return 'cancelled';
    }
    if (info && info.deps && info.deps.state === 'downloading') {
      toast(`baixando o componente de compartilhamento pela placa de vídeo (${Math.round((info.deps.progress || 0) * 100)}%) — por enquanto vai pelo jeito normal`);
    }
    return 'fallback';
  }
  wireNativeScreencastEvents();
  const res = await api.start({ fps, width, height, bitrateKbps: getSavedScreenBitrateKbps(), iceServers: iceServersForHelper(), audioRequested: wantAudio });
  if (!res || res.cancelled) return 'cancelled';
  if (!res.ok) {
    console.warn('[screencast] não deu pra usar a placa de vídeo:', res.reason);
    if (nativeScreenShareOnly()) { explainNativeUnavailable(res.reason); return 'cancelled'; }
    toast('não deu pra compartilhar pela placa de vídeo — indo pelo jeito normal', 'error');
    return 'fallback';
  }

  nativeScreencast = { encoderName: res.encoderName, hardware: res.hardware, width: res.width, height: res.height, viewers: new Set(), sfuCapable: !!info.sfu, viaSfu: false, stats: null, started: false };
  clearTimeout(nativeStartTimer);
  nativeStartTimer = setTimeout(() => {
    if (nativeScreencast && !nativeScreencast.started) abandonNativeScreenShare('nenhum quadro em 10s');
  }, NATIVE_START_TIMEOUT_MS);
  screenOn = true;
  setScreenButtonsLive(true);
  for (const peer of peers.values()) peer.wantsMyScreen = true;
  // call no servidor de mídia: a tela sai uma vez só, por ele (senão, direto pra cada pessoa)
  await publishNativeToSfu();

  // o som da tela vai pelo caminho de sempre (o main.js já preparou a captura pra fonte escolhida)
  localScreenAudioTrack = null;
  if (wantAudio && window.duskyDesktop.getScreenAudioPlan) {
    try {
      const plan = await window.duskyDesktop.getScreenAudioPlan();
      if (plan && plan.mode === 'pcm') localScreenAudioTrack = await capturePcmAudioTrack(plan);
    } catch (err) {
      console.warn('[screencast] sem som da tela:', err);
    }
  }
  await Promise.all([...peers.values()].map(applyScreenSendersToPeer));
  sfuSyncScreen();
  renderCallParticipants();
  syncLocalVoiceState();
  return 'started';
}

// quem assiste: a conexão que recebe a tela de quem compartilha pela placa de vídeo
function closeScreencastPc(peer) {
  if (!peer || !peer.scPc) return;
  try { peer.scPc.close(); } catch (_) { /* já fechada */ }
  peer.scPc = null;
  peer.scPending = [];
  peer.scDisplayStream = null;
  screenStatsPrev.delete(`in:${peer.userId}`);
}

async function handleScreencastSignal(from, data) {
  const peer = peers.get(from);
  if (data.kind === 'sc-offer') {
    if (!peer) return; // não estou na call com essa pessoa
    closeScreencastPc(peer);
    const pc = new RTCPeerConnection({ iceServers });
    peer.scPc = pc;
    peer.scPending = [];
    pc.ontrack = (ev) => {
      if (peer.scPc !== pc || ev.track.kind !== 'video') return;
      // mesmo <video> com o som da tela (que continua chegando pela conexão normal)
      peer.scDisplayStream = new MediaStream([ev.track, ...peer.screenAudioStream.getAudioTracks()]);
      ev.track.addEventListener('ended', () => renderCallParticipants());
      renderCallParticipants();
    };
    pc.onicecandidate = (e) => {
      if (e.candidate && peer.scPc === pc) Realtime.send('rtc_signal', { to: from, data: { kind: 'sc-cand-v', candidate: e.candidate } });
    };
    // caiu (rede trocou, TURN venceu...): pede pra quem compartilha mandar a tela de novo — antes
    // ficava tela preta/congelada até parar e voltar a assistir
    pc.onconnectionstatechange = () => {
      if (peer.scPc === pc && pc.connectionState === 'failed') {
        Realtime.send('rtc_signal', { to: from, data: { kind: 'sc-retry' } });
      }
    };
    await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    Realtime.send('rtc_signal', { to: from, data: { kind: 'sc-answer', sdp: pc.localDescription } });
    for (const c of peer.scPending.splice(0)) await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
  } else if (data.kind === 'sc-cand-s') {
    if (!peer || !peer.scPc) return;
    if (!peer.scPc.remoteDescription) peer.scPending.push(data.candidate);
    else await peer.scPc.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(() => {});
  } else if (data.kind === 'sc-retry') {
    resyncNativeViewer(from, 'quem assiste pediu');
  } else if (data.kind === 'sc-answer' || data.kind === 'sc-cand-v') {
    // eu sou quem compartilha: repassa pro auxiliar
    const api = nativeApi();
    if (!api || !nativeScreencast || !nativeScreencast.viewers.has(from)) return;
    if (data.kind === 'sc-answer') api.command({ cmd: 'answer', viewer: String(from), sdp: data.sdp });
    else api.command({ cmd: 'candidate', viewer: String(from), candidate: data.candidate });
  }
}
