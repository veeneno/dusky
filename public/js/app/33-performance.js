// dusky — Aba "desempenho" das configurações (app desktop)
// Parte 33 de 33 do código do site (public/js/app/). Leia o README.md desta pasta antes de mexer.
//
// Neste arquivo:
//   - quanto cada processo do dusky está usando de processador, memória e placa de vídeo
//
// Os números vêm do app (tauri/src-tauri/src/perf.rs → window.duskyDesktop.perfSnapshot): o app em
// Rust e todos os processos que ele abriu — o motor das páginas (WebKitGTK no Linux, WebView2 no
// Windows), o auxiliar de tela (dusky-screencast), o ffmpeg/GStreamer da captura, o som da tela…
// Só aparece no app desktop novo (no navegador e no app antigo a aba fica escondida). Atualiza a
// cada 2 s, e só enquanto a aba está aberta e a janela visível — fora disso não mede nada.

const PERF_REFRESH_MS = 2000;
let perfTimer = null;
let perfRunning = false;
let perfBusy = false;

function perfApi() {
  const d = window.duskyDesktop;
  return d && typeof d.perfSnapshot === 'function' ? d : null;
}

// aba só existe no app que sabe medir
(function setupPerfTab() {
  const btn = settingsTabs.querySelector('[data-settings-tab="desempenho"]');
  if (btn) btn.hidden = !perfApi();
})();

// ---------- uso de memória: 3 modos (o app reinicia pra trocar) ----------
// O que cada um faz de verdade está em tauri/src-tauri/src/webview_setup.rs (MemoryMode). Aqui o
// texto pra pessoa: o que muda, o que melhora e o que piora — e, em letra menor, o que é por dentro.
const PERF_MEMORY_MODES = [
  {
    id: 'alto', title: 'alto desempenho', tag: 'como era antes',
    what: 'Guarda bastante coisa na memória (imagens e partes do site que já saíram da tela) e só começa a liberar quando o computador estiver ficando sem memória.',
    good: 'trocar de canal e voltar pra conversas que você já abriu é o mais rápido possível; quase nada precisa ser recarregado.',
    bad: 'é o que mais usa memória, e o uso vai crescendo com o tempo que o app fica aberto.',
    linux: 'cache do WebKit no modo "navegador" (até 128 MB, segurando por 60 s o que saiu da tela) e 1 GB de cache em disco; limpeza só perto de 1/3 da RAM do PC.',
    win: 'WebView2 no modo normal o tempo todo.',
  },
  {
    id: 'equilibrado', title: 'equilibrado', tag: 'recomendado',
    what: 'Guarda só um pouco do que saiu da tela e começa a limpar a memória quando o site passa de uns 320 MB.',
    good: 'usa menos memória, principalmente depois de horas com o app aberto; no dia a dia a diferença de velocidade é pequena.',
    bad: 'voltar pra um canal que você não abria há um tempo pode recarregar algumas imagens (do disco, é rápido).',
    linux: 'cache do WebKit no modo "documentos" (até 96 MB, 75 MB em disco); limpeza a partir de ~320 MB e limpeza de tudo que dá a partir de ~480 MB.',
    win: 'normal com a janela aberta; quando o app vai pra bandeja, o WebView2 devolve memória pro sistema.',
  },
  {
    id: 'minimo', title: 'mínimo', tag: 'menos memória possível',
    what: 'Limpa a memória sempre que dá: a partir de uns 130 MB no site, conferindo a cada 5 segundos.',
    good: 'o menor uso de memória com o app aberto — bom pra PC com pouca RAM ou pra jogar com o app aberto do lado.',
    bad: 'usa mais processador (as limpezas são frequentes), imagens e emojis recarregam mais vezes, e rolar o chat ou trocar de canal pode dar umas engasgadas.',
    linux: 'cache do WebKit no modo "documentos"; limpeza a partir de ~130 MB e de tudo que dá a partir de ~190 MB, conferindo a cada 5 s.',
    win: 'o WebView2 fica no modo de economia de memória o tempo todo (a Microsoft avisa que isso pode deixar a janela mais lenta).',
  },
];

function perfMemoryModeCurrent() {
  const info = window.duskyDesktop && window.duskyDesktop.appInfo;
  return (info && info.gpu && info.gpu.memoryMode) || null;
}

// cartões de escolha (um rádio por opção) com "melhora / afeta / por dentro" — modos de memória e
// efeitos de perfil usam o mesmo desenho (.perf-mode, settings.css)
function perfOptionCards(box, name, options, current, techOf) {
  box.replaceChildren(...options.map((m) => {
    const label = document.createElement('label');
    label.className = `perf-mode${m.id === current ? ' is-current' : ''}`;
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = name;
    input.value = m.id;
    input.checked = m.id === current;
    const body = document.createElement('span');
    body.className = 'perf-mode-body';
    const head = document.createElement('span');
    head.className = 'perf-mode-head';
    const title = document.createElement('strong');
    title.textContent = m.title;
    const tag = document.createElement('span');
    tag.className = 'perf-mode-tag';
    tag.textContent = m.id === current ? `${m.tag} · em uso agora` : m.tag;
    head.append(title, tag);
    const what = document.createElement('span');
    what.className = 'perf-mode-what';
    what.textContent = m.what;
    const list = document.createElement('ul');
    const rows = [['melhora:', m.good, ''], ['afeta:', m.bad, '']];
    const tech = techOf ? techOf(m) : null;
    if (tech) rows.push(tech.concat('perf-mode-tech'));
    for (const [label2, text, cls] of rows) {
      const li = document.createElement('li');
      if (cls) li.className = cls;
      const b = document.createElement('b');
      b.textContent = `${label2} `;
      li.append(b, document.createTextNode(text));
      list.appendChild(li);
    }
    body.append(head, what, list);
    label.append(input, body);
    return label;
  }));
}

function renderPerfMemoryModes() {
  const section = document.getElementById('perfModesSection');
  const box = document.getElementById('perfModes');
  const d = window.duskyDesktop;
  const current = perfMemoryModeCurrent();
  // app antigo (sem os modos): a seção fica escondida
  const supported = !!(d && typeof d.setMemoryMode === 'function' && current);
  if (section) section.hidden = !supported;
  if (!box || !supported) return;
  const win = d.platform === 'win32';
  perfOptionCards(box, 'perfMemoryMode', PERF_MEMORY_MODES, current,
    (m) => [win ? 'por dentro (Windows):' : 'por dentro (Linux):', win ? m.win : m.linux]);
}

document.getElementById('perfModes').addEventListener('change', (e) => {
  const input = e.target.closest('input[name="perfMemoryMode"]');
  const d = window.duskyDesktop;
  if (!input || !d || typeof d.setMemoryMode !== 'function') return;
  const current = perfMemoryModeCurrent();
  const mode = PERF_MEMORY_MODES.find((m) => m.id === input.value);
  if (!mode || mode.id === current) return;
  const inCall = typeof inVoiceCallForSettings === 'function' && inVoiceCallForSettings();
  if (!confirm(`Trocar o uso de memória pra "${mode.title}"? O app reinicia agora${inCall ? ' (e sai da call)' : ''}.`)) {
    renderPerfMemoryModes(); // volta a marcar o que está em uso
    return;
  }
  d.setMemoryMode(mode.id);
});

function perfFmtPercent(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${v.toLocaleString('pt-BR', { minimumFractionDigits: v < 10 ? 1 : 0, maximumFractionDigits: v < 10 ? 1 : 0 })}%`;
}

function perfFmtBytes(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  const mb = v / 1024 / 1024;
  if (mb < 1024) return `${mb.toLocaleString('pt-BR', { maximumFractionDigits: mb < 10 ? 1 : 0 })} MB`;
  return `${(mb / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} GB`;
}

function perfSum(list, key) {
  let total = null;
  for (const p of list) if (p[key] != null && Number.isFinite(p[key])) total = (total || 0) + p[key];
  return total;
}

// um quadrinho do resumo: título, número grande, detalhe e uma barra (0–100)
function perfTile(title, value, detail, fraction) {
  const tile = document.createElement('div');
  tile.className = 'perf-tile';
  const t = document.createElement('span');
  t.className = 'perf-tile-title';
  t.textContent = title;
  const v = document.createElement('strong');
  v.className = 'perf-tile-value';
  v.textContent = value;
  const d = document.createElement('span');
  d.className = 'perf-tile-detail';
  d.textContent = detail;
  tile.append(t, v, d);
  if (fraction != null && Number.isFinite(fraction)) {
    const bar = document.createElement('span');
    bar.className = 'perf-bar';
    const fill = document.createElement('span');
    fill.style.width = `${Math.max(0, Math.min(100, fraction * 100)).toFixed(1)}%`;
    bar.appendChild(fill);
    tile.appendChild(bar);
  }
  return tile;
}

// profundidade de cada processo na árvore (o app é a raiz): pra recuar os filhos na tabela
function perfDepths(list) {
  const byPid = new Map(list.map((p) => [p.pid, p]));
  const depth = new Map();
  const of = (p, guard = 0) => {
    if (depth.has(p.pid)) return depth.get(p.pid);
    const parent = byPid.get(p.ppid);
    const d = parent && parent !== p && guard < 20 ? of(parent, guard + 1) + 1 : 0;
    depth.set(p.pid, d);
    return d;
  };
  for (const p of list) of(p);
  return depth;
}

function renderPerfSnapshot(snap) {
  const list = (snap && snap.processes) || [];
  const summary = document.getElementById('perfSummary');
  const body = document.getElementById('perfTableBody');
  const foot = document.getElementById('perfFoot');
  if (!summary || !body) return;

  const cpu = perfSum(list, 'cpuPercent');
  const mem = perfSum(list, 'memoryBytes');
  const gpu = perfSum(list, 'gpuPercent');
  const vram = perfSum(list, 'gpuMemoryBytes');
  const totalMem = snap.totalMemoryBytes;
  summary.replaceChildren(
    perfTile('processador', perfFmtPercent(cpu), `do computador todo (${snap.cpus} ${snap.cpus === 1 ? 'núcleo' : 'núcleos'})`, cpu != null ? cpu / 100 : null),
    perfTile('memória', perfFmtBytes(mem), totalMem ? `de ${perfFmtBytes(totalMem)} no computador` : 'RAM', mem != null && totalMem ? mem / totalMem : null),
    perfTile('placa de vídeo', snap.gpuSource ? perfFmtPercent(gpu != null ? Math.min(100, gpu) : null) : '—', snap.gpuSource ? 'uso (soma dos processos)' : 'sem medição', gpu != null ? Math.min(100, gpu) / 100 : null),
    perfTile('memória da placa', perfFmtBytes(vram), 'dedicada (VRAM)', null),
  );

  const depth = perfDepths(list);
  const rows = list.map((p) => {
    const tr = document.createElement('tr');
    const name = document.createElement('td');
    name.className = 'perf-name';
    name.style.paddingLeft = `${12 + Math.min(depth.get(p.pid) || 0, 6) * 16}px`;
    const role = document.createElement('strong');
    role.textContent = p.role || 'processo do dusky';
    const exe = document.createElement('small');
    exe.textContent = `${p.name || '?'} · pid ${p.pid}`;
    name.append(role, exe);
    tr.appendChild(name);
    for (const [value, heavy] of [
      [perfFmtPercent(p.cpuPercent), p.cpuPercent >= 25],
      [perfFmtBytes(p.memoryBytes), p.memoryBytes >= 1024 * 1024 * 1024],
      [perfFmtPercent(p.gpuPercent), p.gpuPercent >= 50],
      [perfFmtBytes(p.gpuMemoryBytes), false],
    ]) {
      const td = document.createElement('td');
      td.className = `perf-num${heavy ? ' is-heavy' : ''}`;
      td.textContent = value;
      tr.appendChild(td);
    }
    return tr;
  });
  if (!rows.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 5;
    td.className = 'perf-empty';
    td.textContent = 'nenhum processo encontrado';
    tr.appendChild(td);
    rows.push(tr);
  }
  body.replaceChildren(...rows);

  const notes = [];
  notes.push(`processador: % do computador inteiro (todos os núcleos = 100%). memória: ${snap.memoryKind === 'PSS' ? 'PSS (a memória dividida com outros processos conta só a parte de cada um)' : 'privada (a mesma do Gerenciador de Tarefas)'}.`);
  if (snap.gpuSource) notes.push(`placa de vídeo: o motor mais ocupado de cada processo (3D, codificador de vídeo…), lido de ${snap.gpuSource}.`);
  if (snap.gpuNote) notes.push(`placa de vídeo: ${snap.gpuNote}.`);
  if (foot) foot.textContent = notes.join(' ');
}

async function perfTick() {
  if (!perfRunning) return;
  const api = perfApi();
  const panel = settingsModalBackdrop.querySelector('.settings-tab-panel[data-settings-panel="desempenho"]');
  // janela minimizada/escondida ou aba fechada: não mede (volta a medir quando aparecer)
  if (api && panel && !panel.hidden && !settingsModalBackdrop.hidden && !document.hidden && !perfBusy) {
    perfBusy = true;
    try {
      renderPerfSnapshot(await api.perfSnapshot());
    } catch (err) {
      const foot = document.getElementById('perfFoot');
      if (foot) foot.textContent = `não consegui medir agora: ${(err && err.message) || err}`;
    } finally {
      perfBusy = false;
    }
  }
  if (perfRunning) perfTimer = setTimeout(perfTick, PERF_REFRESH_MS);
}

// chamado pelo switchSettingsTab (17-settings.js) ao abrir a aba, e ao trocar de aba/fechar
function startPerfPanel() {
  renderPerfMemoryModes();
  if (perfRunning || !perfApi()) return;
  perfRunning = true;
  clearTimeout(perfTimer);
  perfTick();
}

function stopPerfPanel() {
  perfRunning = false;
  clearTimeout(perfTimer);
  perfTimer = null;
}

// ---------- efeitos de perfil: quando animam (aba "acessibilidade") ----------
// O CSS de cada modo está no fim do profile.css. Vale no site e no app (não precisa reiniciar).
const FX_MOTION_OPTIONS = [
  {
    id: 'always', title: 'sempre', tag: 'como era antes',
    what: 'Todos os efeitos (nome, moldura do avatar, placa do nome) animam o tempo todo: no chat, na lista de membros, nas conversas e no perfil.',
    good: 'o app fica do jeito mais vivo, com tudo se mexendo.',
    bad: 'é o que mais pesa: com vários efeitos na tela o app pode gastar até um núcleo inteiro do processador mesmo parado (medido), e o tema de vidro deixa ainda mais pesado.',
  },
  {
    id: 'hover', title: 'ao passar o mouse', tag: 'recomendado',
    what: 'No chat, na lista de membros, nas conversas e na call, o efeito aparece parado e anima quando você passa o mouse na pessoa. No cartão de perfil e no editor de perfil, anima sempre.',
    good: 'o app parado quase não gasta processador, e os efeitos continuam aparecendo (com cor, moldura e placa).',
    bad: 'na lista e no chat você só vê o movimento quando passa o mouse.',
  },
  {
    id: 'off', title: 'nunca', tag: 'o mais leve',
    what: 'Os efeitos aparecem parados em todo lugar, inclusive no perfil. As cores, molduras e placas continuam, só não se mexem.',
    good: 'o mais leve possível pro processador.',
    bad: 'nenhum efeito se mexe, nem no seu perfil.',
  },
];

function renderFxMotionOptions() {
  const box = document.getElementById('prefFxMotionGroup');
  if (!box) return;
  perfOptionCards(box, 'prefFxMotion', FX_MOTION_OPTIONS, getPref('prefFxMotion'), null);
}

document.getElementById('prefFxMotionGroup').addEventListener('change', (e) => {
  const input = e.target.closest('input[name="prefFxMotion"]');
  if (!input) return;
  setPref('prefFxMotion', input.value);
  renderFxMotionOptions();
});
