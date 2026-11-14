// Seletor de emoji (reações e caixa de mensagem) e busca por atalho (:joia:, :+1:).
// Os dados (~1900 emojis, nomes em português) vêm de /vendor/emoji/emoji-data.js, carregado só na
// primeira vez que alguém abre o seletor ou digita ":".
//
// DuskyEmoji.open({ anchor, onPick, placement })   abre o seletor perto de `anchor`
// DuskyEmoji.close()
// DuskyEmoji.search(texto, limite) -> Promise<[{ emoji, name, codes }]>
// DuskyEmoji.fromShortcode(nome) -> emoji | null    (só depois de carregado)
// DuskyEmoji.load() -> Promise
(function () {
  'use strict';

  const DATA_URL = '/vendor/emoji/emoji-data.js?v=19';
  const RECENT_KEY = 'dusky:recentEmojis';
  const TONE_KEY = 'dusky:emojiTone';
  const RECENT_MAX = 27;
  const TONES = ['', '🏻', '🏼', '🏽', '🏾', '🏿'];
  const TONE_SWATCH = ['✋', '✋🏻', '✋🏼', '✋🏽', '✋🏾', '✋🏿'];

  let data = null; // { groups, list: [[emoji, label, tags, group, skins, codes]] }
  let loading = null;
  const byCode = new Map();

  function load() {
    if (data) return Promise.resolve(data);
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = DATA_URL;
      s.onload = () => {
        data = window.DUSKY_EMOJI || window.DIDI_EMOJI; // nome antigo (arquivo velho no cache)
        for (const e of data.list) for (const c of (e[5] || '').split(' ')) if (c && !byCode.has(c)) byCode.set(c, e);
        resolve(data);
      };
      s.onerror = () => { loading = null; reject(new Error('não deu pra carregar os emojis')); };
      document.head.appendChild(s);
    });
    return loading;
  }

  const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  function getTone() {
    try { const t = Number(localStorage.getItem(TONE_KEY)); return t >= 0 && t <= 5 ? t : 0; } catch (_) { return 0; }
  }
  function setTone(t) { try { localStorage.setItem(TONE_KEY, String(t)); } catch (_) { /* ok */ } }
  const withTone = (e) => { const t = getTone(); return t && e[4] ? e[4][t - 1] : e[0]; };

  function getRecent() {
    try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []; } catch (_) { return []; }
  }
  function pushRecent(emoji) {
    const list = [emoji, ...getRecent().filter((x) => x !== emoji)].slice(0, RECENT_MAX);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch (_) { /* ok */ }
  }

  function fromShortcode(name) {
    const e = byCode.get(String(name || '').toLowerCase());
    return e ? withTone(e) : null;
  }

  // gírias brasileiras que o dicionário oficial não tem
  const ALIASES = {
    joinha: '👍', joia: '👍', like: '👍', deslike: '👎', kkk: '😂', kkkk: '😂', rs: '😆', haha: '😂',
    chorando: '😭', triste: '😢', amor: '❤️', coracao: '❤️', fogo: '🔥', top: '🔥', brabo: '🔥',
    pensando: '🤔', olhos: '👀', palmas: '👏', ok: '👌', festa: '🎉', parabens: '🎉', caveira: '💀',
    morri: '💀', sus: '🤨', nerd: '🤓', bravo: '😡', raiva: '😡', vergonha: '😳', oi: '👋', tchau: '👋',
  };

  async function search(q, limit = 8) {
    await load();
    const needle = fold(q).trim();
    if (!needle) return [];
    const scored = [];
    for (const [alias, emoji] of Object.entries(ALIASES)) {
      if (!alias.startsWith(needle)) continue;
      const e = data.list.find((x) => x[0] === emoji);
      if (e) scored.push([alias === needle ? 150 : 90, e]);
    }
    for (const e of data.list) {
      const codes = (e[5] || '').split(' ');
      const label = fold(e[1]);
      let score = -1;
      if (codes.includes(needle)) score = 100;
      else if (codes.some((c) => c.startsWith(needle))) score = 80;
      else if (label.startsWith(needle)) score = 70;
      else if (label.split(/[\s:]+/).some((w) => w.startsWith(needle))) score = 60;
      else if (fold(e[2]).split(' ').some((w) => w.startsWith(needle))) score = 40;
      else if (label.includes(needle)) score = 20;
      if (score >= 0) scored.push([score, e]);
    }
    scored.sort((a, b) => b[0] - a[0] || a[1][1].length - b[1][1].length);
    const seen = new Set();
    return scored.filter(([, e]) => !seen.has(e[0]) && seen.add(e[0])).slice(0, limit).map(([, e]) => ({ emoji: withTone(e), name: e[1], codes: (e[5] || '').split(' ').filter(Boolean) }));
  }

  // ------------------------------------------------------------------ seletor

  let root = null;
  let onPickCb = null;
  let anchorEl = null;
  let grid; let searchInput; let footerEmoji; let footerName; let tabs; let toneBtn;

  function build() {
    root = document.createElement('div');
    root.className = 'emoji-picker';
    root.hidden = true;
    root.innerHTML = `
      <div class="emoji-picker-top">
        <input type="text" class="emoji-picker-search" placeholder="buscar emoji" autocomplete="off" spellcheck="false">
        <button type="button" class="emoji-picker-tone" title="tom de pele"></button>
      </div>
      <div class="emoji-picker-tabs"></div>
      <div class="emoji-picker-grid" tabindex="-1"></div>
      <div class="emoji-picker-footer"><span class="emoji-picker-footer-emoji"></span><span class="emoji-picker-footer-name">escolha um emoji</span></div>`;
    document.body.appendChild(root);
    grid = root.querySelector('.emoji-picker-grid');
    searchInput = root.querySelector('.emoji-picker-search');
    footerEmoji = root.querySelector('.emoji-picker-footer-emoji');
    footerName = root.querySelector('.emoji-picker-footer-name');
    tabs = root.querySelector('.emoji-picker-tabs');
    toneBtn = root.querySelector('.emoji-picker-tone');

    root.addEventListener('mousedown', (e) => e.stopPropagation());
    searchInput.addEventListener('input', () => renderGrid());
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
      if (e.key === 'Enter') {
        e.preventDefault();
        const first = grid.querySelector('.emoji-picker-item');
        if (first) pick(first.dataset.emoji, e.shiftKey);
      }
    });
    toneBtn.addEventListener('click', () => {
      setTone((getTone() + 1) % TONES.length);
      toneBtn.textContent = TONE_SWATCH[getTone()];
      renderGrid();
    });
    grid.addEventListener('click', (e) => {
      const b = e.target.closest('.emoji-picker-item');
      if (b) pick(b.dataset.emoji, e.shiftKey);
    });
    grid.addEventListener('mouseover', (e) => {
      const b = e.target.closest('.emoji-picker-item');
      if (!b) return;
      footerEmoji.textContent = b.dataset.emoji;
      footerName.textContent = b.dataset.name + (b.dataset.code ? `  :${b.dataset.code}:` : '');
    });
    document.addEventListener('mousedown', (e) => { if (!root.hidden && !(anchorEl && anchorEl.contains(e.target))) close(); });
    document.addEventListener('keydown', (e) => { if (!root.hidden && e.key === 'Escape') { e.stopPropagation(); close(); } }, true);
    window.addEventListener('resize', () => { if (!root.hidden) position(); });
  }

  // shift+clique escolhe e deixa aberto (dá pra reagir com vários de uma vez)
  function pick(emoji, keepOpen) {
    pushRecent(emoji);
    const cb = onPickCb;
    if (!keepOpen) close();
    else renderGrid();
    if (cb) cb(emoji);
  }

  function item(e, emoji) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'emoji-picker-item';
    b.textContent = emoji;
    b.dataset.emoji = emoji;
    b.dataset.name = e ? e[1] : '';
    b.dataset.code = e && e[5] ? e[5].split(' ')[0] : '';
    return b;
  }

  function section(title, id) {
    const h = document.createElement('div');
    h.className = 'emoji-picker-section';
    h.textContent = title;
    if (id != null) h.dataset.group = id;
    return h;
  }

  function renderGrid() {
    grid.innerHTML = '';
    if (!data) { grid.innerHTML = '<div class="emoji-picker-empty">carregando…</div>'; return; }
    const q = searchInput.value.trim();
    tabs.hidden = !!q;
    if (q) {
      search(q, 120).then((found) => {
        if (searchInput.value.trim() !== q) return;
        grid.innerHTML = '';
        if (!found.length) { grid.innerHTML = '<div class="emoji-picker-empty">nenhum emoji com esse nome</div>'; return; }
        const wrap = document.createElement('div');
        wrap.className = 'emoji-picker-items';
        for (const f of found) {
          const e = data.list.find((x) => x[1] === f.name);
          wrap.appendChild(item(e, f.emoji));
        }
        grid.appendChild(wrap);
      });
      return;
    }
    const frag = document.createDocumentFragment();
    const recent = getRecent();
    if (recent.length) {
      frag.appendChild(section('usados recentemente', 'recent'));
      const wrap = document.createElement('div');
      wrap.className = 'emoji-picker-items';
      for (const r of recent) {
        const base = r.replace(/[\u{1F3FB}-\u{1F3FF}]/gu, '');
        wrap.appendChild(item(data.list.find((x) => x[0] === r || x[0] === base) || null, r));
      }
      frag.appendChild(wrap);
    }
    data.groups.forEach((name, gi) => {
      if (!name) return;
      const list = data.list.filter((e) => e[3] === gi);
      if (!list.length) return;
      frag.appendChild(section(name, gi));
      const wrap = document.createElement('div');
      wrap.className = 'emoji-picker-items';
      for (const e of list) wrap.appendChild(item(e, withTone(e)));
      frag.appendChild(wrap);
    });
    grid.appendChild(frag);
  }

  function renderTabs() {
    tabs.innerHTML = '';
    const icons = { recent: '🕘', 0: '😀', 1: '👋', 3: '🐶', 4: '🍕', 5: '✈️', 6: '⚽', 7: '💡', 8: '❤️', 9: '🏁' };
    const entries = [['recent', 'recentes'], ...data.groups.map((n, i) => [i, n]).filter(([, n]) => n)];
    for (const [id, name] of entries) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'emoji-picker-tab';
      b.textContent = icons[id] || '•';
      b.title = name;
      b.addEventListener('click', () => {
        const target = grid.querySelector(`.emoji-picker-section[data-group="${id}"]`);
        if (target) grid.scrollTop = target.offsetTop - grid.offsetTop;
      });
      tabs.appendChild(b);
    }
  }

  function position() {
    if (!anchorEl) return;
    const r = anchorEl.getBoundingClientRect();
    const w = root.offsetWidth; const h = root.offsetHeight;
    let top = r.top - h - 8;
    if (top < 8) top = Math.min(window.innerHeight - h - 8, r.bottom + 8);
    let left = r.right - w;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    root.style.top = `${Math.max(8, top)}px`;
    root.style.left = `${left}px`;
  }

  async function open({ anchor, onPick }) {
    if (!root) build();
    if (!root.hidden && anchorEl === anchor) { close(); return; }
    anchorEl = anchor;
    onPickCb = onPick;
    searchInput.value = '';
    toneBtn.textContent = TONE_SWATCH[getTone()];
    root.hidden = false;
    renderGrid();
    position();
    searchInput.focus();
    try {
      await load();
      if (root.hidden || anchorEl !== anchor) return;
      renderTabs();
      renderGrid();
      grid.scrollTop = 0;
      position();
    } catch (err) {
      grid.innerHTML = '<div class="emoji-picker-empty">não deu pra carregar os emojis</div>';
    }
  }

  function close() {
    if (!root || root.hidden) return;
    root.hidden = true;
    anchorEl = null;
    onPickCb = null;
  }

  function isOpen() { return !!root && !root.hidden; }

  window.DuskyEmoji = { open, close, isOpen, search, fromShortcode, load };
})();
