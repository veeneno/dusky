// página de download (/baixar)
(function () {
  'use strict';
  const ua = navigator.userAgent;
  const isLinux = /Linux/i.test(ua) && !/Android/i.test(ua);
  const os = /Windows/i.test(ua) ? 'windows' : (isLinux ? 'appimage' : null);
  const DL_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>';
  const NAMES = { windows: 'Windows', appimage: 'Linux (AppImage)', deb: 'Linux (.deb)' };
  const HINTS = { windows: 'instalador .exe · Windows 10 e 11', appimage: 'qualquer distro · se atualiza sozinho', deb: 'Ubuntu, Debian, Mint, Pop!_OS' };
  const size = (b) => (b ? `${(b / 1024 / 1024).toFixed(0)} MB` : '');
  const date = (d) => { try { return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }); } catch (_) { return ''; } };

  // fiapos de névoa subindo (poucos: é enfeite)
  const wisps = document.getElementById('wisps');
  if (wisps && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    for (let i = 0; i < 14; i++) {
      const s = document.createElement('span');
      s.style.left = `${Math.random() * 100}%`;
      s.style.animationDuration = `${18 + Math.random() * 22}s`;
      s.style.animationDelay = `${-Math.random() * 30}s`;
      s.style.setProperty('--dx', `${(Math.random() - 0.5) * 160}px`);
      if (i % 3 === 0) { s.style.background = '#b28cff'; s.style.boxShadow = '0 0 14px 5px rgba(178,140,255,.35)'; }
      wisps.appendChild(s);
    }
  }

  function tabs(groupId, onShow) {
    const group = document.getElementById(groupId);
    const section = group.parentElement;
    function show(tab) {
      group.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
      section.querySelectorAll(':scope > .panel').forEach((p) => { p.hidden = p.dataset.panel !== tab; });
      if (onShow) onShow(tab);
    }
    group.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => show(b.dataset.tab)));
    return show;
  }
  const showInstall = tabs('installTabs');
  const showDistro = tabs('distroTabs');
  showInstall(os || 'windows');
  // distro do visitante, quando o navegador entrega (Ubuntu/Fedora costumam aparecer no user agent)
  showDistro(/Ubuntu|Debian|Mint/i.test(ua) ? 'debian' : /Fedora/i.test(ua) ? 'fedora' : 'arch');

  document.querySelectorAll('.copy').forEach((btn) => btn.addEventListener('click', async () => {
    const text = btn.parentElement.querySelector('pre').textContent;
    try { await navigator.clipboard.writeText(text); btn.textContent = 'copiado!'; } catch (_) { btn.textContent = 'selecione e copie'; }
    setTimeout(() => { btn.textContent = 'copiar'; }, 1800);
  }));

  fetch('/api/downloads').then((r) => r.json()).then((info) => {
    const main = document.getElementById('dlMain');
    const others = document.getElementById('dlOthers');
    if (info.codename && info.version) {
      const short = info.version.split('.').slice(0, 2).join('.');
      document.getElementById('badge').textContent = `${info.codename} ${short}`;
      document.getElementById('whatsNewVersion').textContent = info.version;
      document.title = `baixar o dusky — ${info.codename}`;
    }
    if (!info.version || !(info.windows || info.appimage || info.deb)) {
      main.innerHTML = '<p class="empty">O app ainda não foi publicado aqui. Enquanto isso, dá pra usar <a href="/">pelo navegador</a>.</p>';
      return;
    }
    if (info.appimage) document.getElementById('chmodCmd').textContent = `chmod +x ${info.appimage.file}`;
    if (info.deb) document.getElementById('debCmd').textContent = `sudo apt install ./${info.deb.file}`;

    const primaryKey = os && info[os] ? os : (info.windows ? 'windows' : info.appimage ? 'appimage' : 'deb');
    const primary = info[primaryKey];
    main.innerHTML = '';
    const a = document.createElement('a');
    a.className = 'btn-dl';
    a.href = primary.url;
    a.innerHTML = DL_ICON + '<span></span>';
    a.querySelector('span').textContent = `baixar pra ${NAMES[primaryKey]}`;
    const meta = document.createElement('div');
    meta.className = 'meta';
    const name = info.codename ? `dusky ${info.codename} ${info.version}` : `versão ${info.version}`;
    meta.textContent = `${name}${info.date ? ` · ${date(info.date)}` : ''} · ${size(primary.size)}`;
    main.append(a, meta);
    a.addEventListener('click', () => {
      showInstall(primaryKey);
      if (primaryKey === 'appimage') document.getElementById('linuxDeps').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    for (const key of ['windows', 'appimage', 'deb']) {
      if (key === primaryKey) continue;
      const f = info[key];
      const o = document.createElement('a');
      o.className = 'opt' + (f ? '' : ' off');
      if (f) o.href = f.url;
      o.innerHTML = '<strong></strong><span></span>';
      o.querySelector('strong').textContent = NAMES[key];
      o.querySelector('span').textContent = f ? `${HINTS[key]} · ${size(f.size)}` : 'ainda não disponível';
      o.addEventListener('click', () => showInstall(key));
      others.appendChild(o);
    }
  }).catch(() => {
    document.getElementById('dlMain').innerHTML = '<p class="empty">Não deu pra carregar. Tenta recarregar a página.</p>';
  });

  // ---------------- builds de teste ----------------
  // downloads/testes/testes.json (fora do git), escrito pelo tauri/scripts/build-testes.js. Sem ele
  // (ou sem nenhum arquivo), a seção e o link ficam escondidos.
  const TEST_HINTS = { windows: 'instalador .exe', appimage: 'qualquer distro', deb: 'Ubuntu, Debian, Mint' };
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const list = (title, items) => {
    if (!Array.isArray(items) || !items.length) return null;
    const box = el('div');
    box.appendChild(el('h3', null, title));
    const ul = el('ul');
    for (const item of items) ul.appendChild(el('li', null, String(item)));
    box.appendChild(ul);
    return box;
  };

  fetch('/downloads/testes/testes.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((t) => {
    const files = (t && t.files) || {};
    const keys = ['windows', 'appimage', 'deb'].filter((k) => files[k] && files[k].file);
    if (!t || !t.version || !keys.length) return;
    const body = document.getElementById('testBody');

    const head = el('div', 'test-head');
    head.appendChild(el('strong', null, `dusky ${t.version}`));
    const bits = [];
    if (t.pub_date) bits.push(date(t.pub_date));
    if (t.commit) bits.push(`commit ${String(t.commit).slice(0, 7)}`);
    if (bits.length) head.appendChild(el('span', null, bits.join(' · ')));
    body.appendChild(head);
    if (t.title) body.appendChild(el('p', 'test-title', t.title));

    const cols = el('div', 'test-cols');
    for (const box of [list('o que mudou', t.notes), list('o que testar', t.test)]) if (box) cols.appendChild(box);
    if (cols.children.length) body.appendChild(cols);

    const grid = el('div', 'test-files');
    // o do sistema de quem está olhando primeiro
    keys.sort((a, b) => (b === os) - (a === os));
    for (const key of keys) {
      const f = files[key];
      const a = el('a', 'opt');
      a.href = `/downloads/testes/${encodeURIComponent(f.file)}`;
      a.appendChild(el('strong', null, NAMES[key]));
      a.appendChild(el('span', null, `${TEST_HINTS[key]} · ${size(f.size)}`));
      a.addEventListener('click', () => showInstall(key));
      grid.appendChild(a);
    }
    body.appendChild(grid);

    document.getElementById('testes').hidden = false;
    document.getElementById('testLink').hidden = false;
    if (location.hash === '#testes') document.getElementById('testes').scrollIntoView({ block: 'start' });
  }).catch(() => { /* sem builds de teste: a seção fica escondida */ });
})();
