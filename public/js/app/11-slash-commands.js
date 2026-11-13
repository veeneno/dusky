// didiscord — Menu de comandos ("/") e envio de mensagem
// Parte 11 de 28 do código do site (public/js/app/). Leia o README.md desta pasta antes de mexer.
//
// Todos os arquivos desta pasta são scripts comuns que dividem o MESMO escopo e são carregados em
// ordem pelo app.html: o que um declara no topo (const, let, function) os outros enxergam.
//
// Neste arquivo:
//   - menu de comandos ("/") e autocompletar do /play

// ===================================================================
// menu de comandos ("/") e autocompletar do /play
// ===================================================================
// Digitou "/" no começo da mensagem num canal de servidor: aparece a lista de comandos do bot
// de música, filtrando enquanto digita. Em "/play <algo>", aparecem os 5 primeiros resultados
// do YouTube (buscados no servidor, ver routes/musicbot.js). ↑ ↓ escolhem, Enter/Tab confirmam,
// Esc fecha.

const BOT_COMMANDS = [
  { name: 'play', args: '<música ou link>', desc: 'toca na sua call — nome da música, link do YouTube ou do Spotify' },
  { name: 'search', args: '<música>', desc: 'mostra 5 resultados pra escolher com /play <número>' },
  { name: 'skip', desc: 'pula a música atual' },
  { name: 'skipto', args: '<posição>', desc: 'pula direto pra uma posição da fila' },
  { name: 'pause', desc: 'pausa ou continua a música' },
  { name: 'stop', desc: 'para a música e limpa a fila' },
  { name: 'shuffle', desc: 'embaralha a fila' },
  { name: 'queue', args: '[página | clear]', desc: 'mostra a fila (ou limpa com /queue clear)' },
  { name: 'volume', args: '<0 a 200>', desc: 'muda o volume do bot pra todo mundo' },
];
const PLAY_SEARCH_DEBOUNCE_MS = 350;

const commandPopup = document.getElementById('commandPopup');
let popupMode = null; // null | 'commands' | 'play'
let popupItems = []; // { kind: 'command' | 'track', ... }
let popupIndex = 0;
let playSearchTimer = null;
let playSearchToken = 0;
let playSearchQuery = '';

function botIdentity() {
  const b = bots.find((x) => x.id === 'musicbot');
  return { name: b ? b.name : 'DJ didiscord', avatar: b ? b.avatar_url : null };
}

function hideCommandPopup() {
  popupMode = null;
  popupItems = [];
  commandPopup.hidden = true;
  commandPopup.innerHTML = '';
  clearTimeout(playSearchTimer);
  playSearchToken++; // descarta busca em andamento
  chatInput.removeAttribute('aria-activedescendant');
}

function setPopupIndex(i) {
  if (!popupItems.length) return;
  popupIndex = (i + popupItems.length) % popupItems.length;
  commandPopup.querySelectorAll('.command-item').forEach((el, idx) => {
    const active = idx === popupIndex;
    el.classList.toggle('is-active', active);
    el.setAttribute('aria-selected', active ? 'true' : 'false');
    if (active) {
      el.scrollIntoView({ block: 'nearest' });
      chatInput.setAttribute('aria-activedescendant', el.id);
    }
  });
}

function renderPopup(header, emptyText) {
  const bot = botIdentity();
  commandPopup.innerHTML = '';
  const head = document.createElement('div');
  head.className = 'command-popup-head';
  head.textContent = header;
  commandPopup.appendChild(head);

  if (!popupItems.length) {
    const empty = document.createElement('div');
    empty.className = 'command-popup-empty';
    empty.textContent = emptyText || 'nada por aqui';
    commandPopup.appendChild(empty);
  }

  popupItems.forEach((item, idx) => {
    const el = document.createElement('div');
    el.className = 'command-item' + (item.kind === 'track' ? ' is-track' : '');
    el.id = `command-item-${idx}`;
    el.setAttribute('role', 'option');
    if (item.kind === 'mention') {
      el.classList.add('is-mention');
      el.innerHTML = `
          <span class="command-item-avatar">${memberAvatarInner(item.user)}</span>
          <span class="command-item-text"><span class="command-item-name"><strong></strong></span></span>
          <span class="command-item-source"></span>`;
      el.querySelector('strong').textContent = item.user.username;
      el.querySelector('.command-item-source').textContent = currentUser && item.user.id === currentUser.id ? 'você' : (item.user.online ? 'online' : '');
    } else if (item.kind === 'mention-special') {
      el.classList.add('is-mention');
      el.innerHTML = `
          <span class="command-item-avatar is-special">@</span>
          <span class="command-item-text"><span class="command-item-name"><strong></strong></span><span class="command-item-desc"></span></span>`;
      el.querySelector('strong').textContent = '@' + item.name;
      el.querySelector('.command-item-desc').textContent = item.name === 'everyone' ? 'avisa todo mundo que vê este canal' : 'avisa quem está online';
    } else if (item.kind === 'emoji') {
      el.classList.add('is-emoji');
      el.innerHTML = `
          <span class="command-item-emoji"></span>
          <span class="command-item-text"><span class="command-item-name"><strong></strong></span></span>
          <span class="command-item-source"></span>`;
      el.querySelector('.command-item-emoji').textContent = item.emoji.emoji;
      el.querySelector('strong').textContent = item.emoji.codes.length ? `:${item.emoji.codes[0]}:` : item.emoji.name;
      el.querySelector('.command-item-source').textContent = item.emoji.name;
    } else if (item.kind === 'command') {
      el.innerHTML = `
          <span class="command-item-icon">${bot.avatar ? `<img src="${escapeAttr(bot.avatar)}" alt="">` : '♪'}</span>
          <span class="command-item-text">
            <span class="command-item-name"><strong></strong><span class="command-item-args"></span></span>
            <span class="command-item-desc"></span>
          </span>
          <span class="command-item-source"></span>`;
      el.querySelector('strong').textContent = `/${item.cmd.name}`;
      el.querySelector('.command-item-args').textContent = item.cmd.args || '';
      el.querySelector('.command-item-desc').textContent = item.cmd.desc;
      el.querySelector('.command-item-source').textContent = bot.name;
    } else {
      el.innerHTML = `
          <span class="command-item-thumb"><img src="${escapeAttr(item.track.thumbnail)}" alt="" loading="lazy"></span>
          <span class="command-item-text">
            <span class="command-item-name"><strong></strong></span>
            <span class="command-item-desc"></span>
          </span>
          <span class="command-item-duration"></span>`;
      el.querySelector('strong').textContent = item.track.title;
      el.querySelector('.command-item-desc').textContent = item.track.artist || 'YouTube';
      el.querySelector('.command-item-duration').textContent = item.track.duration || '';
    }
    // mousedown (não click): escolhe antes do input perder o foco
    el.addEventListener('mousedown', (e) => {
      e.preventDefault();
      popupIndex = idx;
      choosePopupItem();
    });
    el.addEventListener('mousemove', () => { if (popupIndex !== idx) setPopupIndex(idx); });
    commandPopup.appendChild(el);
  });

  commandPopup.hidden = false;
  setPopupIndex(Math.min(popupIndex, Math.max(0, popupItems.length - 1)));
}

function renderPlayLoading(query) {
  commandPopup.innerHTML = '';
  const head = document.createElement('div');
  head.className = 'command-popup-head';
  head.textContent = `buscando "${query}" no YouTube…`;
  const loading = document.createElement('div');
  loading.className = 'command-popup-loading';
  loading.innerHTML = '<span></span><span></span><span></span>';
  commandPopup.append(head, loading);
  commandPopup.hidden = false;
}

function updateCommandPopup() {
  if (!currentChannel || currentChannel.type !== 'text') { hideCommandPopup(); return; }
  // @menção e :emoji: funcionam em qualquer canal de texto (inclusive DM)
  if (updateMentionOrEmojiPopup()) return;
  // comandos só fazem sentido em canal de texto de servidor (o bot não toca em DM)
  if (currentChannel.dm || pendingAttachment) {
    hideCommandPopup();
    return;
  }
  const value = chatInput.value;

  // "/pl" -> lista de comandos filtrada
  const cmdMatch = /^\/(\S*)$/.exec(value);
  if (cmdMatch) {
    const typed = cmdMatch[1].toLowerCase();
    const list = BOT_COMMANDS.filter((c) => c.name.startsWith(typed));
    if (popupMode !== 'commands') popupIndex = 0;
    popupMode = 'commands';
    popupItems = list.map((cmd) => ({ kind: 'command', cmd }));
    if (!list.length) { hideCommandPopup(); return; }
    renderPopup(typed ? `comandos com "/${typed}"` : 'comandos do bot de música');
    return;
  }

  // "/play jane" -> sugestões do YouTube
  const playMatch = /^\/play\s+(.+)$/i.exec(value);
  if (playMatch) {
    const query = playMatch[1].trim();
    if (query.length < 2 || /^https?:\/\//i.test(query) || /^\d+$/.test(query)) {
      hideCommandPopup(); // link ou "/play 3" (depois de um /search) não precisam de sugestão
      return;
    }
    if (popupMode === 'play' && query === playSearchQuery && popupItems.length) return; // nada mudou
    popupMode = 'play';
    playSearchQuery = query;
    popupItems = [];
    popupIndex = 0;
    renderPlayLoading(query);
    clearTimeout(playSearchTimer);
    const token = ++playSearchToken;
    playSearchTimer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/musicbot/search?q=${encodeURIComponent(query)}`);
        const data = await res.json().catch(() => ({}));
        if (token !== playSearchToken || popupMode !== 'play') return; // já digitou outra coisa
        popupItems = (data.results || []).map((track) => ({ kind: 'track', track }));
        renderPopup(`resultados pra "${query}"`, data.error ? `não deu pra buscar: ${data.error}` : 'nada encontrado — Enter manda assim mesmo');
      } catch (_) {
        if (token === playSearchToken) hideCommandPopup();
      }
    }, PLAY_SEARCH_DEBOUNCE_MS);
    return;
  }

  hideCommandPopup();
}

function choosePopupItem() {
  const item = popupItems[popupIndex];
  if (!item) return false;
  if (item.kind === 'mention' || item.kind === 'mention-special' || item.kind === 'emoji') {
    const insert = item.kind === 'mention' ? `@${item.user.username} `
      : item.kind === 'mention-special' ? `@${item.name} ` : `${item.emoji.emoji} `;
    hideCommandPopup();
    replaceToken(item.token, insert);
    return true;
  }
  if (item.kind === 'command') {
    if (item.cmd.args) {
      // comando com argumento: completa e deixa a pessoa digitar (no /play já começa a sugerir)
      chatInput.value = `/${item.cmd.name} `;
      hideCommandPopup();
      chatInput.focus();
      updateCommandPopup();
    } else {
      // sem argumento (/skip, /stop...): já manda
      chatInput.value = `/${item.cmd.name}`;
      hideCommandPopup();
      chatComposer.requestSubmit();
    }
    return true;
  }
  // música escolhida: manda o /play com o link exato dela
  chatInput.value = `/play ${item.track.url}`;
  hideCommandPopup();
  chatComposer.requestSubmit();
  return true;
}

chatInput.addEventListener('input', () => { autosizeComposer(); notifyTyping(); updateCommandPopup(); });
chatInput.addEventListener('click', updateCommandPopup);
chatInput.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== chatInput) hideCommandPopup(); }, 150));

chatInput.addEventListener('keydown', (e) => {
  if (commandPopup.hidden) return;
  if (e.key === 'ArrowDown') { e.preventDefault(); setPopupIndex(popupIndex + 1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); setPopupIndex(popupIndex - 1); }
  else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); hideCommandPopup(); }
  else if ((e.key === 'Enter' || e.key === 'Tab') && !e.shiftKey && popupItems.length) {
    e.preventDefault(); // não deixa o formulário enviar o texto cru — quem decide é choosePopupItem
    choosePopupItem();
  } else if (e.key === 'Tab') {
    e.preventDefault(); // ainda carregando: Tab não tira o foco da caixa de mensagem
  }
});

chatInput.addEventListener('keydown', (e) => {
  if (e.defaultPrevented || e.isComposing) return;
  // Enter envia (ou, se a pessoa preferir, Enter quebra linha e Ctrl+Enter envia)
  const sends = getPref('prefEnterSends') ? (!e.shiftKey && !e.ctrlKey) : (e.ctrlKey || e.metaKey);
  if (e.key === 'Enter' && sends) {
    e.preventDefault();
    chatComposer.requestSubmit();
  } else if (e.key === 'ArrowUp' && !chatInput.value) {
    // seta pra cima com a caixa vazia: edita a sua última mensagem (igual o Discord)
    const mine = [...currentMessages].reverse().find(canEditMessage);
    const el = mine && chatMessages.querySelector(`.msg-group[data-message-id="${mine.id}"]`);
    if (el) { e.preventDefault(); startEditMessage(mine, el); }
  }
});

const emojiBtn = document.getElementById('emojiBtn');
if (emojiBtn) {
  emojiBtn.addEventListener('click', () => {
    DidiEmoji.open({
      anchor: emojiBtn,
      onPick: (emoji) => {
        const start = chatInput.selectionStart ?? chatInput.value.length;
        const end = chatInput.selectionEnd ?? start;
        chatInput.value = chatInput.value.slice(0, start) + emoji + chatInput.value.slice(end);
        const caret = start + emoji.length;
        chatInput.focus();
        chatInput.setSelectionRange(caret, caret);
        autosizeComposer();
      },
    });
  });
}

chatComposer.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!currentChannelAllows('send')) return showComposerError('você não pode escrever neste canal');
  hideCommandPopup();
  if (!currentChannel) return;
  const content = encodeShortcodes(encodeMentions(chatInput.value.trim()));
  const replyToId = pendingReplyTo ? pendingReplyTo.id : null;

  if (pendingAttachment) {
    const file = pendingAttachment;
    const caption = content;
    showComposerError('');

    // NÃO limpa o anexo pendente nem o input aqui — só depois do upload confirmar sucesso
    // (xhr 'load' com status 2xx). Assim, se a conexão cair ou o servidor recusar o arquivo
    // (ex: 2GB é bastante coisa numa conexão ruim), o anexo e a legenda continuam ali pra
    // a pessoa só clicar em enviar de novo, em vez de ter que escolher o arquivo outra vez.
    attachBtn.disabled = true;
    chatSendBtn.disabled = true;
    showUploadProgress(0, 0, file.size);

    const formData = new FormData();
    formData.append('file', file);
    if (caption) formData.append('content', caption);
    if (replyToId) formData.append('reply_to_id', replyToId);

    const xhr = new XMLHttpRequest();
    activeUploadXhr = xhr;
    xhr.open('POST', `/api/channels/${currentChannel.id}/messages/attachment`);

    // progresso real de upload — fetch() não expõe isso de forma confiável, por isso o XHR
    xhr.upload.addEventListener('progress', (ev) => {
      if (!ev.lengthComputable) return;
      const percent = Math.round((ev.loaded / ev.total) * 100);
      showUploadProgress(percent, ev.loaded, ev.total);
    });

    xhr.addEventListener('load', () => {
      activeUploadXhr = null;
      attachBtn.disabled = false;
      chatSendBtn.disabled = false;
      if (xhr.status >= 200 && xhr.status < 300) {
        clearPendingAttachment();
        chatInput.value = '';
        autosizeComposer();
        clearReplyTarget();
        // a mensagem em si aparece via broadcast (message_created), igual todo o resto
      } else {
        let errMsg = 'não deu pra enviar esse arquivo';
        try {
          const data = JSON.parse(xhr.responseText);
          if (data && data.error) errMsg = data.error;
        } catch (_) { /* resposta não veio em JSON — segue com a mensagem padrão */ }
        hideUploadProgress();
        showComposerError(errMsg);
      }
    });

    xhr.addEventListener('error', () => {
      activeUploadXhr = null;
      attachBtn.disabled = false;
      chatSendBtn.disabled = false;
      hideUploadProgress();
      showComposerError('erro de conexão ao enviar o arquivo');
    });

    // cancelamento deliberado (botão "remover anexo" durante upload, ver attachmentPreviewRemove)
    // — aí sim remove o anexo de vez, já que a pessoa pediu isso explicitamente
    xhr.addEventListener('abort', () => {
      activeUploadXhr = null;
      attachBtn.disabled = false;
      chatSendBtn.disabled = false;
      clearPendingAttachment();
    });

    xhr.send(formData);
    return;
  }

  if (!content) return;
  chatInput.value = '';
  autosizeComposer();
  clearReplyTarget();
  showComposerError('');
  try {
    const res = await fetch(`/api/channels/${currentChannel.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, reply_to_id: replyToId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showComposerError(data.error || 'não deu pra enviar a mensagem');
    }
  } catch (_) {
    showComposerError('erro de conexão ao enviar a mensagem');
  }
  // a mensagem aparece via broadcast (message_created), inclusive pra quem enviou
});
