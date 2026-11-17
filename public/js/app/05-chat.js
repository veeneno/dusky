// dusky — Chat: abrir canal, lista de mensagens e histórico
// Parte 5 de 28 do código do site (public/js/app/). Leia o README.md desta pasta antes de mexer.
//
// Todos os arquivos desta pasta são scripts comuns que dividem o MESMO escopo e são carregados em
// ordem pelo app.html: o que um declara no topo (const, let, function) os outros enxergam.
//
// Neste arquivo:
//   - chat
//   - histórico antigo (rolar pro topo carrega mais)

// ---------- chat ----------

const AT_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94"/></svg>';

async function selectChannel(ch, opts = {}) {
  if (ch.type === 'voice' && ch.can_connect === false && !(voiceChannel && voiceChannel.id === ch.id)) {
    toast('você não tem permissão pra entrar nessa call', 'error');
    return;
  }
  closeMediaViewer();
  hideCommandPopup();
  const sameChannel = !!(currentChannel && currentChannel.id === ch.id);
  currentChannel = ch;
  if (ch.type === 'text') markChannelRead(ch.id);
  if (ch.server_id != null) rememberLastChannel(ch.server_id, ch.id);
  setViewingHistory(false);
  if (!(opts.aroundId && sameChannel)) closeSidePanels();
  renderTyping();
  renderChannels();
  renderRail();
  clearPendingAttachment();
  clearReplyTarget();
  showComposerError('');

  if (ch.type === 'voice') {
    mainEmpty.hidden = true;
    chatView.hidden = true;
    callView.hidden = false;
    callChannelName.textContent = ch.name;
    renderCallParticipants();
    if (!voiceChannel || voiceChannel.id !== ch.id) {
      await joinVoiceCall(ch);
    }
    return;
  }

  callView.hidden = true;
  mainEmpty.hidden = true;
  chatView.hidden = false;

  const isDm = !!ch.dm;
  chatView.classList.toggle('is-dm', isDm);
  if (isDm) {
    const u = findUser(ch.userId);
    const name = u ? u.username : ch.name;
    chatChannelIcon.innerHTML = AT_ICON;
    chatChannelName.textContent = name;
    applyNameStyle(chatChannelName, u || { id: ch.userId });
    chatInput.placeholder = `mensagem para @${name}`;
    membersToggleBtn.hidden = true;
    memberPanel.hidden = true;
    dmProfilePanel.hidden = false;
    renderDmProfilePanel();
  } else {
    chatChannelIcon.innerHTML = ICONS.text;
    chatChannelName.textContent = ch.name;
    applyNameStyle(chatChannelName, null); // canal: sem efeito (o elemento é o mesmo da DM)
    chatInput.placeholder = `mensagem em #${ch.name}`;
    membersToggleBtn.hidden = false;
    memberPanel.hidden = memberPanelCollapsed;
    dmProfilePanel.hidden = true;
  }
  applyComposerPermissions();
  chatMessages.innerHTML = '<div class="chat-empty">carregando mensagens...</div>';

  const requestedId = ch.id;
  let data = null;
  try {
    const res = await fetch(`/api/channels/${ch.id}/messages${opts.aroundId ? `?around=${opts.aroundId}&limit=60` : ''}`);
    if (res.ok) data = await res.json();
  } catch (_) { /* cai no aviso abaixo */ }
  // se a pessoa trocou de canal enquanto carregava, descarta essa resposta
  if (!currentChannel || currentChannel.id !== requestedId) return;
  if (!data) {
    chatMessages.innerHTML = '<div class="chat-empty">não deu pra carregar as mensagens. tenta abrir o canal de novo.</div>';
    return;
  }
  currentMessages = data.messages || [];
  hasOlderMessages = !!data.has_more;
  renderMessages();
  if (opts.aroundId) {
    setViewingHistory(!!data.has_more_after);
    requestAnimationFrame(() => highlightMessage(opts.aroundId));
  } else {
    chatInput.focus();
  }
}

function messageGroupKey(m) {
  if (m.system_type) return `s${m.id}`; // aviso do sistema nunca agrupa com nada
  return m.user_id ? `u${m.user_id}` : `b${m.bot_name || 'bot'}`;
}

let stuckToBottom = true;
function isScrolledNearBottom() {
  return chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight < 120;
}

function renderMessages() {
  chatMessages.innerHTML = '';

  if (currentMessages.length === 0) {
    chatMessages.innerHTML = '<div class="chat-empty">nenhuma mensagem ainda — comece a conversa</div>';
    return;
  }

  chatMessages.appendChild(buildHistoryTop());
  let prev = null;
  for (const m of currentMessages) {
    chatMessages.appendChild(buildMessageEl(m, isContinuation(prev, m)));
    prev = m;
  }
  scrollToBottom();
  // canal com pouca mensagem não tem barra de rolagem — então nunca dispararia o "chegou no topo"
  maybeLoadOlderMessages();
}

function isContinuation(prev, m) {
  return !!prev
    && messageGroupKey(prev) === messageGroupKey(m)
    && (timeValue(m.created_at) - timeValue(prev.created_at)) < GROUP_WINDOW_MS;
}

// ---------- histórico antigo (rolar pro topo carrega mais) ----------
// o canal abre com as 50 mensagens mais recentes; chegando perto do topo, busca as 50 anteriores
// e encaixa em cima sem mexer no que a pessoa está lendo — até chegar no começo do canal.

function buildHistoryTop() {
  const el = document.createElement('div');
  el.className = 'chat-history-top';
  updateHistoryTop(el);
  return el;
}

function updateHistoryTop(el = chatMessages.querySelector('.chat-history-top')) {
  if (!el) return;
  if (hasOlderMessages) {
    el.classList.remove('is-start');
    el.textContent = loadingOlderMessages ? 'carregando mensagens antigas…' : '';
  } else {
    el.classList.add('is-start');
    const name = currentChannel ? (currentChannel.dm ? `@${chatChannelName.textContent}` : `#${currentChannel.name}`) : 'canal';
    el.textContent = `começo de ${name}`;
  }
}

function maybeLoadOlderMessages() {
  if (!hasOlderMessages || loadingOlderMessages || !currentChannel) return;
  if (chatMessages.scrollTop > 300) return;
  loadOlderMessages();
}

async function loadOlderMessages() {
  const channel = currentChannel;
  const oldest = currentMessages[0];
  if (!channel || !oldest) return;
  loadingOlderMessages = true;
  updateHistoryTop();
  try {
    const res = await fetch(`/api/channels/${channel.id}/messages?before=${oldest.id}&limit=50`);
    if (!res.ok || currentChannel !== channel) return;
    const data = await res.json();
    if (currentChannel !== channel || currentMessages[0] !== oldest) return; // trocou de canal no meio
    const older = data.messages || [];
    hasOlderMessages = !!data.has_more;
    if (!older.length) return;

    // guarda a distância até o fim pra devolver a pessoa exatamente no mesmo ponto da leitura
    const fromBottom = chatMessages.scrollHeight - chatMessages.scrollTop;

    const frag = document.createDocumentFragment();
    let prev = null;
    for (const m of older) {
      const el = buildMessageEl(m, isContinuation(prev, m));
      el.classList.add('no-anim'); // histórico antigo entra quieto, sem animação de "mensagem nova"
      frag.appendChild(el);
      prev = m;
    }
    // a mensagem que era a primeira agora pode virar continuação da última carregada
    const firstEl = chatMessages.querySelector(`.msg-group[data-message-id="${oldest.id}"]`);
    if (firstEl && isContinuation(prev, oldest) !== firstEl.classList.contains('is-continued')) {
      const rebuilt = buildMessageEl(oldest, isContinuation(prev, oldest));
      rebuilt.classList.add('no-anim');
      firstEl.replaceWith(rebuilt);
    }
    const top = chatMessages.querySelector('.chat-history-top');
    if (top) top.after(frag);
    else chatMessages.prepend(frag);
    currentMessages = older.concat(currentMessages);

    chatMessages.scrollTop = chatMessages.scrollHeight - fromBottom;
  } catch (_) {
    /* sem conexão — tenta de novo na próxima rolagem */
  } finally {
    loadingOlderMessages = false;
    updateHistoryTop();
  }
  // se mesmo assim a tela ainda não encheu (mensagens curtinhas), continua puxando
  if (currentChannel === channel) requestAnimationFrame(maybeLoadOlderMessages);
}

chatMessages.addEventListener('scroll', maybeLoadOlderMessages, { passive: true });

// "grudado no fim": se a pessoa está no fim da conversa, qualquer imagem/vídeo/prévia que termine de
// carregar depois (e empurre tudo pra cima) mantém a rolagem lá embaixo. load não borbulha, por isso
// a escuta é na fase de captura.
chatMessages.addEventListener('scroll', () => { stuckToBottom = isScrolledNearBottom(); }, { passive: true });
const keepStuck = () => { if (stuckToBottom) scrollToBottom(); };
chatMessages.addEventListener('load', keepStuck, true);
chatMessages.addEventListener('loadedmetadata', keepStuck, true);

// adiciona só a mensagem nova ao DOM (sem reconstruir a lista inteira) — evita replay da
// animação de entrada em todo o histórico e evita perder a posição do scroll a cada mensagem
function appendMessageToDom(m) {
  const empty = chatMessages.querySelector('.chat-empty');
  if (empty) empty.remove();

  const prev = currentMessages.length > 1 ? currentMessages[currentMessages.length - 2] : null;
  const continued = isContinuation(prev, m);

  const wasNearBottom = isScrolledNearBottom();
  const isMine = !!(currentUser && m.user_id === currentUser.id);

  const el = buildMessageEl(m, continued);
  chatMessages.appendChild(el);

  if (isMine || wasNearBottom) {
    scrollToBottom();
    // imagens/vídeos de anexo carregam de forma assíncrona e mudam a altura depois —
    // reforça o scroll quando o conteúdo terminar de carregar, senão a rolagem para "quase lá"
    const media = el.querySelector('img, video');
    if (media) {
      const reScroll = () => { if (isMine || isScrolledNearBottom()) scrollToBottom(); };
      media.addEventListener('load', reScroll, { once: true });
      media.addEventListener('loadedmetadata', reScroll, { once: true });
    }
  }
}

function removeMessageFromDom(messageId) {
  const el = chatMessages.querySelector(`.msg-group[data-message-id="${messageId}"]`);
  if (el) el.remove();
  if (currentMessages.length === 0) {
    chatMessages.innerHTML = '<div class="chat-empty">nenhuma mensagem ainda — comece a conversa</div>';
  }
}

// frases de boas-vindas (mensagens do sistema), no espírito das do Discord. A escolhida depende do
// id da mensagem, então todo mundo vê a mesma frase e ela não muda ao recarregar.
const WELCOME_LINES = [
  '{u} chegou. Bem-vindo!',
  '{u} acabou de pousar no servidor.',
  'Que bom ter você aqui, {u}.',
  '{u} entrou na festa.',
  'Eba, {u} chegou!',
  '{u} apareceu. Segura a vibe!',
  'Bem-vindo, {u}. A gente estava te esperando.',
  '{u} pulou pra dentro do servidor.',
  'Um {u} selvagem apareceu.',
  '{u} chegou. Trouxe pizza? Esperamos que sim.',
  'Abram alas: {u} chegou.',
  '{u} acabou de entrar. Finjam que estão ocupados!',
];
const SYSTEM_JOIN_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="12" x2="19" y2="12"/><polyline points="13 6 19 12 13 18"/></svg>';

function buildSystemMessageEl(m) {
  const el = document.createElement('div');
  el.className = 'msg-group is-system';
  el.dataset.messageId = m.id;
  const line = WELCOME_LINES[Math.abs(Number(m.id) || 0) % WELCOME_LINES.length];
  const [before, after] = line.split('{u}');
  el.innerHTML = `
      <span class="msg-system-icon">${SYSTEM_JOIN_ICON}</span>
      <div class="msg-system-body">
        <span class="msg-system-text"></span>
        <span class="msg-time">${formatTime(m.created_at)}</span>
      </div>`;
  const text = el.querySelector('.msg-system-text');
  const name = document.createElement('span');
  name.className = 'msg-author is-clickable';
  name.textContent = m.system_username || 'alguém';
  if (m.system_user_id) {
    name.dataset.userId = String(m.system_user_id);
    name.addEventListener('click', (e) => openViewProfile(m.system_user_id, e.currentTarget));
  }
  text.append(document.createTextNode(before), name, document.createTextNode(after || ''));
  applyAuthorColors(el);
  return el;
}

function buildMessageEl(m, continued) {
  if (m.system_type) return buildSystemMessageEl(m);
  const isBot = !m.user_id;
  const name = isBot ? (m.bot_name || 'bot') : m.username;

  const el = document.createElement('div');
  el.className = 'msg-group' + (continued ? ' is-continued' : '');
  el.dataset.messageId = m.id;

  const avatarInner = (!isBot && m.avatar_url)
    ? `<img src="${m.avatar_url}" alt="${escapeHtml(name)}">`
    : initials(name);

  el.innerHTML = `
      <div class="msg-avatar${isBot ? '' : ' is-clickable'}">${avatarInner}</div>
      <span class="msg-time-inline">${formatTime(m.created_at)}</span>
      <div class="msg-body">
        <div class="msg-meta">
          <span class="msg-author ${isBot ? 'is-bot' : 'is-clickable'}"${isBot ? '' : ` data-user-id="${Number(m.user_id)}"`}>${escapeHtml(name)}</span>
          ${isBot ? '<span class="msg-bot-tag">bot</span>' : ''}
          <span class="msg-time">${formatTime(m.created_at)}</span>
        </div>
        <div class="msg-text"></div>
      </div>
    `;
  if (!isBot) {
    applyAuthorColors(el);
    applyNameStyle(el.querySelector('.msg-author'), { id: m.user_id, name_style: m.name_style });
    applyAvatarDeco(el.querySelector('.msg-avatar'), { id: m.user_id, avatar_deco: m.avatar_deco, accent_color: m.accent_color, accent_color_2: m.accent_color_2 });
  }
  renderMessageText(el.querySelector('.msg-text'), m.content || '', !!m.edited, m);
  if (messageMentionsMe(m)) el.classList.add('mentions-me');
  if (m.pinned) {
    const pin = document.createElement('span');
    pin.className = 'msg-pinned';
    pin.title = 'mensagem fixada';
    pin.innerHTML = PIN_ICON;
    el.querySelector('.msg-meta').appendChild(pin);
  }

  if (m.embed_json) {
    try {
      const embed = JSON.parse(m.embed_json);
      el.querySelector('.msg-body').appendChild(buildEmbedEl(embed));
    } catch (_) { /* embed malformado — ignora silenciosamente, mensagem de texto já apareceu */ }
  }

  if (!isBot) {
    const msgAvatarEl = el.querySelector('.msg-avatar');
    const msgAuthorEl = el.querySelector('.msg-author');
    msgAvatarEl.addEventListener('click', (e) => openViewProfile(m.user_id, e.currentTarget));
    msgAuthorEl.addEventListener('click', (e) => openViewProfile(m.user_id, e.currentTarget));
    // botão direito também funciona aqui — ajusta volume/muta local/oculta vídeo dessa pessoa,
    // igual em qualquer outro lugar do app onde o perfil dela aparece
    if (!currentUser || currentUser.id !== m.user_id) {
      const openVolumeMenu = (e) => { e.preventDefault(); openParticipantContextMenu(e, m.user_id, m.username); };
      msgAvatarEl.addEventListener('contextmenu', openVolumeMenu);
      msgAuthorEl.addEventListener('contextmenu', openVolumeMenu);
    }
  }

  if (m.reply_to_id) {
    const ref = document.createElement('div');
    ref.className = 'msg-reply-ref';
    const refName = m.reply_username || m.reply_bot_name || 'mensagem apagada';
    const refSnippet = m.reply_content
      ? DuskyMarkdown.plain(m.reply_content, mentionContext(m))
      : (m.reply_attachment_type === 'video' ? 'vídeo' : m.reply_attachment_type === 'file' ? 'arquivo' : m.reply_attachment_type === 'image' ? 'imagem' : '');
    ref.innerHTML = `<span class="msg-reply-ref-icon">${MSG_REPLY_ICON}</span><span class="msg-reply-ref-name">${escapeHtml(refName)}</span><span class="msg-reply-ref-snippet"></span>`;
    ref.querySelector('.msg-reply-ref-snippet').textContent = refSnippet;
    ref.addEventListener('click', () => jumpToMessage(m.reply_to_id));
    el.querySelector('.msg-body').insertBefore(ref, el.querySelector('.msg-meta'));
  }

  if (m.attachment_url) {
    const wrap = document.createElement('div');
    if (m.attachment_type === 'video') {
      wrap.className = 'msg-attachment msg-attachment-video';
      wrap.appendChild(createVideoPlayer(m.attachment_url, { hoverPreview: true, onExpand: (t) => openMediaViewer(m, { startAt: t }) }));
    } else if (m.attachment_type === 'file') {
      // arquivo genérico (não imagem/vídeo) — chip de download com nome e tamanho, sem preview
      wrap.className = 'msg-attachment msg-attachment-file';
      const fname = m.attachment_name || 'arquivo';
      const fsize = formatFileSize(m.attachment_size);
      wrap.innerHTML = `
          <a href="${m.attachment_url}" download="${escapeHtml(fname)}" class="msg-file-chip">
            <span class="msg-file-chip-icon">${FILE_ICON}</span>
            <span class="msg-file-chip-info">
              <span class="msg-file-chip-name"></span>
              <span class="msg-file-chip-size">${escapeHtml(fsize)}</span>
            </span>
            <span class="msg-file-chip-download">${DOWNLOAD_ICON}</span>
          </a>
        `;
      wrap.querySelector('.msg-file-chip-name').textContent = fname;
    } else {
      wrap.className = 'msg-attachment msg-attachment-image is-loading' + (m.attachment_type === 'gif' || /\.gif($|\?)/i.test(m.attachment_url) ? ' is-gif' : '');
      wrap.innerHTML = `<button type="button" class="msg-media-btn" aria-label="abrir imagem"><img src="${escapeAttr(m.attachment_url)}" alt="anexo" loading="lazy"></button>`;
      const img = wrap.querySelector('img');
      const loaded = () => wrap.classList.remove('is-loading');
      if (img.complete) loaded(); else { img.addEventListener('load', loaded, { once: true }); img.addEventListener('error', () => { wrap.classList.remove('is-loading'); wrap.classList.add('is-broken'); }, { once: true }); }
      wrap.querySelector('.msg-media-btn').addEventListener('click', () => openMediaViewer(m));
    }
    el.querySelector('.msg-body').appendChild(wrap);
  }

  attachLinkEmbeds(el, m);
  el.querySelector('.msg-body').appendChild(buildReactionsEl(m));

  // barrinha de ações que aparece no hover: reagir, fixar, responder, editar, apagar
  const actions = document.createElement('div');
  actions.className = 'msg-actions';
  el.appendChild(actions);

  const reactBtn = document.createElement('button');
  reactBtn.type = 'button';
  reactBtn.className = 'msg-action-btn';
  reactBtn.title = 'reagir';
  reactBtn.innerHTML = REACT_ICON;
  reactBtn.addEventListener('click', () => DuskyEmoji.open({ anchor: reactBtn, onPick: (emoji) => toggleReaction(m, emoji) }));
  reactBtn.disabled = !currentChannelAllows('react');
  actions.appendChild(reactBtn);

  const pinBtn = document.createElement('button');
  pinBtn.type = 'button';
  pinBtn.className = 'msg-action-btn' + (m.pinned ? ' is-on' : '');
  pinBtn.title = m.pinned ? 'desafixar' : 'fixar mensagem';
  pinBtn.innerHTML = PIN_ICON;
  pinBtn.addEventListener('click', () => togglePin(m));
  pinBtn.disabled = !currentChannelAllows('pin');
  actions.appendChild(pinBtn);

  if (!isBot) {
    const replyBtn = document.createElement('button');
    replyBtn.className = 'msg-reply-btn';
    replyBtn.title = 'responder';
    replyBtn.innerHTML = MSG_REPLY_ICON;
    replyBtn.addEventListener('click', () => setReplyTarget(m));
    actions.appendChild(replyBtn);
  }

  if (!isBot && m.user_id && currentUser && m.user_id !== currentUser.id) {
    const reportBtn = document.createElement('button');
    reportBtn.type = 'button';
    reportBtn.className = 'msg-action-btn';
    reportBtn.title = 'denunciar';
    reportBtn.innerHTML = FLAG_ICON;
    reportBtn.addEventListener('click', () => openReportDialog({ messageId: m.id, name: m.username }));
    actions.appendChild(reportBtn);
  }

  if (canEditMessage(m)) {
    const editBtn = document.createElement('button');
    editBtn.className = 'msg-edit-btn';
    editBtn.title = 'editar mensagem';
    editBtn.innerHTML = MSG_EDIT_ICON;
    editBtn.addEventListener('click', () => startEditMessage(m, el));
    actions.appendChild(editBtn);
  }

  if (canDeleteMessage(m)) {
    const delBtn = document.createElement('button');
    delBtn.className = 'msg-delete-btn';
    delBtn.title = 'apagar mensagem';
    delBtn.innerHTML = MSG_TRASH_ICON;
    delBtn.addEventListener('click', () => deleteMessage(m.id));
    actions.appendChild(delBtn);
  }

  return el;
}

// só o autor edita (bot e gif não têm texto pra editar)
function canEditMessage(m) {
  return !!(currentUser && m.user_id && m.user_id === currentUser.id && m.attachment_type !== 'gif');
}

// troca o texto da mensagem por uma caixa de edição: Enter salva, Shift+Enter quebra linha, Esc cancela.
// a mensagem atualizada volta pra todo mundo pelo broadcast message_edited
function startEditMessage(m, el) {
  const textEl = el.querySelector('.msg-text');
  if (!textEl || el.classList.contains('is-editing')) return;
  el.classList.add('is-editing');

  const ta = document.createElement('textarea');
  ta.className = 'msg-edit-input';
  ta.value = decodeMentions(m.content || '', m);
  ta.maxLength = 4000;
  ta.rows = 1;
  const hint = document.createElement('div');
  hint.className = 'msg-edit-hint';
  const defaultHint = 'enter salva • esc cancela';
  hint.textContent = defaultHint;
  const wrap = document.createElement('div');
  wrap.className = 'msg-edit-wrap';
  wrap.append(ta, hint);
  textEl.hidden = true;
  textEl.after(wrap);

  const autosize = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 240) + 'px'; };
  const close = () => { wrap.remove(); textEl.hidden = false; el.classList.remove('is-editing'); };
  const fail = (msg) => {
    ta.disabled = false;
    hint.textContent = msg;
    hint.classList.add('is-error');
    ta.focus();
  };

  const save = async () => {
    const value = encodeShortcodes(encodeMentions(ta.value.trim()));
    if (value === (m.content || '').trim()) return close();
    if (!value && !m.attachment_url) { hint.textContent = 'a mensagem não pode ficar vazia (esc cancela)'; hint.classList.add('is-error'); return; }
    ta.disabled = true;
    hint.classList.remove('is-error');
    hint.textContent = 'salvando…';
    try {
      const res = await fetch(`/api/channels/${m.channel_id}/messages/${m.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: value }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return fail(data.error || 'não deu pra salvar');
      }
      close();
    } catch (_) {
      fail('sem conexão — não deu pra salvar');
    }
  };

  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
  });
  ta.addEventListener('input', () => {
    autosize();
    if (hint.classList.contains('is-error')) { hint.classList.remove('is-error'); hint.textContent = defaultHint; }
  });
  autosize();
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);
}

// quem pode apagar: o autor ou quem recebeu permissão de moderar mensagens
function canDeleteMessage(m) {
  return !!currentUser && (m.user_id === currentUser.id || (currentServerId != null && hasCurrentPermission('manage_messages')));
}

// rola até a mensagem original (se ainda estiver carregada) e pisca ela, tipo Discord
function jumpToMessage(messageId) {
  const el = chatMessages.querySelector(`.msg-group[data-message-id="${messageId}"]`);
  if (!el) {
    if (currentChannel) selectChannel(currentChannel, { aroundId: messageId });
    return;
  }
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.remove('is-highlighted');
  void el.offsetWidth; // força reflow pra poder tocar a animação de novo se já rodou antes
  el.classList.add('is-highlighted');
}

function setReplyTarget(m) {
  const isBot = !m.user_id;
  const name = isBot ? (m.bot_name || 'bot') : m.username;
  const snippet = m.content ? DuskyMarkdown.plain(m.content, mentionContext(m)) : (m.attachment_type === 'video' ? 'vídeo' : m.attachment_type === 'file' ? 'arquivo' : m.attachment_type === 'image' ? 'imagem' : '');
  pendingReplyTo = { id: m.id, authorName: name, snippet };
  replyPreviewName.textContent = name;
  replyPreviewSnippet.textContent = snippet;
  replyPreview.hidden = false;
  chatInput.focus();
}

function clearReplyTarget() {
  pendingReplyTo = null;
  replyPreview.hidden = true;
}

replyPreviewRemove.addEventListener('click', clearReplyTarget);

async function deleteMessage(messageId) {
  if (!currentChannel) return;
  await fetch(`/api/channels/${currentChannel.id}/messages/${messageId}`, { method: 'DELETE' });
  // remoção real chega via broadcast (message_deleted)
}

function scrollToBottom() {
  chatMessages.scrollTop = chatMessages.scrollHeight;
  stuckToBottom = true;
}
