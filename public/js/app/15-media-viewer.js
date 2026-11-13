// didiscord — Visualizador de imagens e vídeos
// Parte 15 de 28 do código do site (public/js/app/). Leia o README.md desta pasta antes de mexer.
//
// Todos os arquivos desta pasta são scripts comuns que dividem o MESMO escopo e são carregados em
// ordem pelo app.html: o que um declara no topo (const, let, function) os outros enxergam.
//
// Neste arquivo:
//   - visualizador de imagens e vídeos

// ===================================================================
// visualizador de imagens e vídeos
// ===================================================================

const mediaViewer = document.getElementById('mediaViewer');
const mediaViewerStage = document.getElementById('mediaViewerStage');
const mediaViewerAvatar = document.getElementById('mediaViewerAvatar');
const mediaViewerName = document.getElementById('mediaViewerName');
const mediaViewerDate = document.getElementById('mediaViewerDate');
const mediaViewerCount = document.getElementById('mediaViewerCount');
const mediaViewerZoom = document.getElementById('mediaViewerZoom');
const mediaViewerZoomReset = document.getElementById('mediaViewerZoomReset');
const mediaViewerOpen = document.getElementById('mediaViewerOpen');
const mediaViewerDownload = document.getElementById('mediaViewerDownload');
const mediaViewerPrev = document.getElementById('mediaViewerPrev');
const mediaViewerNext = document.getElementById('mediaViewerNext');
const mediaViewerCaption = document.getElementById('mediaViewerCaption');

const VIEWER_MAX_ZOOM = 8;
let viewerItems = [];
let viewerIndex = 0;
let viewerImg = null;
let viewerZoom = 1;
let viewerPan = { x: 0, y: 0 };
let viewerDrag = null;

function isViewableMedia(m) {
  return !!m.attachment_url && m.attachment_type !== 'file';
}

function viewerFileName(m) {
  if (m.attachment_name) return m.attachment_name;
  const last = String(m.attachment_url).split('?')[0].split('/').pop();
  return last || 'arquivo';
}

let viewerStartAt = 0;
let viewerRotation = 0;
const mediaViewerStrip = document.getElementById('mediaViewerStrip');
const mediaViewerBackdrop = document.getElementById('mediaViewerBackdrop');
const mediaViewerRotate = document.getElementById('mediaViewerRotate');
const mediaViewerCopy = document.getElementById('mediaViewerCopy');

function openMediaViewer(m, opts = {}) {
  viewerItems = currentMessages.filter(isViewableMedia);
  viewerIndex = viewerItems.findIndex((x) => x.id === m.id);
  if (viewerIndex < 0) { viewerItems = [m]; viewerIndex = 0; }
  viewerStartAt = opts.startAt || 0;
  mediaViewer.hidden = false;
  document.body.classList.add('is-viewing-media');
  renderViewerStrip();
  showViewerItem();
}

// miniaturas de todas as imagens/vídeos do canal, embaixo — clica pra pular
function renderViewerStrip() {
  mediaViewerStrip.innerHTML = '';
  mediaViewerStrip.hidden = viewerItems.length < 2;
  if (viewerItems.length < 2) return;
  viewerItems.forEach((item, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'media-viewer-thumb' + (item.attachment_type === 'video' ? ' is-video' : '');
    b.setAttribute('aria-label', `mídia ${i + 1}`);
    if (item.attachment_type === 'video') {
      const v = document.createElement('video');
      v.src = `${item.attachment_url}#t=0.5`; v.preload = 'metadata'; v.muted = true;
      b.appendChild(v);
    } else {
      const img = document.createElement('img');
      img.src = item.attachment_url; img.alt = ''; img.loading = 'lazy';
      b.appendChild(img);
    }
    b.addEventListener('click', () => { viewerIndex = i; viewerStartAt = 0; showViewerItem(); });
    mediaViewerStrip.appendChild(b);
  });
}

function syncViewerStrip() {
  mediaViewerStrip.querySelectorAll('.media-viewer-thumb').forEach((b, i) => {
    b.classList.toggle('is-active', i === viewerIndex);
    // centraliza a miniatura atual só rolando a faixa (scrollIntoView rolaria o visualizador inteiro)
    if (i === viewerIndex) mediaViewerStrip.scrollTo({ left: b.offsetLeft - (mediaViewerStrip.clientWidth - b.offsetWidth) / 2, behavior: 'smooth' });
  });
}

mediaViewerRotate.addEventListener('click', () => { viewerRotation = (viewerRotation + 90) % 360; applyViewerTransform(); });
mediaViewerCopy.addEventListener('click', async () => {
  const m = viewerItems[viewerIndex];
  if (!m) return;
  try {
    const blob = await fetch(m.attachment_url).then((r) => r.blob());
    let png = blob;
    if (blob.type !== 'image/png') {
      const bmp = await createImageBitmap(blob);
      const canvas = document.createElement('canvas');
      canvas.width = bmp.width; canvas.height = bmp.height;
      canvas.getContext('2d').drawImage(bmp, 0, 0);
      png = await new Promise((res) => canvas.toBlob(res, 'image/png'));
    }
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
    toast('imagem copiada');
  } catch (_) {
    toast('não deu pra copiar essa imagem', 'error');
  }
});

function closeMediaViewer() {
  if (mediaViewer.hidden) return;
  const video = mediaViewerStage.querySelector('video');
  if (video) video.pause();
  mediaViewerStrip.innerHTML = '';
  mediaViewerStage.innerHTML = '';
  viewerImg = null;
  mediaViewer.hidden = true;
  document.body.classList.remove('is-viewing-media');
}

function showViewerItem() {
  const m = viewerItems[viewerIndex];
  if (!m) { closeMediaViewer(); return; }
  const old = mediaViewerStage.querySelector('video');
  if (old) old.pause();
  mediaViewerStage.innerHTML = '';
  viewerImg = null;
  viewerZoom = 1;
  viewerPan = { x: 0, y: 0 };

  const author = m.bot_name
    ? { username: m.bot_name, avatar_url: null }
    : (findUser(m.user_id) || { username: m.username || 'alguém', avatar_url: m.avatar_url });
  mediaViewerAvatar.innerHTML = memberAvatarInner(author);
  mediaViewerName.textContent = author.username;
  const when = new Date(String(m.created_at).replace(' ', 'T') + (String(m.created_at).includes('Z') ? '' : 'Z'));
  mediaViewerDate.textContent = Number.isNaN(when.getTime())
    ? ''
    : when.toLocaleString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  mediaViewerCount.textContent = viewerItems.length > 1 ? `${viewerIndex + 1} de ${viewerItems.length}` : '';
  mediaViewerPrev.hidden = viewerIndex <= 0;
  mediaViewerNext.hidden = viewerIndex >= viewerItems.length - 1;
  mediaViewerOpen.href = m.attachment_url;
  mediaViewerDownload.href = m.attachment_url;
  mediaViewerDownload.setAttribute('download', viewerFileName(m));
  mediaViewerCaption.textContent = '';
  if (m.content) mediaViewerCaption.appendChild(DidiMarkdown.render(m.content, mentionContext(m)));
  mediaViewerCaption.hidden = !m.content;
  viewerRotation = 0;
  const isVideo = m.attachment_type === 'video';
  mediaViewerRotate.hidden = isVideo;
  mediaViewerCopy.hidden = isVideo || typeof ClipboardItem === 'undefined';
  mediaViewerBackdrop.style.backgroundImage = isVideo ? 'none' : `url("${String(m.attachment_url).replace(/"/g, '%22')}")`;
  syncViewerStrip();

  if (isVideo) {
    mediaViewerZoom.hidden = true;
    const player = createVideoPlayer(m.attachment_url, { large: true, autoplay: true, startAt: viewerStartAt });
    player.classList.add('media-viewer-video');
    mediaViewerStage.appendChild(player);
    player.video.play().catch(() => { /* sem autoplay: a pessoa aperta o play */ });
    viewerStartAt = 0;
  } else {
    mediaViewerZoom.hidden = false;
    const img = document.createElement('img');
    img.className = 'media-viewer-img';
    img.src = m.attachment_url;
    img.alt = viewerFileName(m);
    img.draggable = false;
    mediaViewerStage.appendChild(img);
    viewerImg = img;
    applyViewerTransform();
  }
}

function applyViewerTransform() {
  mediaViewerZoomReset.textContent = `${Math.round(viewerZoom * 100)}%`;
  mediaViewerStage.classList.toggle('is-zoomed', viewerZoom > 1);
  if (viewerImg) viewerImg.style.transform = `translate(${viewerPan.x}px, ${viewerPan.y}px) scale(${viewerZoom}) rotate(${viewerRotation}deg)`;
}

// não deixa a imagem ampliada "fugir" da tela: o arrasto para na borda
function clampViewerPan() {
  if (!viewerImg) return;
  const stage = mediaViewerStage.getBoundingClientRect();
  const maxX = Math.max(0, (viewerImg.offsetWidth * viewerZoom - stage.width) / 2);
  const maxY = Math.max(0, (viewerImg.offsetHeight * viewerZoom - stage.height) / 2);
  viewerPan.x = Math.max(-maxX, Math.min(maxX, viewerPan.x));
  viewerPan.y = Math.max(-maxY, Math.min(maxY, viewerPan.y));
}

// zoom mantendo parado o ponto embaixo do cursor (cx, cy relativos ao centro da área)
function setViewerZoom(z, cx = 0, cy = 0) {
  if (!viewerImg) return;
  const next = Math.max(1, Math.min(VIEWER_MAX_ZOOM, z));
  viewerPan.x = cx - (cx - viewerPan.x) * (next / viewerZoom);
  viewerPan.y = cy - (cy - viewerPan.y) * (next / viewerZoom);
  viewerZoom = next;
  if (viewerZoom === 1) viewerPan = { x: 0, y: 0 };
  clampViewerPan();
  applyViewerTransform();
}

function stageOffset(e) {
  const r = mediaViewerStage.getBoundingClientRect();
  return { cx: e.clientX - (r.left + r.width / 2), cy: e.clientY - (r.top + r.height / 2) };
}

function viewerStep(delta) {
  const next = viewerIndex + delta;
  if (next < 0 || next >= viewerItems.length) return;
  viewerIndex = next;
  showViewerItem();
}

mediaViewerStage.addEventListener('wheel', (e) => {
  if (!viewerImg) return;
  e.preventDefault();
  const { cx, cy } = stageOffset(e);
  setViewerZoom(viewerZoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15), cx, cy);
}, { passive: false });

mediaViewerStage.addEventListener('dblclick', (e) => {
  if (!viewerImg || e.target !== viewerImg) return;
  const { cx, cy } = stageOffset(e);
  setViewerZoom(viewerZoom > 1 ? 1 : 2.5, cx, cy);
});

mediaViewerStage.addEventListener('pointerdown', (e) => {
  if (!viewerImg || e.target !== viewerImg || viewerZoom <= 1) return;
  viewerDrag = { x: e.clientX, y: e.clientY, panX: viewerPan.x, panY: viewerPan.y, id: e.pointerId };
  mediaViewerStage.setPointerCapture(e.pointerId);
  mediaViewerStage.classList.add('is-panning');
});
mediaViewerStage.addEventListener('pointermove', (e) => {
  if (!viewerDrag || e.pointerId !== viewerDrag.id) return;
  viewerPan.x = viewerDrag.panX + (e.clientX - viewerDrag.x);
  viewerPan.y = viewerDrag.panY + (e.clientY - viewerDrag.y);
  clampViewerPan();
  applyViewerTransform();
});
const endViewerDrag = () => {
  viewerDrag = null;
  mediaViewerStage.classList.remove('is-panning');
};
mediaViewerStage.addEventListener('pointerup', endViewerDrag);
mediaViewerStage.addEventListener('pointercancel', endViewerDrag);

// clicar no fundo (fora da imagem/vídeo) fecha
mediaViewerStage.addEventListener('click', (e) => {
  if (e.target === mediaViewerStage) closeMediaViewer();
});

document.getElementById('mediaViewerClose').addEventListener('click', closeMediaViewer);
document.getElementById('mediaViewerZoomIn').addEventListener('click', () => setViewerZoom(viewerZoom * 1.5));
document.getElementById('mediaViewerZoomOut').addEventListener('click', () => setViewerZoom(viewerZoom / 1.5));
mediaViewerZoomReset.addEventListener('click', () => setViewerZoom(1));
mediaViewerPrev.addEventListener('click', () => viewerStep(-1));
mediaViewerNext.addEventListener('click', () => viewerStep(1));
window.addEventListener('resize', () => { if (!mediaViewer.hidden) { clampViewerPan(); applyViewerTransform(); } });

// teclado do visualizador (fase de captura: tem prioridade sobre os outros atalhos com Esc)
document.addEventListener('keydown', (e) => {
  if (mediaViewer.hidden) return;
  if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); closeMediaViewer(); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); viewerStep(-1); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); viewerStep(1); }
  else if (e.key === '+' || e.key === '=') setViewerZoom(viewerZoom * 1.5);
  else if (e.key === '-') setViewerZoom(viewerZoom / 1.5);
  else if (e.key === '0') setViewerZoom(1);
  else if ((e.key === 'r' || e.key === 'R') && viewerImg) { viewerRotation = (viewerRotation + 90) % 360; applyViewerTransform(); }
}, true);
