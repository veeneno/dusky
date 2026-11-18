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
