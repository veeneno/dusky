// dusky — Eventos em tempo real e partida do app
// Parte 28 de 28 do código do site (public/js/app/). Leia o README.md desta pasta antes de mexer.
//
// Todos os arquivos desta pasta são scripts comuns que dividem o MESMO escopo e são carregados em
// ordem pelo app.html: o que um declara no topo (const, let, function) os outros enxergam.
//
// Neste arquivo:
//   - eventos em tempo real

// ---------- eventos em tempo real ----------

function wireRealtime() {
  Realtime.on('channel_created', ({ serverId, channel }) => {
    if (serverId !== currentServerId) return;
    if (!channels.some((c) => c.id === channel.id)) channels.push(channel);
    renderChannels();
  });

  Realtime.on('channel_deleted', ({ serverId, channelId }) => {
    unreadChannels.delete(channelId);
    if (voiceChannel && voiceChannel.id === channelId) leaveVoiceCall({ silent: true });
    if (serverId !== currentServerId) { renderRail(); return; }
    channels = channels.filter((c) => c.id !== channelId);
    if (currentChannel && currentChannel.id === channelId) {
      currentChannel = null;
      const fallback = channels.find((c) => c.type === 'text');
      if (fallback) selectChannel(fallback);
      else setMainEmpty('esse canal foi apagado', 'Escolha outro canal na lateral.');
    }
    renderChannels();
    renderRail();
  });

  Realtime.on('message_created', ({ message }) => {
    const isDm = message.server_id == null;
    const mine = !!(currentUser && message.user_id === currentUser.id);
    const isOpen = !!(currentChannel && message.channel_id === currentChannel.id);

    if (isDm) {
      const dm = dms.find((d) => d.id === message.channel_id);
      if (dm) {
        dm.last_message_at = message.created_at;
        sortDms();
      } else {
        // primeira mensagem de uma conversa nova que alguém puxou comigo
        loadDms().then(() => {
          if (currentServerId == null) renderChannels();
          renderRail();
          if (currentServerId == null && !currentChannel) showHomeEmpty();
        });
      }
    }

    const mentionsMe = messageMentionsMe(message);
    if (message.user_id) setTyping(message.channel_id, message.user_id, false);

    // som só pra DM ou quando me mencionam (e só com o status "ativo", ver playMessageSound) —
    // mensagem comum de canal não toca nada, senão vira barulho
    if (!mine && message.user_id && (isDm || mentionsMe)) {
      playMessageSound();
    }
    // notificação do sistema quando o dusky não está na frente (ou é outro canal)
    if (!mine && (!isOpen || !appIsInFront()) && shouldNotify(message, isDm, mentionsMe)) {
      showSystemNotification(message);
    }

    const countsAsMention = !mine && (isDm || mentionsMe) ? 1 : 0;
    const refreshLists = () => {
      renderRail();
      if ((isDm && currentServerId == null) || (!isDm && message.server_id === currentServerId)) renderChannels();
    };

    // canal fechado, ou aberto mas vendo mensagens antigas (não dá pra encaixar a nova no fim)
    if (!isOpen || hasNewerMessages) {
      if (!mine) markChannelUnread(message.channel_id, message.server_id, countsAsMention);
      refreshLists();
      return;
    }

    if (!mine) {
      if (appIsInFront()) syncRead(message.channel_id);
      else { markChannelUnread(message.channel_id, message.server_id, countsAsMention); refreshLists(); }
    }
    if (isDm && currentServerId == null) renderChannels(); // reordena a lista de conversas
    currentMessages.push(message);
    appendMessageToDom(message);
  });

  Realtime.on('message_edited', ({ channelId, message }) => {
    if (!currentChannel || channelId !== currentChannel.id) return;
    const idx = currentMessages.findIndex((x) => x.id === message.id);
    if (idx === -1) return;
    currentMessages[idx] = message;
    const old = chatMessages.querySelector(`.msg-group[data-message-id="${message.id}"]`);
    if (old) old.replaceWith(buildMessageEl(message, old.classList.contains('is-continued')));
  });

  Realtime.on('reactions_updated', ({ channelId, messageId, reactions }) => {
    if (!currentChannel || channelId !== currentChannel.id) return;
    const m = currentMessages.find((x) => x.id === messageId);
    if (!m) return;
    m.reactions = reactions;
    refreshReactions(messageId);
  });

  Realtime.on('message_pinned', ({ channelId, message, pinned, by }) => {
    if (!currentChannel || channelId !== currentChannel.id) return;
    const idx = currentMessages.findIndex((x) => x.id === message.id);
    if (idx !== -1) {
      currentMessages[idx] = message;
      const old = chatMessages.querySelector(`.msg-group[data-message-id="${message.id}"]`);
      if (old) old.replaceWith(Object.assign(buildMessageEl(message, old.classList.contains('is-continued')), {}));
      const fresh = chatMessages.querySelector(`.msg-group[data-message-id="${message.id}"]`);
      if (fresh) fresh.classList.add('no-anim');
    }
    if (by && currentUser && by.id !== currentUser.id) toast(`${by.username} ${pinned ? 'fixou' : 'desafixou'} uma mensagem`);
    renderPins();
  });

  Realtime.on('typing', ({ channelId, userId }) => {
    if (currentUser && userId === currentUser.id) return;
    setTyping(channelId, userId, true);
  });

  // li num lugar (outra aba, o app no PC): tira o aviso aqui também
  Realtime.on('read_state', ({ channelId }) => {
    if (!unreadChannels.has(channelId)) return;
    unreadChannels.delete(channelId);
    updateUnreadTitle();
    renderRail();
    renderChannels();
  });

  // voltou a conexão depois de cair: pode ter chegado mensagem nesse meio-tempo
  let wsOpenedOnce = false;
  Realtime.on('connection_status', ({ status }) => {
    if (status !== 'open') return;
    if (wsOpenedOnce) loadUnread();
    wsOpenedOnce = true;
  });

  Realtime.on('message_deleted', ({ channelId, messageId }) => {
    if (!currentChannel || channelId !== currentChannel.id) return;
    currentMessages = currentMessages.filter((m) => m.id !== messageId);
    removeMessageFromDom(messageId);
  });

  function setPresence(userId, online) {
    const u = usersById.get(userId);
    if (u) { u.online = online; if (!online) u.activity = null; }
    for (const d of dms) if (d.user && d.user.id === userId) { d.user.online = online; if (!online) d.user.activity = null; }
    renderMembers();
    if (currentServerId == null) renderChannels();
    if (currentChannel && currentChannel.dm && currentChannel.userId === userId) renderDmProfilePanel();
  }

  Realtime.on('presence_online', ({ userId, status }) => {
    if (status) setUserPresenceStatus(userId, status);
    setPresence(userId, true);
  });
  Realtime.on('presence_status', ({ userId, status }) => setUserPresenceStatus(userId, status));
  Realtime.on('activity_update', ({ userId, activity }) => setUserActivity(userId, activity));
  Realtime.on('connection_status', ({ status }) => {
    if (status !== 'open') return;
    sendMyActivity(); // reconectou: o servidor esqueceu
    sendMyPresenceStatus(); // se o status foi trocado sem conexão, chega agora
  });
  Realtime.on('presence_offline', ({ userId }) => setPresence(userId, false));

  Realtime.on('server_joined', ({ server }) => upsertServer(server));
  Realtime.on('server_updated', ({ server }) => {
    upsertServer(server);
    if (server.id === currentServerId) refreshServerSettingsView();
  });

  Realtime.on('server_deleted', ({ serverId }) => {
    const s = servers.find((x) => x.id === serverId);
    if (s) removeServerLocally(serverId, `o servidor ${s.name} foi apagado`);
  });

  Realtime.on('server_removed', ({ serverId, reason }) => {
    const s = servers.find((x) => x.id === serverId);
    const text = reason === 'kicked' ? `você foi removido de ${s && s.name}` : reason === 'banned' ? `você foi banido de ${s && s.name}` : null;
    if (s) removeServerLocally(serverId, text);
  });

  Realtime.on('member_joined', ({ serverId, member }) => {
    const u = rememberUser(member);
    if (serverId !== currentServerId) return;
    if (!members.some((m) => m.id === u.id)) members.push(u);
    renderMembers();
  });

  Realtime.on('member_left', ({ serverId, userId }) => {
    if (serverId !== currentServerId) return;
    members = members.filter((m) => m.id !== userId);
    renderMembers();
  });

  Realtime.on('dm_created', ({ dm }) => upsertDm(dm));

  Realtime.on('profile_updated', ({ user }) => {
    rememberUser(user);
    for (const d of dms) if (d.user && d.user.id === user.id) Object.assign(d.user, user);
    if (currentUser && user.id === currentUser.id) {
      currentUser = { ...currentUser, ...user };
      applyUserToProfileBar(currentUser);
    }
    renderMembers();
    if (currentServerId == null) renderChannels();
    if (currentChannel && currentChannel.dm && currentChannel.userId === user.id) {
      chatChannelName.textContent = user.username;
      renderDmProfilePanel();
    }
    // mensagens já na tela mostram nome/avatar antigos até reabrir o canal — aceitável
  });

  // ---------- eventos de chamada de voz ----------

  Realtime.on('voice_channel_state', async ({ channelId, participants, self }) => {
    // atualiza a pré-visualização da sidebar independente de eu estar nesse canal
    const map = getChannelVoiceMap(channelId);
    map.clear();
    for (const p of participants) {
      map.set(p.userId, { muted: p.muted, deafened: p.deafened, cameraOn: !!p.cameraOn, screenOn: !!p.screenOn });
    }
    if (currentUser) map.set(currentUser.id, { muted: isMuted, deafened: isDeafened, cameraOn, screenOn }); // eu também apareço na pré-visualização
    renderVoicePreviews();

    if (!voiceChannel || voiceChannel.id !== channelId) return;
    worldOnChannelState(participants, self); // mundinho: posições de todo mundo (27-world.js)
    for (const p of participants) {
      callParticipantsState.set(p.userId, { muted: p.muted, deafened: p.deafened, cameraOn: !!p.cameraOn, screenOn: !!p.screenOn });
      // o bot nunca é uma RTCPeerConnection de verdade (ver comentário no topo do arquivo, perto
      // de BOT_USER_ID) — o áudio dele chega por HTTP. Só abre sinalização WebRTC pro humano de verdade.
      if (p.userId === BOT_USER_ID) startBotAudio();
      else await createPeer(p.userId, true); // quem acabou de entrar liga pra cada um que já estava
    }
    renderCallParticipants();
  });

  Realtime.on('voice_user_joined', ({ channelId, userId, muted, deafened, cameraOn: uCameraOn, screenOn: uScreenOn, world }) => {
    getChannelVoiceMap(channelId).set(userId, { muted, deafened, cameraOn: !!uCameraOn, screenOn: !!uScreenOn });
    renderVoicePreviews();

    if (!voiceChannel || voiceChannel.id !== channelId) return;
    callParticipantsState.set(userId, { muted, deafened, cameraOn: !!uCameraOn, screenOn: !!uScreenOn });
    if (world) worldOnRemoteState(userId, world);
    if (userId === BOT_USER_ID) {
      // o bot "entrando" não é uma call de verdade — só liga o stream HTTP de áudio dele, sem
      // tocar o som de entrada de humano nem mexer em remoteUserId (que é só pro outro humano,
      // usado pra saber quem é o dono da única RTCPeerConnection da call)
      startBotAudio();
    } else {
      playJoinSound(); // alguém entrou na call que eu já estou — a oferta WebRTC vem dele
      if (sfuActive()) sfuEnsurePeer(userId); // pelo servidor de mídia não vem oferta: cria a entrada já
    }
    renderCallParticipants();
  });

  Realtime.on('voice_speaking', ({ userId, speaking }) => {
    if (currentUser && userId === currentUser.id) return;
    const peer = peers.get(userId);
    if (peer) {
      peer.hasSpeakingSignal = true;
      peer.analyser = null;
    }
    setParticipantSpeaking(userId, speaking);
  });

  Realtime.on('voice_user_left', ({ channelId, userId }) => {
    setParticipantSpeaking(userId, false);
    const map = channelVoiceState.get(channelId);
    if (map) map.delete(userId);
    renderVoicePreviews();

    if (!voiceChannel || voiceChannel.id !== channelId) return;
    if (currentUser && userId === currentUser.id) {
      // o servidor me tirou da call (fui expulso, o canal foi apagado) — sai localmente tambem
      leaveVoiceCall({ silent: true });
      return;
    }
    callParticipantsState.delete(userId);
    worldOnUserLeft(userId);
    if (userId === BOT_USER_ID) {
      stopBotAudio();
    } else {
      playLeaveSound(); // alguém saiu da call que eu ainda estou
      closePeer(userId);
      unwatchedScreens.delete(userId);
      if (spotlightUserId === userId) spotlightUserId = null;
    }
    renderCallParticipants();
  });

  Realtime.on('voice_state_update', ({ userId, muted, deafened, cameraOn: uCameraOn, screenOn: uScreenOn }) => {
    // esse evento não vem com channelId — acha em qual canal esse usuário está pra atualizar a pré-visualização
    const channelId = findParticipantChannel(userId);
    if (channelId != null) {
      getChannelVoiceMap(channelId).set(userId, { muted, deafened, cameraOn: !!uCameraOn, screenOn: !!uScreenOn });
      renderVoicePreviews();
    }

    // parou de compartilhar: na próxima vez, volta a assistir automaticamente
    if (!uScreenOn) {
      unwatchedScreens.delete(userId);
      closeScreencastPc(peers.get(userId));
    }

    const st = callParticipantsState.get(userId);
    if (st) {
      st.muted = muted;
      st.deafened = deafened;
      st.cameraOn = !!uCameraOn;
      st.screenOn = !!uScreenOn;
      renderCallParticipants();
    }
  });

  // volume do bot ajustado via /volume no chat (server/bots/musicBot/queue.js -> setVolume) —
  // vira o novo PADRÃO pra quem ainda não mexeu no próprio slider (ver getSavedVolume); quem já
  // personalizou continua com a própria preferência, sem ser sobrescrito.
  Realtime.on('musicbot_volume', ({ serverId, volume }) => {
    // volume de outro servidor não é o bot que eu estou ouvindo
    if (!voiceChannel || voiceChannel.server_id !== serverId) return;
    botServerVolume = volume;
    let hasPersonalPref = true;
    try { hasPersonalPref = localStorage.getItem(`dusky:volume:${BOT_USER_ID}`) !== null; } catch (_) { /* assume que tem, pra não sobrescrever à toa */ }
    if (!hasPersonalPref) {
      applyLocalOverridesToBotAudio();
      renderCallParticipants();
    }
  });

  Realtime.on('rtc_signal', ({ from, data }) => {
    handleRtcSignal(from, data).catch((err) => console.warn('[call] erro na sinalização com', from, err));
  });

  // ---------- moderação de voz (feita por um administrador) ----------

  Realtime.on('voice_disconnected', ({ by, reason }) => {
    // o voice_user_left com o meu id chega logo em seguida e faz a saída de verdade
    if (reason === 'permission') toast('você perdeu a permissão de ficar nessa call');
    else toast(by ? `${by} te desconectou da call` : 'você foi desconectado da call');
  });

  Realtime.on('voice_move', async ({ channel, by, reason }) => {
    if (!channel) return;
    const wasViewingCall = !!(voiceChannel && currentChannel && currentChannel.id === voiceChannel.id);
    const known = channels.find((c) => c.id === channel.id) || channel;
    if (reason === 'afk') toast(`você ficou um tempo sem falar e foi levado pro canal AFK (${known.name})`);
    else toast(by ? `${by} te levou pra ${known.name}` : `você foi levado pra ${known.name}`);
    await joinVoiceCall(known);
    if (wasViewingCall && currentServerId === known.server_id) selectChannel(known);
  });

  Realtime.on('voice_join_denied', ({ channelId }) => {
    if (voiceChannel && voiceChannel.id === channelId) {
      toast('você não tem permissão pra entrar nessa call', 'error');
      leaveVoiceCall({ silent: true });
    }
  });

  // ---------- cargos e permissões mudaram ----------
  Realtime.on('roles_updated', ({ serverId }) => refreshServerData(serverId));

  // ---------- admin do site ----------
  Realtime.on('site_announcement', ({ text, by }) => showSiteAnnouncement(text, by));
  Realtime.on('account_suspended', ({ reason }) => {
    if (voiceChannel) leaveVoiceCall({ silent: true });
    alert(reason ? `sua conta foi suspensa: ${reason}` : 'sua conta foi suspensa');
    window.location.replace('/login.html');
  });
  Realtime.on('session_revoked', () => {
    if (voiceChannel) leaveVoiceCall({ silent: true });
    alert('sua senha foi redefinida — entre de novo com a senha nova');
    window.location.replace('/login.html');
  });
  Realtime.on('channels_updated', ({ serverId }) => refreshServerData(serverId));

  // mundinho 3D (27-world.js): alguém da call andou/sentou, ou o servidor corrigiu a minha posição
  Realtime.on('world_state', (ev) => { if (voiceChannel && ev.channelId === voiceChannel.id) worldOnRemoteState(ev.userId, ev); });
  Realtime.on('world_correction', ({ world }) => worldOnCorrection(world));
  Realtime.on('world_tv_state', ({ channelId, tv, now }) => { if (voiceChannel && voiceChannel.id === channelId) worldOnTvState(tv, now); });
  Realtime.on('game_state', ({ channelId, state, now }) => { if (voiceChannel && voiceChannel.id === channelId) worldOnGameState(state, now); });
  Realtime.on('game_denied', ({ error }) => toast(error || 'jogada não permitida', 'error'));
  Realtime.on('piano_note', (ev) => { if (voiceChannel && voiceChannel.id === ev.channelId) worldOnPianoNote(ev); });
  Realtime.on('world_tv_denied', ({ error }) => toast(error || 'não deu pra mexer na TV', 'error'));

  // banimentos mudaram: a aba de banimentos aberta se atualiza
  Realtime.on('bans_updated', ({ serverId }) => {
    if (serverId === currentServerId && !serverSettingsBackdrop.hidden && ssTab === 'bans') loadSsBans();
  });

  // soundboard (26-soundboard.js): alguém tocou um som na minha call, o servidor recusou o meu,
  // ou os sons de algum servidor mudaram
  Realtime.on('soundboard_play', (ev) => handleSoundboardPlay(ev));
  Realtime.on('soundboard_denied', ({ error, cooldown }) => toast(error || 'não deu pra tocar esse som', cooldown ? undefined : 'error'));
  Realtime.on('soundboard_updated', ({ serverId }) => {
    invalidateSoundboard();
    if (serverId === currentServerId && !serverSettingsBackdrop.hidden && ssTab === 'soundboard') loadSsSounds();
  });

  Realtime.connect();

  // ao fechar a aba/app (ou dar reload) enquanto em call, avisa o servidor na hora em vez de
  // depender do heartbeat pra perceber que a conexão sumiu — sem isso, o outro participante
  // podia continuar vendo você "na call" por até ~65s depois de você já ter saído de verdade.
  // 'pagehide' cobre também o caso do app desktop (Tauri) sendo fechado, ao contrário de
  // 'beforeunload', que em alguns webviews não dispara de forma confiável.
  window.addEventListener('pagehide', () => {
    if (voiceChannel) Realtime.send('voice_leave');
  });
}

function readCurrentIfInFront() {
  if (!appIsInFront() || !currentChannel || hasNewerMessages || !unreadChannels.has(currentChannel.id)) return;
  markChannelRead(currentChannel.id);
  renderChannels();
  renderRail();
}
window.addEventListener('focus', readCurrentIfInFront);
document.addEventListener('visibilitychange', readCurrentIfInFront);

(async function init() {
  if (!window.isSecureContext) {
    alert('esse site precisa ser acessado por HTTPS (ou localhost) pra microfone e câmera funcionarem — use o link https, não o IP local puro.');
  }
  const user = await loadUser();
  if (!user) return;
  setupAdminEntry();
  await Promise.all([loadServers(), loadDms()]);
  await loadVoiceOccupancy();
  await loadMusicbotState();
  wireRealtime();
  initPresence();
  initPresenceStatus();
  DuskyTheme.load();
  loadUnread();
  updateNotificationPermissionUi();
  await initBackgroundPush();

  // abre onde a pessoa estava da última vez (servidor ou tela de conversas)
  let last = null;
  try { last = localStorage.getItem('dusky:lastServer'); } catch (_) { /* ok */ }
  const lastId = Number(last);
  if (last && last !== 'home' && servers.some((s) => s.id === lastId)) await selectServer(lastId);
  else if (last !== 'home' && servers.length) await selectServer(servers[0].id);
  else await selectServer(null);

  const pushParams = new URLSearchParams(location.search);
  if (pushParams.has('pushChannel')) {
    await openPushMessage({ channelId: Number(pushParams.get('pushChannel')), serverId: Number(pushParams.get('pushServer')) || null, messageId: Number(pushParams.get('pushMessage')) });
    for (const key of ['pushChannel', 'pushServer', 'pushMessage']) pushParams.delete(key);
    history.replaceState(null, '', location.pathname + (pushParams.size ? '?' + pushParams : ''));
  }
  handleInviteFromUrl();
})();
