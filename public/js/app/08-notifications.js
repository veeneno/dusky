// didiscord — Notificações do sistema, não lidas e pular pra uma mensagem
// Parte 8 de 28 do código do site (public/js/app/). Leia o README.md desta pasta antes de mexer.
//
// Todos os arquivos desta pasta são scripts comuns que dividem o MESMO escopo e são carregados em
// ordem pelo app.html: o que um declara no topo (const, let, function) os outros enxergam.
//
// Neste arquivo:
//   - notificações do sistema
//   - não lidas (guardadas no servidor) e contagem de menções
//   - pular pra uma mensagem antiga (busca, fixadas, resposta) e voltar pro presente

// ===================================================================
// notificações do sistema
// ===================================================================

const NOTIFY_KEY = 'didiscord:notificationLevel';
const notificationLevelSelect = document.getElementById('notificationLevelSelect');
const notificationPermissionBtn = document.getElementById('notificationPermissionBtn');

function getNotifyLevel() {
  try { const v = localStorage.getItem(NOTIFY_KEY); return ['mentions', 'all', 'none'].includes(v) ? v : 'mentions'; } catch (_) { return 'mentions'; }
}
function setNotifyLevel(v) { try { localStorage.setItem(NOTIFY_KEY, v); } catch (_) { /* ok */ } }

function notificationsSupported() { return typeof Notification !== 'undefined'; }

function updateNotificationPermissionUi() {
  if (!notificationPermissionBtn) return;
  const need = notificationsSupported() && Notification.permission === 'default' && getNotifyLevel() !== 'none';
  notificationPermissionBtn.hidden = !need;
  const help = document.getElementById('notificationHelp');
  if (help && notificationsSupported() && Notification.permission === 'denied' && getNotifyLevel() !== 'none') {
    help.textContent = 'o navegador está bloqueando as notificações deste site — libera no cadeado ao lado do endereço.';
  }
}

function askNotificationPermission() {
  if (!notificationsSupported() || Notification.permission !== 'default') return;
  Notification.requestPermission().then(updateNotificationPermissionUi).catch(() => {});
}

if (notificationLevelSelect) {
  notificationLevelSelect.value = getNotifyLevel();
  notificationLevelSelect.addEventListener('change', () => {
    setNotifyLevel(notificationLevelSelect.value);
    syncPushSubscription().catch(err => { document.getElementById('pushStatus').textContent = err.message; });
    if (notificationLevelSelect.value !== 'none') askNotificationPermission();
    updateNotificationPermissionUi();
  });
}
if (notificationPermissionBtn) notificationPermissionBtn.addEventListener('click', askNotificationPermission);
// o navegador só deixa pedir permissão num clique de verdade — pede no primeiro clique no site
document.addEventListener('pointerdown', function firstClick() {
  document.removeEventListener('pointerdown', firstClick, true);
  if (getNotifyLevel() !== 'none') askNotificationPermission();
}, true);

function appIsInFront() {
  return document.visibilityState === 'visible' && document.hasFocus();
}

function shouldNotify(message, isDm, mentionsMe) {
  const level = getNotifyLevel();
  if (level === 'none') return false;
  if (myPresenceStatus() === 'idle') return false; // inativo: mensagem não avisa (ver 24-presence.js)
  if (level === 'all') return true;
  return isDm || mentionsMe;
}

function showSystemNotification(message) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return;
  if (pushDeviceEnabled && !appIsInFront()) return;
  const isDm = message.server_id == null;
  const author = message.username || message.bot_name || (message.system_type ? 'didiscord' : 'alguém');
  let title = author;
  if (!isDm) {
    const s = servers.find((x) => x.id === message.server_id);
    const ch = channels.find((c) => c.id === message.channel_id);
    const chName = message.channel_name || (ch && ch.name);
    title = `${author} (${chName ? '#' + chName : 'canal'}${s ? ', ' + s.name : ''})`;
  }
  try {
    const n = new Notification(title, {
      body: messagePlain(message).slice(0, 220),
      icon: message.avatar_url || '/favicon.ico',
      tag: `didiscord-${message.channel_id}`,
      silent: true, // o som é o do próprio didiscord
    });
    n.onclick = () => {
      if (window.didiscordDesktop && window.didiscordDesktop.focusWindow) window.didiscordDesktop.focusWindow();
      window.focus();
      n.close();
      openMessageLocation(message);
    };
  } catch (_) { /* alguns ambientes não deixam criar Notification fora de service worker */ }
}

// vai até a mensagem: troca de servidor/conversa se precisar
async function openMessageLocation(message, opts = {}) {
  if (message.server_id == null) {
    if (currentServerId != null) await selectServer(null);
    const dm = dms.find((d) => d.id === message.channel_id);
    if (dm) await selectChannel(dmChannel(dm), opts);
    return;
  }
  if (currentServerId !== message.server_id) {
    await selectServer(message.server_id, { channelId: message.channel_id, aroundId: opts.aroundId });
    return;
  }
  const ch = channels.find((c) => c.id === message.channel_id);
  if (ch) await selectChannel(ch, opts);
}

// ===================================================================
// não lidas (guardadas no servidor) e contagem de menções
// ===================================================================

async function loadUnread() {
  try {
    const res = await fetch('/api/unread');
    if (!res.ok) return;
    const data = await res.json();
    unreadChannels.clear();
    for (const u of data.unread || []) {
      if (currentChannel && currentChannel.id === u.channel_id && appIsInFront()) { syncRead(u.channel_id); continue; }
      unreadChannels.set(u.channel_id, { serverId: u.server_id, mentions: u.mentions || 0 });
    }
    renderRail();
    renderChannels();
    updateUnreadTitle();
  } catch (_) { /* sem conexão — tenta de novo quando o WebSocket voltar */ }
}

const readSyncTimers = new Map();
function syncRead(channelId) {
  clearTimeout(readSyncTimers.get(channelId));
  readSyncTimers.set(channelId, setTimeout(() => {
    readSyncTimers.delete(channelId);
    fetch(`/api/unread/${channelId}/read`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
  }, 600));
}

function totalMentions() {
  let n = 0;
  for (const u of unreadChannels.values()) n += u.mentions || 0;
  return n;
}

function updateUnreadTitle() {
  const n = totalMentions();
  const base = 'didiscord';
  document.title = n ? `(${n > 99 ? '99+' : n}) ${base}` : (unreadChannels.size ? `• ${base}` : base);
  if (window.didiscordDesktop && typeof window.didiscordDesktop.setBadge === 'function') {
    try { window.didiscordDesktop.setBadge(n); } catch (_) { /* app antigo */ }
  }
}

function serverMentionCount(serverId) {
  let n = 0;
  for (const u of unreadChannels.values()) if (u.serverId === serverId) n += u.mentions || 0;
  return n;
}

function mentionBadge(count, cls) {
  const b = document.createElement('span');
  b.className = cls;
  b.textContent = count > 99 ? '99+' : String(count);
  return b;
}

// ===================================================================
// pular pra uma mensagem antiga (busca, fixadas, resposta) e voltar pro presente
// ===================================================================

let hasNewerMessages = false;
let loadingNewerMessages = false;
const jumpPresentBtn = document.getElementById('jumpPresentBtn');

function setViewingHistory(on) {
  hasNewerMessages = on;
  if (jumpPresentBtn) jumpPresentBtn.hidden = !on;
}

if (jumpPresentBtn) {
  jumpPresentBtn.addEventListener('click', () => { if (currentChannel) selectChannel(currentChannel); });
}

async function loadNewerMessages() {
  const channel = currentChannel;
  const newest = currentMessages[currentMessages.length - 1];
  if (!channel || !newest || loadingNewerMessages || !hasNewerMessages) return;
  loadingNewerMessages = true;
  try {
    const res = await fetch(`/api/channels/${channel.id}/messages?after=${newest.id}&limit=50`);
    if (!res.ok || currentChannel !== channel) return;
    const data = await res.json();
    if (currentChannel !== channel) return;
    const newer = data.messages || [];
    let prev = newest;
    for (const m of newer) {
      currentMessages.push(m);
      const el = buildMessageEl(m, isContinuation(prev, m));
      el.classList.add('no-anim');
      chatMessages.appendChild(el);
      prev = m;
    }
    setViewingHistory(!!data.has_more_after);
    if (!hasNewerMessages) syncRead(channel.id);
  } catch (_) { /* tenta de novo na próxima rolagem */ } finally {
    loadingNewerMessages = false;
  }
}

chatMessages.addEventListener('scroll', () => {
  if (hasNewerMessages && isScrolledNearBottom()) loadNewerMessages();
}, { passive: true });

function highlightMessage(messageId) {
  const el = chatMessages.querySelector(`.msg-group[data-message-id="${messageId}"]`);
  if (!el) return false;
  el.scrollIntoView({ behavior: 'auto', block: 'center' });
  el.classList.remove('is-highlighted');
  void el.offsetWidth;
  el.classList.add('is-highlighted');
  return true;
}

let pushDeviceEnabled = false;
function supportsBackgroundPush() { return window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && notificationsSupported() && !window.didiscordDesktop; }
function setPushUi(message) {
  document.getElementById('pushStatus').textContent = message;
  document.getElementById('pushEnableBtn').hidden = pushDeviceEnabled;
  document.getElementById('pushEnableBtn').disabled = !supportsBackgroundPush();
  document.getElementById('pushDisableBtn').hidden = !pushDeviceEnabled;
}
async function syncPushSubscription() {
  if (!supportsBackgroundPush()) return;
  const reg = await navigator.serviceWorker.getRegistration('/');
  const sub = reg && await reg.pushManager.getSubscription();
  if (!sub) { pushDeviceEnabled = false; setPushUi('desativado neste aparelho'); return; }
  const res = await fetch('/api/push/subscription', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: sub.toJSON(), level: getNotifyLevel() }) });
  const data = await res.json();
  if (!res.ok) throw Error(data.error || 'não deu para salvar as notificações');
  pushDeviceEnabled = true;
  setPushUi(getNotifyLevel() === 'none' ? 'ativado, mas pausado pela opção “nenhuma” abaixo' : 'ativado neste aparelho — também funciona sem a aba aberta');
}
async function initBackgroundPush() {
  if (!supportsBackgroundPush()) { setPushUi('Web Push indisponível neste ambiente. Use um navegador compatível por HTTPS.'); return; }
  try { await syncPushSubscription(); } catch (err) { setPushUi(err.message); }
}
document.getElementById('pushEnableBtn').addEventListener('click', async () => {
  const btn = document.getElementById('pushEnableBtn'); btn.disabled = true;
  try {
    if (await Notification.requestPermission() !== 'granted') throw Error('Libere as notificações nas permissões do navegador.');
    await navigator.serviceWorker.register('/sw.js');
    const reg = await navigator.serviceWorker.ready;
    const response = await fetch('/api/push/key');
    if (!response.ok) throw Error('não deu para preparar as notificações');
    const { publicKey } = await response.json();
    const key = Uint8Array.from(atob(publicKey.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    await syncPushSubscription();
  } catch (err) { setPushUi(err.message); } finally { btn.disabled = false; updateNotificationPermissionUi(); }
});
async function disableBackgroundPush() {
  if (!supportsBackgroundPush()) return;
  const reg = await navigator.serviceWorker.getRegistration('/');
  const sub = reg && await reg.pushManager.getSubscription();
  if (sub) {
    const res = await fetch('/api/push/subscription', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) });
    if (!res.ok) throw Error('não deu para desativar; tente novamente');
    await sub.unsubscribe();
  }
  pushDeviceEnabled = false; setPushUi('desativado neste aparelho');
}
document.getElementById('pushDisableBtn').addEventListener('click', () => disableBackgroundPush().catch(err => setPushUi(err.message)));
async function openPushMessage(data) {
  await loadDms();
  await openMessageLocation({ server_id: data.serverId, channel_id: data.channelId }, { aroundId: data.messageId });
}
if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', event => {
  if (event.data && event.data.type === 'push_open') openPushMessage(event.data.data).catch(() => toast('não deu para abrir a mensagem', 'error'));
});
