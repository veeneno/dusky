// dusky — Conteúdo das mensagens: Markdown, reações, fixar e prévia de links
// Parte 6 de 28 do código do site (public/js/app/). Leia o README.md desta pasta antes de mexer.
//
// Todos os arquivos desta pasta são scripts comuns que dividem o MESMO escopo e são carregados em
// ordem pelo app.html: o que um declara no topo (const, let, function) os outros enxergam.
//
// Neste arquivo:
//   - conteúdo das mensagens: Markdown, menções, reações, prévia de links
//   - reações
//   - fixar
//   - prévia de links

// ===================================================================
// conteúdo das mensagens: Markdown, menções, reações, prévia de links
// ===================================================================

// quem é `id` pra mostrar numa menção: membro do servidor aberto, alguém já visto, ou o nome que
// veio junto com a mensagem (mention_users)
function mentionContext(m) {
  const extra = new Map(((m && m.mention_users) || []).map((u) => [u.id, u]));
  return {
    meId: currentUser ? currentUser.id : null,
    resolveUser: (id) => (currentUser && id === currentUser.id ? currentUser : null)
      || members.find((x) => x.id === id) || findUser(id) || extra.get(id) || null,
    onMention: (id, anchor) => openViewProfile(id, anchor),
  };
}

function messageMentionsMe(m) {
  if (!currentUser || !m || m.user_id === currentUser.id) return false;
  const text = m.content || '';
  return text.includes(`<@${currentUser.id}>`) || !!m.mentions_everyone || /(^|[^\w`])@(everyone|here)\b/.test(text);
}

// texto puro de uma mensagem (notificação, resposta, fixadas)
function messagePlain(m, fallback = '') {
  if (!m) return fallback;
  if (m.system_type === 'member_join') return `${m.system_username || 'alguém'} entrou no servidor`;
  const t = DuskyMarkdown.plain(m.content || '', mentionContext(m));
  if (t) return t;
  if (m.attachment_type === 'gif') return 'mandou um gif';
  if (m.attachment_type === 'image') return 'mandou uma imagem';
  if (m.attachment_type === 'video') return 'mandou um vídeo';
  if (m.attachment_type === 'file') return `mandou um arquivo${m.attachment_name ? `: ${m.attachment_name}` : ''}`;
  return fallback;
}

// escreve o texto da mensagem (Markdown) no elemento — nada de innerHTML, ver js/markdown.js
function renderMessageText(target, text, edited, m) {
  target.textContent = '';
  target.classList.toggle('is-jumbo', getPref('prefJumboEmoji') && DuskyMarkdown.isEmojiOnly(text));
  target.appendChild(DuskyMarkdown.render(text, mentionContext(m)));
  if (edited) {
    const tag = document.createElement('span');
    tag.className = 'msg-edited';
    tag.textContent = ' (editado)';
    const last = target.lastElementChild;
    if (last && /^(DIV|H1|H2|H3)$/.test(last.tagName)) last.appendChild(tag);
    else target.appendChild(tag);
  }
}

// ---------- reações ----------

const REACT_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>';
const PIN_ICON = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>';

function userName(id) {
  if (currentUser && id === currentUser.id) return 'você';
  const u = members.find((x) => x.id === id) || findUser(id);
  return u ? u.username : 'alguém';
}

async function toggleReaction(m, emoji) {
  const group = (m.reactions || []).find((r) => r.emoji === emoji);
  const mine = !!(group && currentUser && group.user_ids.includes(currentUser.id));
  try {
    const res = await fetch(`/api/channels/${m.channel_id}/messages/${m.id}/reactions/${encodeURIComponent(emoji)}`, { method: mine ? 'DELETE' : 'PUT' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast(data.error || 'não deu pra reagir', 'error');
    }
    // a atualização chega pra todo mundo pelo broadcast reactions_updated
  } catch (_) {
    toast('sem conexão — não deu pra reagir', 'error');
  }
}

function buildReactionsEl(m) {
  const wrap = document.createElement('div');
  wrap.className = 'msg-reactions';
  for (const r of m.reactions || []) {
    if (!r.user_ids.length) continue;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'msg-reaction';
    if (currentUser && r.user_ids.includes(currentUser.id)) b.classList.add('is-mine');
    b.innerHTML = '<span class="msg-reaction-emoji"></span><span class="msg-reaction-count"></span>';
    b.querySelector('.msg-reaction-emoji').textContent = r.emoji;
    b.querySelector('.msg-reaction-count').textContent = String(r.user_ids.length);
    const names = r.user_ids.slice(0, 8).map(userName);
    b.title = names.join(', ') + (r.user_ids.length > 8 ? ` e mais ${r.user_ids.length - 8}` : '') + ` reagiu com ${r.emoji}`;
    b.addEventListener('click', () => toggleReaction(m, r.emoji));
    wrap.appendChild(b);
  }
  if (wrap.children.length) {
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'msg-reaction msg-reaction-add';
    add.title = 'adicionar reação';
    add.innerHTML = REACT_ICON;
    add.addEventListener('click', () => DuskyEmoji.open({ anchor: add, onPick: (emoji) => toggleReaction(m, emoji) }));
    wrap.appendChild(add);
  }
  return wrap;
}

function refreshReactions(messageId) {
  const m = currentMessages.find((x) => x.id === messageId);
  const el = chatMessages.querySelector(`.msg-group[data-message-id="${messageId}"]`);
  if (!m || !el) return;
  const old = el.querySelector('.msg-reactions');
  const fresh = buildReactionsEl(m);
  if (old) old.replaceWith(fresh);
  else el.querySelector('.msg-body').appendChild(fresh);
}

// ---------- fixar ----------

async function togglePin(m) {
  try {
    const res = await fetch(`/api/channels/${m.channel_id}/messages/${m.id}/pin`, { method: m.pinned ? 'DELETE' : 'PUT' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) toast(data.error || 'não deu pra fixar', 'error');
    else toast(m.pinned ? 'mensagem desafixada' : 'mensagem fixada — veja pelo alfinete no topo');
  } catch (_) {
    toast('sem conexão', 'error');
  }
}

// ---------- prévia de links ----------

const embedCache = new Map(); // url -> Promise<embed|null>
function fetchEmbed(url) {
  if (!embedCache.has(url)) {
    embedCache.set(url, fetch(`/api/embed?url=${encodeURIComponent(url)}`)
      .then((r) => (r.ok ? r.json() : null)).then((d) => (d && d.embed) || null).catch(() => null));
  }
  return embedCache.get(url);
}

function buildLinkEmbedEl(e, m) {
  const card = document.createElement('div');
  if (e.type === 'image') {
    card.className = 'msg-embed-media';
    const img = document.createElement('img');
    img.src = e.image; img.alt = ''; img.loading = 'lazy';
    img.addEventListener('click', () => openMediaViewer({ ...m, id: -m.id, attachment_url: e.image, attachment_type: 'image' }));
    card.appendChild(img);
    return card;
  }
  if (e.type === 'video') {
    card.className = 'msg-embed-media';
    const v = document.createElement('video');
    v.src = e.video; v.controls = true; v.preload = 'metadata'; v.playsInline = true;
    card.appendChild(v);
    return card;
  }
  card.className = 'msg-link-embed' + (e.type === 'youtube' ? ' is-youtube' : '');
  if (e.color) card.style.setProperty('--embed-color', e.color);
  const text = document.createElement('div');
  text.className = 'msg-link-embed-text';
  if (e.site || e.author) {
    const site = document.createElement('div');
    site.className = 'msg-link-embed-site';
    site.textContent = e.type === 'youtube' && e.author ? `${e.site} · ${e.author}` : e.site;
    text.appendChild(site);
  }
  if (e.title) {
    const a = document.createElement('a');
    a.className = 'msg-link-embed-title';
    a.href = e.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
    a.textContent = e.title;
    text.appendChild(a);
  }
  if (e.description) {
    const d = document.createElement('div');
    d.className = 'msg-link-embed-desc';
    d.textContent = e.description;
    text.appendChild(d);
  }
  card.appendChild(text);

  if (e.type === 'youtube') {
    // miniatura com botão de play; clicando, vira o vídeo de verdade ali mesmo
    const player = document.createElement('button');
    player.type = 'button';
    player.className = 'msg-yt-thumb';
    player.setAttribute('aria-label', 'tocar vídeo');
    player.innerHTML = '<img alt="" loading="lazy"><span class="msg-yt-play"><svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></span>';
    player.querySelector('img').src = e.image;
    player.addEventListener('click', () => {
      const frame = document.createElement('iframe');
      frame.className = 'msg-yt-frame';
      frame.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(e.video_id)}?autoplay=1${e.start ? `&start=${e.start}` : ''}`;
      frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      frame.allowFullscreen = true;
      player.replaceWith(frame);
    });
    card.appendChild(player);
  } else if (e.image) {
    const img = document.createElement('img');
    img.className = e.large_image ? 'msg-link-embed-image' : 'msg-link-embed-thumb';
    img.src = e.image; img.alt = ''; img.loading = 'lazy';
    img.addEventListener('error', () => img.remove());
    img.addEventListener('click', () => openMediaViewer({ ...m, id: -m.id, attachment_url: e.image, attachment_type: 'image' }));
    card.appendChild(img);
    if (!e.large_image) card.classList.add('has-thumb');
  }
  return card;
}

function attachLinkEmbeds(el, m) {
  if (m.attachment_type === 'gif' || !getPref('prefLinkPreviews')) return;
  const urls = DuskyMarkdown.links(m.content || '');
  if (!urls.length) return;
  const holder = document.createElement('div');
  holder.className = 'msg-embeds';
  const body = el.querySelector('.msg-body');
  const reactions = body.querySelector('.msg-reactions');
  body.insertBefore(holder, reactions || null);
  for (const url of urls) {
    fetchEmbed(url).then((embed) => {
      if (!embed || !holder.isConnected) return;
      const near = isScrolledNearBottom();
      holder.appendChild(buildLinkEmbedEl(embed, m));
      if (near) scrollToBottom();
      holder.querySelectorAll('img').forEach((img) => img.addEventListener('load', () => { if (near && isScrolledNearBottom()) scrollToBottom(); }, { once: true }));
    });
  }
}
