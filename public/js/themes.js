// Temas do dusky: cada pessoa monta o seu (cores, vidro/transparência, imagem de fundo, fonte,
// cantos, densidade e até CSS próprio). O tema fica salvo na conta (vale no navegador e no app) e
// também no navegador, pra já abrir com ele sem piscar o tema padrão.
//
// DuskyTheme.apply(tema)            aplica na hora (variáveis CSS no <html>)
// DuskyTheme.boot()                 aplica o tema guardado no navegador (chamado no <head>)
// DuskyTheme.load()                 busca o tema da conta e aplica
// DuskyTheme.mountEditor(el, ctx)   monta o editor (aba "aparência" das configurações)
(function () {
  'use strict';

  const CACHE_KEY = 'dusky:theme';
  const VERSION = 1;
  const CODE_PREFIX = 'dusky-tema:';
  const MAX_CSS = 20000;

  // ------------------------------------------------------------------ temas prontos

  const BASE = {
    v: VERSION,
    name: 'Discord escuro',
    colors: {
      accent: '#5865f2',
      accentText: '#ffffff',
      bgApp: '#1e1f22',
      bgSidebar: '#2b2d31',
      bgChat: '#313338',
      bgInput: '#383a40',
      bgFloating: '#111214',
      textHeading: '#f2f3f5',
      textNormal: '#dbdee1',
      textMuted: '#949ba4',
      textFaint: '#6d6f78',
      link: '#00a8fc',
      success: '#23a55a',
      danger: '#f23f43',
      mention: '#f0b232',
    },
    glass: { opacity: 100, blur: 0, saturate: 100 },
    background: { image: '', gradient: '', blur: 0, dim: 40 },
    text: { font: 'Inter', heading: 'same', size: 16 },
    shape: { radius: 8, avatar: 'circle' },
    layout: { density: 'cozy' },
    css: '',
  };

  const PRESETS = [
    BASE,
    {
      name: 'Meia-noite',
      colors: { ...BASE.colors, bgApp: '#000000', bgSidebar: '#0b0b0d', bgChat: '#111113', bgInput: '#1c1c20', bgFloating: '#000000', accent: '#7c8cff' },
    },
    {
      name: 'Claro',
      colors: {
        accent: '#5865f2', accentText: '#ffffff', bgApp: '#e3e5e8', bgSidebar: '#f2f3f5', bgChat: '#ffffff', bgInput: '#ebedef',
        bgFloating: '#ffffff', textHeading: '#060607', textNormal: '#313338', textMuted: '#5c5e66', textFaint: '#80848e',
        link: '#006ce7', success: '#1a8d4a', danger: '#da373c', mention: '#c88c00',
      },
    },
    {
      name: 'Vidro',
      colors: { ...BASE.colors, accent: '#8b7bff', bgApp: '#0f1020', bgSidebar: '#16182c', bgChat: '#1b1d34', bgInput: '#26284a', bgFloating: '#121327', textNormal: '#e6e7f5', textMuted: '#a3a6c7' },
      glass: { opacity: 45, blur: 26, saturate: 150 },
      background: {
        image: '', blur: 0, dim: 15,
        gradient: 'radial-gradient(circle at 15% 20%, #6d4cff 0%, transparent 42%), radial-gradient(circle at 85% 30%, #ff4fa3 0%, transparent 38%), radial-gradient(circle at 60% 85%, #00c2ff 0%, transparent 45%), linear-gradient(135deg, #12122a, #1d0f2e)',
      },
      shape: { radius: 14, avatar: 'circle' },
    },
    {
      name: 'Ametista',
      colors: {
        accent: '#a855f7', accentText: '#120a1c', bgApp: '#050406', bgSidebar: '#0a0810', bgChat: '#0d0b14', bgInput: '#131019',
        bgFloating: '#1c1826', textHeading: '#f1e9fb', textNormal: '#d7cde8', textMuted: '#9a8fb0', textFaint: '#5c5470',
        link: '#c58bff', success: '#7cd9a0', danger: '#ff8f66', mention: '#ffb86b',
      },
      text: { font: 'Inter', heading: 'Fraunces', size: 16 },
      shape: { radius: 10, avatar: 'circle' },
    },
    {
      name: 'Neon',
      colors: {
        accent: '#00f0ff', accentText: '#00161a', bgApp: '#05060a', bgSidebar: '#0a0c14', bgChat: '#0d1019', bgInput: '#151a28',
        bgFloating: '#080a12', textHeading: '#ffffff', textNormal: '#d6e3ff', textMuted: '#7f8db3', textFaint: '#4c5677',
        link: '#ff3df5', success: '#39ff88', danger: '#ff3d71', mention: '#ffe600',
      },
      glass: { opacity: 90, blur: 10, saturate: 140 },
      background: { image: '', blur: 0, dim: 0, gradient: 'radial-gradient(circle at 80% 0%, rgba(255, 61, 245, 0.35), transparent 40%), radial-gradient(circle at 0% 100%, rgba(0, 240, 255, 0.3), transparent 45%), #05060a' },
      text: { font: 'Space Grotesk', heading: 'same', size: 16 },
      shape: { radius: 4, avatar: 'squircle' },
    },
    {
      name: 'Café',
      colors: {
        accent: '#d4915d', accentText: '#1a0f08', bgApp: '#1a1411', bgSidebar: '#231b17', bgChat: '#2a211c', bgInput: '#352a24',
        bgFloating: '#140f0c', textHeading: '#f6ead9', textNormal: '#e3d3c0', textMuted: '#a8927d', textFaint: '#6f5e50',
        link: '#e8b07a', success: '#8fbf6a', danger: '#e2604f', mention: '#e8c15a',
      },
      text: { font: 'Nunito', heading: 'same', size: 16 },
      shape: { radius: 12, avatar: 'circle' },
    },
    {
      name: 'Floresta',
      colors: {
        accent: '#3fbf7f', accentText: '#04140b', bgApp: '#0e1512', bgSidebar: '#131d18', bgChat: '#17231d', bgInput: '#203029',
        bgFloating: '#0a110e', textHeading: '#eaf7ef', textNormal: '#cfe3d7', textMuted: '#8aa597', textFaint: '#566b60',
        link: '#7fd6a8', success: '#3fbf7f', danger: '#f0705a', mention: '#e0c341',
      },
    },
  ];

  // fontes que dá pra escolher (carregadas do Google Fonts só quando usadas)
  const FONTS = {
    Inter: 'Inter:wght@400;500;600;700;800',
    'Noto Sans': 'Noto+Sans:wght@400;500;600;700;800',
    Nunito: 'Nunito:wght@400;500;600;700;800',
    Rubik: 'Rubik:wght@400;500;600;700;800',
    'Space Grotesk': 'Space+Grotesk:wght@400;500;600;700',
    'Plus Jakarta Sans': 'Plus+Jakarta+Sans:wght@400;500;600;700;800',
    Outfit: 'Outfit:wght@400;500;600;700;800',
    'JetBrains Mono': 'JetBrains+Mono:wght@400;500;600;700;800',
    Fraunces: 'Fraunces:wght@500;600;700',
    'Comic Neue': 'Comic+Neue:wght@400;700',
    'Times New Roman': null, // fonte do próprio computador, não vem do Google Fonts
    'Sistema': null,
  };

  const BG_GRADIENTS = [
    ['aurora', 'radial-gradient(circle at 15% 20%, #6d4cff 0%, transparent 42%), radial-gradient(circle at 85% 30%, #ff4fa3 0%, transparent 38%), radial-gradient(circle at 60% 85%, #00c2ff 0%, transparent 45%), linear-gradient(135deg, #12122a, #1d0f2e)'],
    ['pôr do sol', 'linear-gradient(160deg, #2b1055 0%, #7597de 45%, #ff9a8b 75%, #ffd3a5 100%)'],
    ['oceano', 'radial-gradient(circle at 30% 30%, #1e90ff 0%, transparent 50%), radial-gradient(circle at 80% 70%, #00e0b0 0%, transparent 45%), linear-gradient(180deg, #021027, #06243f)'],
    ['lava', 'radial-gradient(circle at 20% 80%, #ff3d00 0%, transparent 45%), radial-gradient(circle at 80% 20%, #ffb300 0%, transparent 40%), linear-gradient(135deg, #1a0500, #3d0b00)'],
    ['mata', 'radial-gradient(circle at 70% 20%, #3fbf7f 0%, transparent 40%), radial-gradient(circle at 20% 80%, #1b5e20 0%, transparent 50%), linear-gradient(135deg, #07140d, #0f2a1b)'],
    ['rosa', 'radial-gradient(circle at 25% 25%, #ff7eb3 0%, transparent 45%), radial-gradient(circle at 75% 75%, #7a5cff 0%, transparent 45%), linear-gradient(135deg, #2a0f2e, #1a1030)'],
  ];

  // ------------------------------------------------------------------ utilidades

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, Number.isFinite(+n) ? +n : a)); }
  function isHex(s) { return typeof s === 'string' && /^#[0-9a-f]{6}$/i.test(s); }

  // completa um tema com os valores padrão e corrige qualquer coisa fora do lugar (tema importado,
  // tema salvo numa versão antiga...)
  function normalize(t) {
    const src = t && typeof t === 'object' ? t : {};
    const out = clone(BASE);
    out.name = typeof src.name === 'string' && src.name.trim() ? src.name.trim().slice(0, 40) : BASE.name;
    for (const k of Object.keys(out.colors)) if (src.colors && isHex(src.colors[k])) out.colors[k] = src.colors[k].toLowerCase();
    if (src.glass) {
      out.glass.opacity = clamp(src.glass.opacity ?? 100, 0, 100);
      out.glass.blur = clamp(src.glass.blur ?? 0, 0, 40);
      out.glass.saturate = clamp(src.glass.saturate ?? 100, 50, 200);
    }
    if (src.background) {
      const img = String(src.background.image || '');
      out.background.image = /^(https?:\/\/|\/uploads\/)[^\s"'()<>]+$/i.test(img) ? img.slice(0, 1000) : '';
      const g = String(src.background.gradient || '');
      out.background.gradient = /^[\w\s#%.,()-]*$/.test(g) && /gradient\(/.test(g) ? g.slice(0, 1200) : '';
      out.background.blur = clamp(src.background.blur ?? 0, 0, 40);
      out.background.dim = clamp(src.background.dim ?? 40, 0, 90);
    }
    if (src.text) {
      out.text.font = Object.prototype.hasOwnProperty.call(FONTS, src.text.font) ? src.text.font : BASE.text.font;
      out.text.heading = src.text.heading === 'same' || Object.prototype.hasOwnProperty.call(FONTS, src.text.heading) ? src.text.heading : 'same';
      out.text.size = clamp(src.text.size ?? 16, 12, 22);
    }
    if (src.shape) {
      out.shape.radius = clamp(src.shape.radius ?? 8, 0, 24);
      out.shape.avatar = src.shape.avatar === 'squircle' ? 'squircle' : 'circle';
    }
    if (src.layout) out.layout.density = src.layout.density === 'compact' ? 'compact' : 'cozy';
    out.css = typeof src.css === 'string' ? src.css.slice(0, MAX_CSS) : '';
    return out;
  }

  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgba = (hex, a) => { const [r, g, b] = hexToRgb(hex); return `rgba(${r}, ${g}, ${b}, ${a})`; };
  function mix(hexA, hexB, t) {
    const a = hexToRgb(hexA); const b = hexToRgb(hexB);
    return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('');
  }
  function luminance(hex) {
    const [r, g, b] = hexToRgb(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function fontStack(name) {
    if (!name || name === 'Sistema') return "system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans', sans-serif";
    const mono = /Mono/.test(name);
    // já vem instalada no Windows/macOS; no Linux as equivalentes livres têm as mesmas medidas
    if (name === 'Times New Roman') return "'Times New Roman', Times, 'Liberation Serif', 'Nimbus Roman', 'Tinos', serif";
    const serif = name === 'Fraunces';
    return `'${name}', ${mono ? 'ui-monospace, monospace' : serif ? 'Georgia, serif' : "system-ui, 'Segoe UI', sans-serif"}`;
  }

  const loadedFonts = new Set(['Inter', 'Fraunces']);
  function ensureFont(name) {
    if (!name || loadedFonts.has(name) || !FONTS[name]) return;
    loadedFonts.add(name);
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${FONTS[name]}&display=swap`;
    document.head.appendChild(link);
  }

  // ------------------------------------------------------------------ aplicar

  let current = normalize(BASE);

  function apply(theme) {
    const t = normalize(theme);
    current = t;
    const c = t.colors;
    const root = document.documentElement;
    const dark = luminance(c.bgChat) < 0.4;
    const alpha = t.glass.opacity / 100;
    const glassy = alpha < 1 || t.glass.blur > 0;
    const surface = (hex, extra = 0) => (alpha >= 1 ? hex : rgba(hex, Math.min(1, alpha + extra)));
    const vars = {
      '--accent': c.accent,
      '--accent-hover': mix(c.accent, dark ? '#000000' : '#000000', 0.14),
      '--accent-active': mix(c.accent, '#000000', 0.24),
      '--accent-soft': rgba(c.accent, 0.16),
      '--accent-softer': rgba(c.accent, 0.08),
      '--accent-contrast': c.accentText,
      '--bg-app': surface(c.bgApp),
      '--bg-rail': surface(c.bgApp),
      '--bg-sidebar': surface(c.bgSidebar),
      '--bg-chat': surface(c.bgChat),
      '--bg-input': surface(c.bgInput, 0.15),
      '--bg-floating': glassy ? rgba(c.bgFloating, Math.max(0.82, alpha)) : c.bgFloating,
      '--bg-modal': glassy ? rgba(c.bgChat, Math.max(0.88, alpha)) : c.bgChat,
      '--bg-solid-app': c.bgApp,
      '--bg-solid-sidebar': c.bgSidebar,
      '--bg-solid-chat': c.bgChat,
      '--bg-solid-input': c.bgInput,
      '--bg-hover': rgba(c.textMuted, dark ? 0.1 : 0.12),
      '--bg-active': rgba(c.textMuted, dark ? 0.18 : 0.2),
      '--bg-selected': rgba(c.textMuted, dark ? 0.24 : 0.26),
      '--border': rgba(c.textMuted, dark ? 0.14 : 0.22),
      '--border-strong': rgba(c.textMuted, dark ? 0.28 : 0.38),
      '--shadow-color': dark ? 'rgba(0, 0, 0, 0.45)' : 'rgba(30, 32, 40, 0.18)',
      '--text-heading': c.textHeading,
      '--text-normal': c.textNormal,
      '--text-muted': c.textMuted,
      '--text-faint': c.textFaint,
      '--text-link': c.link,
      '--success': c.success,
      '--success-soft': rgba(c.success, 0.16),
      '--danger': c.danger,
      '--danger-soft': rgba(c.danger, 0.14),
      '--mention': c.mention,
      '--mention-bg': rgba(c.mention, 0.1),
      '--mention-bg-hover': rgba(c.mention, 0.14),
      '--glass-blur': `${t.glass.blur}px`,
      '--glass-saturate': `${t.glass.saturate}%`,
      '--font': fontStack(t.text.font),
      '--font-heading': t.text.heading === 'same' ? fontStack(t.text.font) : fontStack(t.text.heading),
      '--font-size': `${t.text.size}px`,
      '--radius': `${t.shape.radius}px`,
      '--radius-xs': `${Math.round(t.shape.radius * 0.5)}px`,
      '--radius-sm': `${Math.round(t.shape.radius * 0.75)}px`,
      '--radius-md': `${t.shape.radius}px`,
      '--radius-lg': `${Math.round(t.shape.radius * 1.5)}px`,
      '--radius-avatar': t.shape.avatar === 'squircle' ? '30%' : '50%',
      '--bg-image-dim': String(t.background.dim / 100),
      '--bg-image-blur': `${t.background.blur}px`,
      '--bg-image': t.background.image ? `url("${t.background.image}")` : (t.background.gradient || 'none'),
    };
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
    root.dataset.themeMode = dark ? 'dark' : 'light';
    root.dataset.density = t.layout.density;
    root.toggleAttribute('data-glass', t.glass.blur > 0);
    root.toggleAttribute('data-translucent', alpha < 1);
    root.toggleAttribute('data-bg-image', !!(t.background.image || t.background.gradient));
    root.style.colorScheme = dark ? 'dark' : 'light';
    ensureFont(t.text.font);
    if (t.text.heading !== 'same') ensureFont(t.text.heading);

    let style = document.getElementById('duskyUserCss');
    if (t.css) {
      if (!style) { style = document.createElement('style'); style.id = 'duskyUserCss'; document.head.appendChild(style); }
      style.textContent = t.css;
    } else if (style) {
      style.remove();
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = c.bgApp;
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(t)); } catch (_) { /* sem storage */ }
    return t;
  }

  // (só agora: normalize depende de FONTS e companhia, declarados depois da lista)
  for (let i = 0; i < PRESETS.length; i++) PRESETS[i] = normalize(PRESETS[i]);

  function boot() {
    let cached = null;
    try { cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (_) { /* ok */ }
    apply(cached || BASE);
    // no <head> o CSS próprio entrou antes das folhas de estilo; joga pro fim pra ele ganhar delas
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.getElementById('duskyUserCss');
      if (style) document.head.appendChild(style);
    }, { once: true });
  }

  // ------------------------------------------------------------------ conta (servidor)

  let saved = []; // "meus temas"
  let saveTimer = null;

  async function load() {
    try {
      const res = await fetch('/api/profile/theme');
      if (!res.ok) return current;
      const data = await res.json();
      saved = Array.isArray(data.saved) ? data.saved.map(normalize).slice(0, 20) : [];
      if (data.theme) apply(data.theme);
    } catch (_) { /* sem conexão: fica o do navegador */ }
    return current;
  }

  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      fetch('/api/profile/theme', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: current, saved }),
      }).catch(() => {});
    }, 700);
  }

  function toCode(t) {
    const json = JSON.stringify(normalize(t));
    return CODE_PREFIX + btoa(unescape(encodeURIComponent(json)));
  }
  function fromCode(code) {
    const raw = String(code || '').trim().replace(/^(dusky|didiscord)-tema:/, ''); // aceita códigos do nome antigo
    const json = decodeURIComponent(escape(atob(raw)));
    return normalize(JSON.parse(json));
  }

  // ------------------------------------------------------------------ editor

  const COLOR_FIELDS = [
    ['accent', 'destaque', 'botões, seleção, links do app'],
    ['accentText', 'texto em cima do destaque', ''],
    ['bgApp', 'fundo do app', 'barra de servidores'],
    ['bgSidebar', 'barra lateral', 'canais, membros, perfil'],
    ['bgChat', 'chat', 'onde ficam as mensagens'],
    ['bgInput', 'campos e cartões', 'caixa de mensagem, prévias'],
    ['bgFloating', 'menus flutuantes', 'menus, dicas, popups'],
    ['textHeading', 'títulos e nomes', ''],
    ['textNormal', 'texto', 'mensagens'],
    ['textMuted', 'texto secundário', 'canais, horários'],
    ['textFaint', 'texto apagado', 'dicas, desativados'],
    ['link', 'links', ''],
    ['success', 'online e sucesso', 'falando, online'],
    ['danger', 'perigo', 'sair, apagar, não lidas'],
    ['mention', 'menção', 'quando te mencionam'],
  ];

  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, '');
      else if (v !== false && v != null) el.setAttribute(k, v);
    }
    for (const c of children.flat()) if (c != null) el.append(c);
    return el;
  }

  function previewCard(t, opts) {
    const c = t.colors;
    const card = h('button', { type: 'button', class: 'theme-card' + (opts.active ? ' is-active' : ''), title: t.name });
    const mini = h('span', { class: 'theme-card-mini' });
    mini.style.background = t.background.image ? `center / cover url("${t.background.image}")` : (t.background.gradient || c.bgApp);
    const rail = h('span', { class: 'tcm-rail' }); rail.style.background = rgba(c.bgApp, t.glass.opacity / 100);
    const side = h('span', { class: 'tcm-side' }); side.style.background = rgba(c.bgSidebar, t.glass.opacity / 100);
    const chat = h('span', { class: 'tcm-chat' }); chat.style.background = rgba(c.bgChat, t.glass.opacity / 100);
    for (let i = 0; i < 3; i++) {
      const line = h('span', { class: 'tcm-line' });
      line.style.background = i === 0 ? c.textHeading : c.textMuted;
      line.style.width = `${[62, 80, 48][i]}%`;
      chat.append(line);
    }
    const dot = h('span', { class: 'tcm-accent' }); dot.style.background = c.accent;
    chat.append(dot);
    mini.append(rail, side, chat);
    card.append(mini, h('span', { class: 'theme-card-name', text: t.name }));
    if (opts.onDelete) {
      card.append(h('span', { class: 'theme-card-del', role: 'button', title: 'apagar tema', text: '×', onclick: (e) => { e.stopPropagation(); opts.onDelete(); } }));
    }
    card.addEventListener('click', opts.onClick);
    return card;
  }

  function mountEditor(root, ctx = {}) {
    root.innerHTML = '';
    const toast = ctx.toast || ((m) => console.log(m));

    const update = (mutator) => {
      const next = clone(current);
      mutator(next);
      apply(next);
      persist();
      syncControls();
    };

    // --- temas prontos e meus temas
    const presetGrid = h('div', { class: 'theme-grid' });
    const mineGrid = h('div', { class: 'theme-grid' });
    const renderGrids = () => {
      presetGrid.innerHTML = '';
      for (const p of PRESETS) {
        presetGrid.append(previewCard(p, { active: current.name === p.name, onClick: () => { apply(clone(p)); persist(); renderGrids(); syncControls(); } }));
      }
      mineGrid.innerHTML = '';
      if (!saved.length) mineGrid.append(h('p', { class: 'theme-empty', text: 'Nenhum tema salvo ainda. Monte o seu aqui embaixo e clique em "salvar como meu tema".' }));
      saved.forEach((t, i) => {
        mineGrid.append(previewCard(t, {
          active: current.name === t.name,
          onClick: () => { apply(clone(t)); persist(); renderGrids(); syncControls(); },
          onDelete: () => { saved.splice(i, 1); persist(); renderGrids(); },
        }));
      });
    };

    // --- cores
    const colorInputs = {};
    const colorList = h('div', { class: 'theme-colors' });
    for (const [key, label, hint] of COLOR_FIELDS) {
      const picker = h('input', { type: 'color', class: 'theme-color-input', 'aria-label': label });
      const hex = h('input', { type: 'text', class: 'theme-color-hex', maxlength: '7', spellcheck: 'false', 'aria-label': `${label} (código)` });
      picker.addEventListener('input', () => { hex.value = picker.value; update((t) => { t.colors[key] = picker.value; }); });
      hex.addEventListener('change', () => {
        const v = hex.value.trim().replace(/^([0-9a-f]{6})$/i, '#$1');
        if (isHex(v)) update((t) => { t.colors[key] = v.toLowerCase(); });
        else hex.value = current.colors[key];
      });
      colorInputs[key] = { picker, hex };
      colorList.append(h('label', { class: 'theme-color' },
        h('span', { class: 'theme-color-swatch' }, picker),
        h('span', { class: 'theme-color-text' }, h('strong', { text: label }), hint ? h('small', { text: hint }) : null),
        hex));
    }

    // --- sliders
    function slider(label, min, max, step, get, set, unit = '', help = '') {
      const input = h('input', { type: 'range', min: String(min), max: String(max), step: String(step) });
      const value = h('span', { class: 'field-hint' });
      const show = () => { value.textContent = `${input.value}${unit}`; };
      input.addEventListener('input', () => { show(); update((t) => set(t, Number(input.value))); });
      const wrap = h('div', { class: 'field' }, h('label', {}, label, ' ', value), input, help ? h('span', { class: 'field-help', text: help }) : null);
      wrap._sync = () => { input.value = String(get(current)); show(); };
      return wrap;
    }
    function select(label, options, get, set, help = '') {
      const sel = h('select', {}, options.map(([v, l]) => h('option', { value: v, text: l })));
      sel.addEventListener('change', () => update((t) => set(t, sel.value)));
      const wrap = h('div', { class: 'field' }, h('label', { text: label }), sel, help ? h('span', { class: 'field-help', text: help }) : null);
      wrap._sync = () => { sel.value = String(get(current)); };
      return wrap;
    }

    const glassFields = [
      slider('opacidade dos painéis', 10, 100, 1, (t) => t.glass.opacity, (t, v) => { t.glass.opacity = v; }, '%', 'abaixo de 100%, dá pra ver o fundo atrás do app'),
      slider('desfoque (vidro)', 0, 40, 1, (t) => t.glass.blur, (t, v) => { t.glass.blur = v; }, 'px', 'embaça o que estiver atrás dos painéis — efeito de vidro fosco'),
      slider('saturação do vidro', 50, 200, 5, (t) => t.glass.saturate, (t, v) => { t.glass.saturate = v; }, '%'),
    ];

    // --- fundo
    const bgPreview = h('div', { class: 'theme-bg-preview' });
    const bgFile = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', hidden: true });
    const bgUrl = h('input', { type: 'url', placeholder: 'ou cole o link de uma imagem (https://...)', class: 'theme-bg-url' });
    const gradRow = h('div', { class: 'theme-gradients' });
    for (const [name, g] of BG_GRADIENTS) {
      const b = h('button', { type: 'button', class: 'theme-gradient', title: name, 'aria-label': `fundo ${name}` });
      b.style.background = g;
      b.addEventListener('click', () => update((t) => { t.background.gradient = g; t.background.image = ''; if (t.glass.opacity === 100) t.glass.opacity = 70; }));
      gradRow.append(b);
    }
    bgFile.addEventListener('change', async () => {
      const file = bgFile.files && bgFile.files[0];
      bgFile.value = '';
      if (!file) return;
      const form = new FormData();
      form.append('image', file);
      toast('enviando a imagem…');
      try {
        const res = await fetch('/api/profile/theme/background', { method: 'POST', body: form });
        const data = await res.json().catch(() => ({}));
        // 404 = o servidor que está no ar é de antes dessa função existir (precisa reiniciar o npm start)
        if (res.status === 404) return toast('o servidor precisa ser reiniciado pra aceitar imagem de fundo', 'error');
        if (!res.ok) return toast(data.error || 'não deu pra enviar a imagem', 'error');
        update((t) => { t.background.image = data.url; t.background.gradient = ''; if (t.glass.opacity === 100) t.glass.opacity = 70; });
      } catch (_) { toast('sem conexão', 'error'); }
    });
    bgUrl.addEventListener('change', () => {
      const v = bgUrl.value.trim();
      if (!v) return;
      if (!/^https?:\/\/\S+$/i.test(v)) { toast('isso não parece um link de imagem', 'error'); return; }
      update((t) => { t.background.image = v; t.background.gradient = ''; if (t.glass.opacity === 100) t.glass.opacity = 70; });
    });
    const bgFields = [
      slider('desfocar a imagem', 0, 40, 1, (t) => t.background.blur, (t, v) => { t.background.blur = v; }, 'px'),
      slider('escurecer a imagem', 0, 90, 1, (t) => t.background.dim, (t, v) => { t.background.dim = v; }, '%'),
    ];

    // --- texto e forma
    const fontOptions = Object.keys(FONTS).map((f) => [f, f === 'Sistema' ? 'fonte do sistema' : f]);
    const shapeFields = [
      select('fonte', fontOptions, (t) => t.text.font, (t, v) => { t.text.font = v; }),
      select('fonte dos títulos', [['same', 'a mesma do texto'], ...fontOptions], (t) => t.text.heading, (t, v) => { t.text.heading = v; }),
      slider('tamanho do texto', 12, 22, 1, (t) => t.text.size, (t, v) => { t.text.size = v; }, 'px'),
      slider('cantos arredondados', 0, 24, 1, (t) => t.shape.radius, (t, v) => { t.shape.radius = v; }, 'px'),
      select('formato das fotos de perfil', [['circle', 'redondas'], ['squircle', 'quadradas arredondadas']], (t) => t.shape.avatar, (t, v) => { t.shape.avatar = v; }),
      select('mensagens', [['cozy', 'confortável (com foto e espaço)'], ['compact', 'compacto (mais mensagens na tela)']], (t) => t.layout.density, (t, v) => { t.layout.density = v; }),
    ];

    // --- CSS
    const cssBox = h('textarea', { class: 'theme-css', rows: '8', spellcheck: 'false', placeholder: '/* exemplo */\n.msg-author { text-transform: uppercase; }\n.server-rail { border-right: 2px solid var(--accent); }' });
    const cssApply = h('button', { type: 'button', class: 'btn btn-primary btn-sm', text: 'aplicar CSS', onclick: () => update((t) => { t.css = cssBox.value.slice(0, MAX_CSS); }) });

    // --- nome, salvar, exportar
    const nameInput = h('input', { type: 'text', maxlength: '40', class: 'theme-name-input', 'aria-label': 'nome do tema' });
    nameInput.addEventListener('change', () => update((t) => { t.name = nameInput.value.trim() || 'Meu tema'; }));
    const saveBtn = h('button', {
      type: 'button', class: 'btn btn-primary', text: 'salvar como meu tema',
      onclick: () => {
        const name = (nameInput.value.trim() || 'Meu tema').slice(0, 40);
        const t = clone(current); t.name = name;
        const i = saved.findIndex((x) => x.name === name);
        if (i >= 0) saved[i] = t; else saved.unshift(t);
        saved = saved.slice(0, 20);
        apply(t); persist(); renderGrids();
        toast(`tema "${name}" salvo`);
      },
    });
    // Campo dentro das configurações: Electron não oferece window.prompt().
    const transferLabel = h('span', { text: 'código do tema' });
    const transferInput = h('textarea', {
      class: 'theme-css', rows: '4', spellcheck: 'false',
      placeholder: 'dusky-tema:', 'aria-label': 'código do tema',
    });
    const transferError = h('p', { class: 'field-help', role: 'alert', hidden: true });
    const closeTransfer = () => {
      transferPanel.hidden = true;
      (transferInput.readOnly ? exportBtn : importBtn).focus();
    };
    const applyImport = h('button', {
      type: 'button', class: 'btn btn-primary', text: 'aplicar tema',
      onclick: () => {
        let t;
        try {
          if (!transferInput.value.trim()) throw new Error('empty');
          t = fromCode(transferInput.value);
        } catch (_) {
          transferError.textContent = 'Código inválido. Cole o código completo, começando com dusky-tema: (ou didiscord-tema:).';
          transferError.hidden = false;
          transferInput.setAttribute('aria-invalid', 'true');
          transferInput.focus();
          return;
        }
        apply(t); persist(); renderGrids(); syncControls();
        closeTransfer();
        toast(`tema "${t.name}" aplicado${t.css ? ' (ele tem CSS próprio)' : ''}`);
      },
    });
    const transferPanel = h('div', { hidden: true },
      h('label', {}, transferLabel, transferInput), transferError,
      h('div', { class: 'settings-row theme-actions' }, applyImport,
        h('button', { type: 'button', class: 'btn btn-quiet', text: 'fechar', onclick: closeTransfer })),
    );
    transferPanel.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeTransfer(); }
    });
    function openTransfer(code, exporting) {
      transferInput.value = code;
      transferInput.readOnly = exporting;
      transferInput.removeAttribute('aria-invalid');
      transferError.hidden = true;
      transferLabel.textContent = exporting ? 'Copie o código abaixo para compartilhar seu tema.' : 'Cole o código do tema abaixo e clique em aplicar tema.';
      applyImport.hidden = exporting;
      transferPanel.hidden = false;
      transferInput.focus();
      if (exporting) transferInput.select();
    }
    const exportBtn = h('button', {
      type: 'button', class: 'btn btn-ghost', text: 'copiar código do tema',
      onclick: async () => {
        const code = toCode(current);
        try {
          await navigator.clipboard.writeText(code);
          toast('código copiado — é só mandar pro seu amigo colar em "importar"');
        } catch (_) { openTransfer(code, true); }
      },
    });
    const importBtn = h('button', {
      type: 'button', class: 'btn btn-ghost', text: 'importar tema',
      onclick: () => openTransfer('', false),
    });
    const resetBtn = h('button', { type: 'button', class: 'btn btn-quiet', text: 'voltar pro padrão', onclick: () => { apply(clone(BASE)); persist(); renderGrids(); syncControls(); } });

    const section = (title, help, ...body) => h('section', { class: 'settings-section' },
      h('h3', { class: 'settings-section-title', text: title }), help ? h('p', { class: 'settings-section-help', text: help }) : null, ...body);

    root.append(
      section('temas prontos', 'Clique pra experimentar. Tudo aqui embaixo muda o tema atual na hora — e fica salvo na sua conta.', presetGrid),
      section('meus temas', '', mineGrid,
        h('div', { class: 'settings-row theme-actions' }, nameInput, saveBtn),
        h('div', { class: 'settings-row theme-actions' }, exportBtn, importBtn, resetBtn), transferPanel),
      section('cores', 'Clique no quadradinho pra escolher, ou digite o código da cor.', colorList),
      section('vidro e transparência', 'Deixe os painéis transparentes e desfocados pra ver o fundo atrás — o efeito de vidro.', ...glassFields),
      section('imagem de fundo', 'Aparece atrás do app quando os painéis estão transparentes.',
        bgPreview,
        h('div', { class: 'settings-row' },
          h('button', { type: 'button', class: 'btn btn-ghost', text: 'enviar imagem', onclick: () => bgFile.click() }),
          h('button', { type: 'button', class: 'btn btn-quiet', text: 'tirar fundo', onclick: () => update((t) => { t.background.image = ''; t.background.gradient = ''; }) }),
          bgFile),
        bgUrl,
        h('div', { class: 'field-help', text: 'ou um degradê pronto:' }),
        gradRow,
        ...bgFields),
      section('texto e forma', '', ...shapeFields),
      section('CSS próprio (avançado)', 'Pra quem quer ir além: qualquer CSS escrito aqui vale só pra você. Use as variáveis do tema, como var(--accent) e var(--bg-chat). Tema importado de outra pessoa pode trazer CSS também.', cssBox,
        h('div', { class: 'settings-row' }, cssApply, h('button', { type: 'button', class: 'btn btn-quiet', text: 'limpar', onclick: () => { cssBox.value = ''; update((t) => { t.css = ''; }); } }))),
    );

    function syncControls() {
      for (const [key, { picker, hex }] of Object.entries(colorInputs)) {
        picker.value = current.colors[key];
        if (document.activeElement !== hex) hex.value = current.colors[key];
      }
      for (const f of [...glassFields, ...bgFields, ...shapeFields]) f._sync();
      if (document.activeElement !== nameInput) nameInput.value = current.name;
      if (document.activeElement !== cssBox) cssBox.value = current.css;
      const b = current.background;
      bgPreview.style.background = b.image ? `center / cover no-repeat url("${b.image}")` : (b.gradient || 'var(--bg-input)');
      bgPreview.classList.toggle('is-empty', !b.image && !b.gradient);
      bgPreview.textContent = !b.image && !b.gradient ? 'sem imagem de fundo' : '';
      if (document.activeElement !== bgUrl) bgUrl.value = /^https?:/.test(b.image) ? b.image : '';
      renderGrids();
    }
    syncControls();
    return { refresh: syncControls };
  }

  window.DuskyTheme = { apply, boot, load, mountEditor, presets: PRESETS, normalize, toCode, fromCode, current: () => current };
})();
