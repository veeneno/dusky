// ---------- celular: gavetas de canais e de membros ----------
// No celular (tela estreita, ver css/mobile.css) o chat ocupa a tela toda. Servidores + canais
// ficam numa gaveta pela esquerda e a lista de membros numa gaveta pela direita. Este arquivo só
// abre e fecha as gavetas (classes m-nav-open / m-members-open no <body>):
//   - botão ☰ no topo do chat e da call (criado aqui) e arrastar o dedo da esquerda pra direita;
//   - tocar num canal ou numa conversa fecha a gaveta (trocar de servidor não: falta escolher o canal);
//   - sem canal aberto (tela inicial, servidor sem canal de texto) a gaveta abre sozinha;
//   - o "voltar" do Android fecha a gaveta em vez de sair do site.
// No computador nada disso aparece: o CSS esconde e as funções não fazem nada.

const mobileMq = window.matchMedia('(max-width: 760px)');
const mobileBackdrop = document.createElement('div');
mobileBackdrop.className = 'm-backdrop';
document.body.appendChild(mobileBackdrop);

const MOBILE_NAV_ICON = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg>';
const mobileNavButtons = ['.chat-header', '.call-header'].map((sel) => {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'icon-btn m-nav-btn';
  btn.title = 'canais e servidores';
  btn.setAttribute('aria-label', 'abrir canais e servidores');
  btn.innerHTML = MOBILE_NAV_ICON + '<span class="m-nav-badge"></span>';
  btn.addEventListener('click', () => openMobileDrawer('nav'));
  document.querySelector(sel).prepend(btn);
  return btn;
});

function isMobileLayout() {
  return mobileMq.matches;
}

// o "voltar" do Android/iPhone fecha a gaveta: cada gaveta aberta ganha uma entrada no histórico
let mobileDrawerInHistory = false;

function openMobileDrawer(which) {
  if (!isMobileLayout()) return;
  document.body.classList.toggle('m-nav-open', which === 'nav');
  document.body.classList.toggle('m-members-open', which === 'members');
  if (!mobileDrawerInHistory) {
    try { history.pushState({ mobileDrawer: true }, ''); mobileDrawerInHistory = true; } catch (_) { /* ok */ }
  }
}

function closeMobileDrawers(fromHistory = false) {
  const wasOpen = document.body.classList.contains('m-nav-open') || document.body.classList.contains('m-members-open');
  document.body.classList.remove('m-nav-open', 'm-members-open');
  if (mobileDrawerInHistory && !fromHistory) {
    mobileDrawerInHistory = false;
    try { history.back(); } catch (_) { /* ok */ }
  }
  if (fromHistory) mobileDrawerInHistory = false;
  return wasOpen;
}

window.addEventListener('popstate', () => {
  if (mobileDrawerInHistory) closeMobileDrawers(true);
});
mobileBackdrop.addEventListener('click', () => closeMobileDrawers());
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && isMobileLayout()) closeMobileDrawers();
});

// tocou num canal ou numa conversa: mostra o chat (os botões de editar/apagar canal não contam)
document.querySelector('.sidebar').addEventListener('click', (e) => {
  if (!isMobileLayout()) return;
  if (e.target.closest('button')) return;
  if (e.target.closest('.channel-item:not(.is-locked), .dm-item')) setTimeout(() => closeMobileDrawers(), 0);
});

// membros: no celular o botão abre/fecha a gaveta (no computador continua escondendo a coluna)
membersToggleBtn.addEventListener('click', (e) => {
  if (!isMobileLayout()) return;
  e.stopImmediatePropagation();
  if (document.body.classList.contains('m-members-open')) closeMobileDrawers();
  else openMobileDrawer('members');
}, true);

// sem nada aberto na área principal (a tela vazia aparece): abre a lista de canais
new MutationObserver(() => {
  if (isMobileLayout() && !mainEmpty.hidden) openMobileDrawer('nav');
}).observe(mainEmpty, { attributes: true, attributeFilter: ['hidden'] });

// voltou pra tela larga (girou o tablet, aumentou a janela): nada de gaveta presa aberta
mobileMq.addEventListener('change', () => {
  if (!isMobileLayout()) closeMobileDrawers(true);
});

// ---------- arrastar o dedo ----------
// da esquerda pra direita (começando em qualquer lugar do chat) abre os canais; com uma gaveta
// aberta, arrastar pro lado de fora fecha. Só conta gesto mais de lado do que de cima pra baixo
// (senão é rolagem) e que não começou num lugar que já rola de lado (bloco de código, figurinhas).
let mobileTouch = null;
document.addEventListener('touchstart', (e) => {
  if (!isMobileLayout() || e.touches.length !== 1) { mobileTouch = null; return; }
  const t = e.touches[0];
  const scroller = e.target.closest && e.target.closest('pre, .gif-picker-grid, .settings-nav, input, textarea, .media-viewer, .world-stage, canvas');
  mobileTouch = scroller ? null : { x: t.clientX, y: t.clientY, at: Date.now() };
}, { passive: true });
document.addEventListener('touchend', (e) => {
  if (!mobileTouch || !e.changedTouches.length) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - mobileTouch.x;
  const dy = t.clientY - mobileTouch.y;
  const fast = Date.now() - mobileTouch.at < 600;
  mobileTouch = null;
  if (!fast || Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
  const body = document.body.classList;
  if (body.contains('m-nav-open')) { if (dx < 0) closeMobileDrawers(); return; }
  if (body.contains('m-members-open')) { if (dx > 0) closeMobileDrawers(); return; }
  // modal/configurações abertos por cima: o gesto não é com a gente
  if (document.querySelector('.modal-backdrop:not([hidden]), .settings-backdrop:not([hidden])')) return;
  if (dx > 0) openMobileDrawer('nav');
  else if (!chatView.hidden && !membersToggleBtn.hidden) openMobileDrawer('members');
}, { passive: true });

// ---------- ações da mensagem (responder, reagir, editar…) ----------
// no computador aparecem com o mouse em cima; no celular, tocar na mensagem mostra/esconde
// (tocar num link, imagem, botão ou nome continua fazendo o de sempre)
chatMessages.addEventListener('click', (e) => {
  if (!isMobileLayout()) return;
  if (e.target.closest('a, button, img, video, input, textarea, .msg-author, .msg-avatar, .msg-reactions, .msg-embed, .msg-actions, pre')) return;
  const group = e.target.closest('.msg-group:not(.is-system)');
  const wasOn = group && group.classList.contains('m-actions');
  for (const g of chatMessages.querySelectorAll('.msg-group.m-actions')) g.classList.remove('m-actions');
  if (group && !wasOn) group.classList.add('m-actions');
});

// ---------- bolinha de "não lido" no ☰ ----------
// acende quando tem mensagem nova em outro canal ou servidor (o que a gaveta mostraria)
let mobileBadgeQueued = false;
function updateMobileNavBadge() {
  mobileBadgeQueued = false;
  const unread = !!document.querySelector(
    '.rail-badge:not([hidden]), .rail-item.has-unread, .channel-item.is-unread:not(.active), .dm-item.is-unread:not(.active)'
  );
  for (const btn of mobileNavButtons) btn.toggleAttribute('data-unread', unread);
}
new MutationObserver(() => {
  if (mobileBadgeQueued) return;
  mobileBadgeQueued = true;
  requestAnimationFrame(updateMobileNavBadge);
}).observe(document.querySelector('.app-shell'), { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'hidden'] });
