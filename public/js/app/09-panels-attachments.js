// didiscord — Painéis de fixadas e busca, anexos e GIFs
// Parte 9 de 28 do código do site (public/js/app/). Leia o README.md desta pasta antes de mexer.
//
// Todos os arquivos desta pasta são scripts comuns que dividem o MESMO escopo e são carregados em
// ordem pelo app.html: o que um declara no topo (const, let, function) os outros enxergam.
//
// Neste arquivo:
//   - painéis da lateral: fixadas e busca
//   - anexos
//   - gif e figurinha (GIPHY)

// ===================================================================
// painéis da lateral: fixadas e busca
// ===================================================================

const pinsBtn = document.getElementById('pinsBtn');
const pinsPanel = document.getElementById('pinsPanel');
const pinsList = document.getElementById('pinsList');
const searchPanel = document.getElementById('searchPanel');
const searchResults = document.getElementById('searchResults');
const searchSummary = document.getElementById('searchSummary');
const chatSearchForm = document.getElementById('chatSearchForm');
const chatSearchInput = document.getElementById('chatSearchInput');

// com fixadas/busca abertas, a lista de membros (ou o perfil da DM) sai da frente — igual o Discord
function closeSidePanels() {
  const wasOpen = (pinsPanel && !pinsPanel.hidden) || (searchPanel && !searchPanel.hidden);
  if (pinsPanel) pinsPanel.hidden = true;
  if (searchPanel) searchPanel.hidden = true;
  if (pinsBtn) pinsBtn.classList.remove('active');
  if (wasOpen && currentChannel) {
    if (currentChannel.dm) dmProfilePanel.hidden = false;
    else memberPanel.hidden = memberPanelCollapsed;
  }
}
function openSidePanel(panel) {
  closeSidePanels();
  panel.hidden = false;
  memberPanel.hidden = true;
  dmProfilePanel.hidden = true;
}
document.querySelectorAll('[data-close-panel]').forEach((b) => b.addEventListener('click', closeSidePanels));

// um resultado (busca/fixada): autor, quando, onde, texto — clicando, pula pra mensagem
function buildResultEl(m, terms, showChannel) {
  const el = document.createElement('div');
  el.className = 'side-result';
  const head = document.createElement('div');
  head.className = 'side-result-head';
  head.innerHTML = '<span class="side-result-author"></span><span class="side-result-when"></span>';
  head.querySelector('.side-result-author').textContent = m.username || m.bot_name || 'bot';
  head.querySelector('.side-result-when').textContent = (showChannel && m.channel_name ? `#${m.channel_name} · ` : '') + formatDateTime(m.created_at);
  const body = document.createElement('div');
  body.className = 'side-result-text msg-text';
  renderMessageText(body, m.content || '', false, m);
  if (!m.content && m.attachment_type) body.textContent = messagePlain(m);
  if (terms && terms.length) markTerms(body, terms);
  const jump = document.createElement('button');
  jump.type = 'button';
  jump.className = 'side-result-jump';
  jump.textContent = 'ir';
  el.append(head, body, jump);
  const go = () => goToMessage(m);
  jump.addEventListener('click', go);
  el.addEventListener('click', (e) => { if (!e.target.closest('a, .md-spoiler, .md-mention')) go(); });
  return el;
}

function formatDateTime(iso) {
  const d = new Date(timeValue(iso));
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// destaca as palavras buscadas (sem diferença de acento) nos textos do resultado
function markTerms(root, terms) {
  const needles = terms.map(foldText).filter(Boolean);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const text = node.nodeValue;
    const folded = foldText(text);
    if (folded.length !== text.length) continue; // acento composto mudou o tamanho: pula pra não errar a posição
    const ranges = [];
    for (const n of needles) {
      const re = new RegExp(`(^|[^\\p{L}\\p{N}])(${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\p{L}\\p{N}_]*)`, 'gu');
      for (const m of folded.matchAll(re)) ranges.push([m.index + m[1].length, m.index + m[0].length]);
    }
    if (!ranges.length) continue;
    ranges.sort((a, b) => a[0] - b[0]);
    const frag = document.createDocumentFragment();
    let pos = 0;
    for (const [a, b] of ranges) {
      if (a < pos) continue;
      frag.append(text.slice(pos, a));
      const mark = document.createElement('mark');
      mark.textContent = text.slice(a, b);
      frag.append(mark);
      pos = b;
    }
    frag.append(text.slice(pos));
    node.replaceWith(frag);
  }
}

async function goToMessage(m) {
  if (currentChannel && currentChannel.id === m.channel_id && highlightMessage(m.id)) return;
  await openMessageLocation(m, { aroundId: m.id });
}

async function openPins() {
  if (!currentChannel || currentChannel.type !== 'text') return;
  if (!pinsPanel.hidden) { closeSidePanels(); return; }
  openSidePanel(pinsPanel);
  pinsBtn.classList.add('active');
  await renderPins();
}

async function renderPins() {
  if (!currentChannel || pinsPanel.hidden) return;
  const channel = currentChannel;
  pinsList.innerHTML = '<div class="side-empty">carregando…</div>';
  try {
    const res = await fetch(`/api/channels/${channel.id}/messages/pins`);
    const data = await res.json();
    if (currentChannel !== channel) return;
    pinsList.innerHTML = '';
    if (!data.messages || !data.messages.length) {
      pinsList.innerHTML = '<div class="side-empty">nenhuma mensagem fixada aqui ainda.<br>passe o mouse numa mensagem e clique no alfinete.</div>';
      return;
    }
    for (const m of data.messages) pinsList.appendChild(buildResultEl(m, null, false));
  } catch (_) {
    pinsList.innerHTML = '<div class="side-empty">não deu pra carregar</div>';
  }
}

if (pinsBtn) pinsBtn.addEventListener('click', openPins);

let searchState = null; // { q, params, offset, total }

// "de:fulano pizza" procura só mensagens do fulano
function parseSearch(raw) {
  let q = raw;
  let authorId = null;
  const m = raw.match(/(?:^|\s)de:@?(\S+)/i);
  if (m) {
    const name = foldText(m[1]);
    const u = mentionCandidates().find((x) => x && foldText(x.username).replace(/\s+/g, '') === name.replace(/\s+/g, ''))
      || mentionCandidates().find((x) => x && foldText(x.username).startsWith(name));
    if (u) { authorId = u.id; q = raw.replace(m[0], ' ').trim(); }
  }
  return { q, authorId };
}

async function runSearch(append) {
  if (!searchState) return;
  const { q, authorId } = searchState;
  const where = currentChannel && currentChannel.dm ? `channel_id=${currentChannel.id}` : `server_id=${currentServerId}`;
  const url = `/api/search?q=${encodeURIComponent(q)}&${where}${authorId ? `&author_id=${authorId}` : ''}&offset=${searchState.offset}`;
  if (!append) { searchResults.innerHTML = '<div class="side-empty">buscando…</div>'; searchSummary.textContent = 'buscando…'; }
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) { searchResults.innerHTML = `<div class="side-empty"></div>`; searchResults.firstChild.textContent = data.error || 'não deu pra buscar'; return; }
    if (!append) searchResults.innerHTML = '';
    const more = searchResults.querySelector('.side-more');
    if (more) more.remove();
    searchState.total = data.total;
    searchSummary.textContent = data.total === 1 ? '1 resultado' : `${data.total} resultados`;
    if (!data.total) { searchResults.innerHTML = '<div class="side-empty">nada encontrado</div>'; return; }
    for (const m of data.messages) searchResults.appendChild(buildResultEl(m, data.terms, !currentChannel.dm));
    searchState.offset = data.offset + data.messages.length;
    if (searchState.offset < data.total) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn-ghost side-more';
      b.textContent = 'mais resultados';
      b.addEventListener('click', () => runSearch(true));
      searchResults.appendChild(b);
    }
  } catch (_) {
    searchResults.innerHTML = '<div class="side-empty">sem conexão</div>';
  }
}

if (chatSearchForm) {
  chatSearchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const raw = chatSearchInput.value.trim();
    if (!raw || !currentChannel) return;
    const { q, authorId } = parseSearch(raw);
    if (!q && !authorId) return;
    openSidePanel(searchPanel);
    searchState = { q, authorId, offset: 0, total: 0 };
    runSearch(false);
  });
  chatSearchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { chatSearchInput.value = ''; closeSidePanels(); chatSearchInput.blur(); }
  });
}

// ---------- anexos ----------

attachBtn.addEventListener('click', () => attachInput.click());

function showComposerError(msg) {
  composerError.textContent = msg;
  composerError.hidden = !msg;
}

function setPendingAttachment(file) {
  pendingAttachment = file;
  attachmentPreviewName.textContent = file.name || 'arquivo colado';
  attachmentPreview.hidden = false;
  showComposerError('');

  if (file.type.startsWith('image/')) {
    const url = URL.createObjectURL(file);
    attachmentPreviewThumb.style.backgroundImage = `url(${url})`;
    attachmentPreviewThumb.innerHTML = '';
  } else {
    // vídeo ou arquivo genérico (pdf, zip, docx etc.) — sem preview de imagem, só um ícone
    attachmentPreviewThumb.style.backgroundImage = '';
    attachmentPreviewThumb.innerHTML = file.type.startsWith('video/') ? VIDEO_ICON : FILE_ICON;
    attachmentPreviewThumb.style.display = 'flex';
    attachmentPreviewThumb.style.alignItems = 'center';
    attachmentPreviewThumb.style.justifyContent = 'center';
    attachmentPreviewThumb.style.color = 'var(--text-lo)';
  }
}

attachInput.addEventListener('change', () => {
  const file = attachInput.files[0];
  if (!file) return;
  setPendingAttachment(file);
});

// colar (ctrl+v) uma imagem copiada (print, ou copiada de outro app/site) direto no chat —
// igual Discord/Slack/WhatsApp Web. Só intercepta quando o clipboard realmente tem um arquivo
// de imagem; colar texto normal continua funcionando sem nenhuma mudança de comportamento.
chatInput.addEventListener('paste', (e) => {
  const items = e.clipboardData && e.clipboardData.items;
  if (!items) return;
  for (const item of items) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (!file) continue;
      e.preventDefault(); // evita colar também um nome de arquivo/lixo como texto no campo
      setPendingAttachment(file);
      break;
    }
  }
});

function clearPendingAttachment() {
  pendingAttachment = null;
  attachInput.value = '';
  attachmentPreview.hidden = true;
  attachmentPreviewThumb.style.backgroundImage = '';
  attachmentPreviewThumb.innerHTML = '';
  hideUploadProgress();
}

// mostra a barra de progresso (0-100) mais um texto "XX% · 12.3 MB / 45.0 MB" embaixo do
// nome do arquivo, dentro do preview de anexo pendente — usado durante o envio de verdade
function showUploadProgress(percent, loadedBytes, totalBytes) {
  attachmentPreviewProgressTrack.hidden = false;
  attachmentPreviewProgressText.hidden = false;
  attachmentPreviewProgressFill.style.width = percent + '%';
  const sizes = (loadedBytes != null && totalBytes != null)
    ? ` · ${formatFileSize(loadedBytes)} / ${formatFileSize(totalBytes)}`
    : '';
  attachmentPreviewProgressText.textContent = `enviando... ${percent}%${sizes}`;
}

function hideUploadProgress() {
  attachmentPreviewProgressTrack.hidden = true;
  attachmentPreviewProgressText.hidden = true;
  attachmentPreviewProgressFill.style.width = '0%';
}

// durante um upload em andamento, o botão de "remover anexo" vira "cancelar envio" — aborta o
// XHR (o listener 'abort' cuida da limpeza) em vez de só limpar o estado local, senão o upload
// continuaria rolando em segundo plano sem nenhuma forma de pará-lo
attachmentPreviewRemove.addEventListener('click', () => {
  if (activeUploadXhr) {
    activeUploadXhr.abort();
    return;
  }
  clearPendingAttachment();
});

// ---------- gif e figurinha (GIPHY) ----------

let gifSearchTimer = null;
let gifPickerKind = 'gifs';
let gifQuery = '';
let gifOffset = 0;
let gifLoadingMore = false;
let gifHasMore = true;

async function openGifPicker() {
  gifPicker.hidden = false;
  gifSearchInput.value = '';
  gifSearchInput.focus();
  await loadGifs('');
}

function closeGifPicker() {
  gifPicker.hidden = true;
}

gifBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (gifPicker.hidden) openGifPicker();
  else closeGifPicker();
});

gifPickerTabs.addEventListener('click', (e) => {
  const btn = e.target.closest('.gif-picker-tab');
  if (!btn || btn.dataset.kind === gifPickerKind) return;
  gifPickerKind = btn.dataset.kind;
  gifPickerTabs.querySelectorAll('.gif-picker-tab').forEach((t) => t.classList.toggle('active', t === btn));
  loadGifs(gifSearchInput.value.trim());
});

document.addEventListener('click', (e) => {
  if (!gifPicker.hidden && !gifPicker.contains(e.target) && e.target !== gifBtn) closeGifPicker();
});

gifSearchInput.addEventListener('keydown', (e) => e.stopPropagation());
gifSearchInput.addEventListener('input', () => {
  clearTimeout(gifSearchTimer);
  gifSearchTimer = setTimeout(() => loadGifs(gifSearchInput.value.trim()), 350);
});

async function loadGifs(query) {
  gifQuery = query;
  gifOffset = 0;
  gifHasMore = true;
  gifPickerGrid.innerHTML = '<div class="gif-picker-loading">buscando...</div>';
  try {
    const res = await fetch(`/api/giphy/search?q=${encodeURIComponent(query)}&type=${gifPickerKind}&offset=0`);
    const data = await res.json();
    if (!res.ok) {
      gifPickerGrid.innerHTML = `<div class="gif-picker-empty">${escapeHtml(data.error || 'erro ao buscar')}</div>`;
      return;
    }
    const gifs = data.gifs || [];
    gifOffset = gifs.length;
    gifHasMore = gifs.length > 0;
    renderGifResults(gifs, false);
  } catch (_) {
    gifPickerGrid.innerHTML = '<div class="gif-picker-empty">erro de conexão</div>';
  }
}

// busca a próxima página (offset atual) e vai anexando no grid, sem apagar o que já tem
async function loadMoreGifs() {
  if (gifLoadingMore || !gifHasMore) return;
  gifLoadingMore = true;
  const moreEl = document.createElement('div');
  moreEl.className = 'gif-picker-loading-more';
  moreEl.textContent = 'carregando mais...';
  gifPickerGrid.appendChild(moreEl);
  try {
    const res = await fetch(`/api/giphy/search?q=${encodeURIComponent(gifQuery)}&type=${gifPickerKind}&offset=${gifOffset}`);
    const data = await res.json();
    moreEl.remove();
    if (!res.ok) { gifHasMore = false; return; }
    const gifs = data.gifs || [];
    gifOffset += gifs.length;
    if (gifs.length === 0) gifHasMore = false;
    renderGifResults(gifs, true);
  } catch (_) {
    moreEl.remove();
  } finally {
    gifLoadingMore = false;
  }
}

// rolou perto do fim do grid -> busca mais gifs automaticamente
gifPickerGrid.addEventListener('scroll', () => {
  if (gifPickerGrid.scrollTop + gifPickerGrid.clientHeight >= gifPickerGrid.scrollHeight - 150) {
    loadMoreGifs();
  }
});

function renderGifResults(gifs, append) {
  if (!append) gifPickerGrid.innerHTML = '';
  if (!append && gifs.length === 0) {
    gifPickerGrid.innerHTML = '<div class="gif-picker-empty">nenhum gif encontrado</div>';
    return;
  }
  for (const g of gifs) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'gif-picker-item';
    btn.innerHTML = `<img src="${g.preview}" alt="${escapeHtml(g.title)}" loading="lazy">`;
    btn.addEventListener('click', () => sendGif(g.url));
    gifPickerGrid.appendChild(btn);
  }
}

async function sendGif(url) {
  if (!currentChannel) return;
  closeGifPicker();
  const replyToId = pendingReplyTo ? pendingReplyTo.id : null;
  clearReplyTarget();
  await fetch(`/api/channels/${currentChannel.id}/messages/gif`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, reply_to_id: replyToId }),
  });
  // a mensagem aparece via broadcast (message_created), igual anexo normal
}
