// dusky — Caixa de mensagem: menções, emojis e "está digitando"
// Parte 7 de 28 do código do site (public/js/app/). Leia o README.md desta pasta antes de mexer.
//
// Todos os arquivos desta pasta são scripts comuns que dividem o MESMO escopo e são carregados em
// ordem pelo app.html: o que um declara no topo (const, let, function) os outros enxergam.
//
// Neste arquivo:
//   - menções (@) e emojis (:) na caixa de mensagem
//   - "fulano está digitando…"

// ===================================================================
// menções (@) e emojis (:) na caixa de mensagem
// ===================================================================
// No texto que vai pro servidor, menção é <@id>. Na caixa de mensagem a pessoa vê "@nome"; a troca
// acontece na hora de enviar (e o contrário, na hora de editar).

// quem dá pra mencionar aqui: membros do servidor, ou a outra pessoa da DM
function mentionCandidates() {
  if (!currentChannel) return [];
  if (currentChannel.dm) {
    const u = findUser(currentChannel.userId);
    return [u, currentUser].filter(Boolean);
  }
  return members;
}

function foldText(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// "@fulano de tal" -> "<@12>" (nomes mais longos primeiro, pra "ana" não pegar o começo de "ana clara")
function encodeMentions(text) {
  const list = mentionCandidates().filter((u) => u && u.username).sort((a, b) => b.username.length - a.username.length);
  if (!list.length) return text;
  const parts = text.split(/(```[\s\S]*?```|`[^`\n]*`)/); // não mexe dentro de código
  return parts.map((part, i) => {
    if (i % 2 === 1) return part;
    let out = '';
    let idx = 0;
    while (idx < part.length) {
      const at = part.indexOf('@', idx);
      if (at === -1) { out += part.slice(idx); break; }
      out += part.slice(idx, at);
      const prevCh = part[at - 1];
      let matched = null;
      if (!prevCh || !/[\p{L}\p{N}_]/u.test(prevCh)) {
        const after = part.slice(at + 1);
        matched = list.find((u) => after.toLowerCase().startsWith(u.username.toLowerCase())
          && !/[\p{L}\p{N}_]/u.test(after[u.username.length] || ''));
      }
      if (matched) { out += `<@${matched.id}>`; idx = at + 1 + matched.username.length; }
      else { out += '@'; idx = at + 1; }
    }
    return out;
  }).join('');
}

function decodeMentions(text, m) {
  const ctx = mentionContext(m);
  return String(text || '').replace(/<@(\d{1,10})>/g, (all, id) => {
    const u = ctx.resolveUser(Number(id));
    return u ? `@${u.username}` : all;
  });
}

// :joia: escrito à mão (sem escolher na lista) também vira emoji ao enviar
function encodeShortcodes(text) {
  if (!getPref('prefShortcodes')) return text;
  return text.replace(/(^|[^\w`]):([a-z0-9_+-]{2,40}):/gi, (all, pre, name) => {
    const e = DuskyEmoji.fromShortcode(name);
    return e ? pre + e : all;
  });
}

// texto antes do cursor que está sendo completado: { kind: 'mention'|'emoji', query, start }
function tokenBeforeCaret() {
  const pos = chatInput.selectionStart;
  if (pos == null || pos !== chatInput.selectionEnd) return null;
  const before = chatInput.value.slice(0, pos);
  let m = before.match(/(^|\s)@([^\s@]{0,32})$/);
  if (m) return { kind: 'mention', query: m[2], start: pos - m[2].length - 1 };
  m = before.match(/(^|\s):([\p{L}\p{N}_+-]{2,32})$/u);
  if (m) return { kind: 'emoji', query: m[2], start: pos - m[2].length - 1 };
  return null;
}

function replaceToken(token, insert) {
  const pos = chatInput.selectionStart;
  const v = chatInput.value;
  chatInput.value = v.slice(0, token.start) + insert + v.slice(pos);
  const caret = token.start + insert.length;
  chatInput.setSelectionRange(caret, caret);
  chatInput.focus();
  autosizeComposer();
}

// devolve true se tratou (mostrou a lista de menção/emoji)
let emojiSearchToken = 0;
function updateMentionOrEmojiPopup() {
  const token = tokenBeforeCaret();
  if (!token) return false;
  if (token.kind === 'mention') {
    const q = foldText(token.query);
    const users = mentionCandidates()
      .filter((u) => u && foldText(u.username).split(/\s+/).some((w, i, arr) => w.startsWith(q) || arr.join(' ').startsWith(q)))
      .slice(0, 8)
      .map((u) => ({ kind: 'mention', user: u, token }));
    const specials = currentChannel && !currentChannel.dm
      ? ['everyone', 'here'].filter((s) => s.startsWith(q)).map((s) => ({ kind: 'mention-special', name: s, token }))
      : [];
    if (popupMode !== 'mention') popupIndex = 0;
    popupMode = 'mention';
    popupItems = [...users, ...specials];
    if (!popupItems.length) { hideCommandPopup(); return true; }
    renderPopup(token.query ? `membros com "@${token.query}"` : 'mencionar');
    return true;
  }
  const mine = ++emojiSearchToken;
  DuskyEmoji.search(token.query, 8).then((found) => {
    if (mine !== emojiSearchToken) return;
    const still = tokenBeforeCaret();
    if (!still || still.kind !== 'emoji' || still.query !== token.query) return;
    if (popupMode !== 'emoji') popupIndex = 0;
    popupMode = 'emoji';
    popupItems = found.map((e) => ({ kind: 'emoji', emoji: e, token }));
    if (!popupItems.length) { hideCommandPopup(); return; }
    renderPopup(`emojis com ":${token.query}"`);
  }).catch(() => {});
  return true;
}

// caixa de mensagem cresce com o texto (até um limite), igual o Discord
function autosizeComposer() {
  chatInput.style.height = 'auto';
  chatInput.style.height = Math.min(chatInput.scrollHeight, 260) + 'px';
}

// ===================================================================
// "fulano está digitando…"
// ===================================================================

const TYPING_SEND_EVERY_MS = 3000;
const TYPING_SHOW_MS = 6500;
const typingByChannel = new Map(); // channelId -> Map(userId -> até quando mostrar)
let lastTypingSentAt = 0;
let lastTypingChannel = null;
const typingIndicator = document.getElementById('typingIndicator');

function notifyTyping() {
  if (!currentChannel || currentChannel.type !== 'text' || !getPref('prefTyping')) return;
  const v = chatInput.value;
  if (!v.trim() || v.startsWith('/')) return;
  const now = Date.now();
  if (lastTypingChannel === currentChannel.id && now - lastTypingSentAt < TYPING_SEND_EVERY_MS) return;
  lastTypingSentAt = now;
  lastTypingChannel = currentChannel.id;
  Realtime.send('typing', { channelId: currentChannel.id });
}

function renderTyping() {
  if (!typingIndicator) return;
  const map = currentChannel ? typingByChannel.get(currentChannel.id) : null;
  const now = Date.now();
  const ids = map ? [...map.entries()].filter(([, until]) => until > now).map(([id]) => id) : [];
  if (!ids.length) { typingIndicator.textContent = ''; typingIndicator.classList.remove('is-active'); return; }
  const names = ids.map(userName);
  let text;
  if (names.length === 1) text = `${names[0]} está digitando…`;
  else if (names.length === 2) text = `${names[0]} e ${names[1]} estão digitando…`;
  else if (names.length === 3) text = `${names[0]}, ${names[1]} e ${names[2]} estão digitando…`;
  else text = 'várias pessoas estão digitando…';
  typingIndicator.innerHTML = '<span class="typing-dots"><span></span><span></span><span></span></span><span class="typing-text"></span>';
  typingIndicator.querySelector('.typing-text').textContent = text;
  typingIndicator.classList.add('is-active');
}

function setTyping(channelId, userId, on) {
  if (!typingByChannel.has(channelId)) typingByChannel.set(channelId, new Map());
  const map = typingByChannel.get(channelId);
  if (on) map.set(userId, Date.now() + TYPING_SHOW_MS);
  else map.delete(userId);
  if (currentChannel && currentChannel.id === channelId) renderTyping();
}

setInterval(() => { if (typingIndicator && typingIndicator.classList.contains('is-active')) renderTyping(); }, 1000);
