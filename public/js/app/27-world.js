// dusky — Mundinho 3D: a cola entre a call e o mundo (posições, áudio espacial, renderizador)
// Parte 27 de 28 do código do site (public/js/app/). Leia o README.md desta pasta antes de mexer.
//
// Todos os arquivos desta pasta são scripts comuns que dividem o MESMO escopo e são carregados em
// ordem pelo app.html: o que um declara no topo (const, let, function) os outros enxergam.
//
// Neste arquivo (o plano inteiro está em docs/MUNDINHO.md):
//   - estado: onde está o boneco de cada pessoa da call-mundo (e o meu)
//   - envio da minha posição pro servidor (world_move, no máximo ~10 por segundo)
//   - áudio espacial: um PannerNode por pessoa (montado em 18-call-audio.js) + o "ouvido" (listener)
//   - mostrar/esconder o mundo na tela da call e carregar o renderizador SOB DEMANDA
//
// Este arquivo é pequeno de propósito: o Three.js e o código 3D (public/world/) só são baixados
// com import() quando a pessoa abre uma call-mundo. Quem nunca entra num mundo não baixa nada.

const WORLD_ASSET_VERSION = 10; // sobe quando mexer em public/world/ (os imports levam ?v=)
const WORLD_SEND_INTERVAL_MS = 100;
const WORLD_HEAD_STANDING = 1.55;
const WORLD_HEAD_SITTING = 1.15;
const worldStage = document.getElementById('worldStage');

const worldPeople = new Map(); // userId -> { x, z, ry, action, seat } (as outras pessoas da call)
let myWorld = null;            // { x, z, ry, action, seat } — o meu boneco
let worldRenderer = null;      // o que createWorld() devolve (public/world/world.js)
let worldLoading = null;
let worldListenerYaw = null;   // pra onde a câmera olha (o "ouvido" segue a câmera, não o boneco)
let worldSendTimer = null;
let worldLastSentAt = 0;
const worldSceneCache = new Map();

function isWorldChannel(ch) { return !!(ch && ch.type === 'voice' && ch.world_scene); }
function worldCallActive() { return isWorldChannel(voiceChannel); }

function pickWorld(st) {
  return { x: Number(st.x) || 0, y: Number(st.y) || 0, z: Number(st.z) || 0, ry: Number(st.ry) || 0, action: st.action || 'stand', seat: st.seat || null };
}

// TV da call-mundo (ver public/world/tv.js): estado que veio do servidor e o áudio "só pra mim"
let worldTv = { mode: 'off' };
let worldTvNow = 0;
let worldTvAudio = { muted: false, volume: 100 };
let worldSceneId = null; // a cena que o servidor está usando de verdade (pode ser a padrão)
const worldGames = new Map(); // mesa -> estado do jogo (Duno), já filtrado pelo servidor pra mim
let worldGameClock = 0;       // relógio do servidor - o meu (pro cronômetro da jogada)

// ---------- eventos que chegam do servidor (chamados em 28-realtime.js) ----------

function worldOnChannelState(participants, self) {
  worldPeople.clear();
  if (!worldCallActive()) return;
  for (const p of participants) if (p.world && p.userId !== BOT_USER_ID) worldPeople.set(p.userId, pickWorld(p.world));
  if (self && self.world) myWorld = pickWorld(self.world);
  if (self && self.tv) { worldTv = self.tv; worldTvNow = self.now || Date.now(); }
  if (self && self.scene) worldSceneId = self.scene;
  if (self && self.games) {
    worldGames.clear();
    for (const g of self.games) worldGames.set(g.table, g);
    if (self.now) worldGameClock = self.now - Date.now();
  }
  updateWorldListener();
  for (const id of worldPeople.keys()) updateSpatialFor(id);
  if (worldRenderer) {
    worldRenderer.applySelf(myWorld, true);
    worldRenderer.setTv(worldTv, worldTvNow);
    for (const g of worldGames.values()) worldRenderer.setGame(g);
  }
  syncWorldView();
}

function worldOnTvState(tv, now) {
  worldTv = tv || { mode: 'off' };
  worldTvNow = now || Date.now();
  if (worldRenderer) worldRenderer.setTv(worldTv, worldTvNow);
  // som da tela compartilhada: o "mutar só pra mim" da TV vale pra quem está nela
  for (const id of peers.keys()) applyLocalOverrideToRemoteScreenAudio(id);
}

// jogo de alguma mesa mudou (server/games/duno.js)
function worldOnGameState(state, now) {
  if (!worldCallActive() || !state) return;
  worldGames.set(state.table, state);
  if (now) worldGameClock = now - Date.now();
  if (worldRenderer) worldRenderer.setGame(state);
}

// nota de piano de outra pessoa (o mundo toca saindo do piano)
function worldOnPianoNote(ev) {
  if (!worldCallActive() || isDeafened) return;
  if (currentUser && ev.userId !== currentUser.id && getLocalOverride(ev.userId).mutedLocal) return;
  if (worldRenderer) worldRenderer.pianoNote(ev.userId, ev.note, ev.on);
}

// multiplicador do som da tela de `userId` (0 = mudo): só mexe se essa tela está na TV do mundo
function worldScreenAudioFactor(userId) {
  if (!worldCallActive() || worldTv.mode !== 'screen' || worldTv.userId !== userId) return 1;
  return worldTvAudio.muted ? 0 : worldTvAudio.volume / 100;
}

// a tela de alguém da call (ou a minha), pra TV mostrar
function worldScreenStream(userId) {
  if (currentUser && userId === currentUser.id) {
    if (localScreenStream) return { stream: localScreenStream, local: true };
    if (nativeScreencast) return { native: true };
    return null;
  }
  if (unwatchedScreens.has(userId)) return { stopped: true };
  const peer = peers.get(userId);
  if (!peer) return null;
  const nativeStream = peer.scDisplayStream && peer.scDisplayStream.getVideoTracks().some((t) => t.readyState === 'live') ? peer.scDisplayStream : null;
  const stream = nativeStream || peer.screenStream;
  return stream && stream.getVideoTracks().length ? { stream } : null;
}

function worldScreenSharers() {
  const out = [];
  if (currentUser && screenOn) out.push({ id: currentUser.id, name: currentUser.username, isSelf: true });
  for (const [id, st] of callParticipantsState.entries()) {
    if (st.screenOn && id !== BOT_USER_ID && (!currentUser || id !== currentUser.id)) {
      const u = findUser(id);
      out.push({ id, name: u ? u.username : 'alguém', isSelf: false });
    }
  }
  return out;
}

function worldOnRemoteState(userId, st) {
  if (!worldCallActive() || userId === BOT_USER_ID || (currentUser && userId === currentUser.id)) return;
  const next = pickWorld(st);
  worldPeople.set(userId, next);
  updateSpatialFor(userId);
  if (worldRenderer) worldRenderer.applyRemote(userId, next);
}

function worldOnUserLeft(userId) {
  worldPeople.delete(userId);
  if (worldRenderer) worldRenderer.removePerson(userId);
}

// o servidor não aceitou o que eu mandei (assento ocupado, fora da sala): volta pro estado dele
function worldOnCorrection(st) {
  if (!worldCallActive() || !st) return;
  const wasSitting = myWorld && myWorld.action === 'sit';
  myWorld = pickWorld(st);
  updateWorldListener();
  if (worldRenderer) worldRenderer.applySelf(myWorld, true);
  if (!wasSitting && myWorld.action !== 'sit' && st.action === 'stand') toast('esse lugar já está ocupado');
}

// saí da call: some com tudo e desmonta o 3D (libera a placa de vídeo)
function worldReset() {
  worldPeople.clear();
  myWorld = null;
  worldTv = { mode: 'off' };
  worldSceneId = null;
  worldGames.clear();
  worldListenerYaw = null;
  clearTimeout(worldSendTimer);
  worldSendTimer = null;
  if (worldRenderer) { try { worldRenderer.destroy(); } catch (_) { /* já desmontado */ } }
  worldRenderer = null;
  worldStage.hidden = true;
  worldStage.innerHTML = '';
  callParticipants.hidden = false;
  callView.classList.remove('is-world');
}

// ---------- minha posição → servidor ----------

// o renderizador chama isso a cada passo; aqui junta e manda no máximo a cada 100 ms (ação nova,
// tipo sentar ou acenar, vai na hora)
function worldSendSelf(st) {
  const prevAction = myWorld && myWorld.action;
  const prevSeat = myWorld && myWorld.seat;
  myWorld = pickWorld(st);
  updateWorldListener();
  const urgent = myWorld.action !== prevAction || myWorld.seat !== prevSeat;
  const flush = () => {
    worldSendTimer = null;
    worldLastSentAt = Date.now();
    if (myWorld && worldCallActive()) Realtime.send('world_move', myWorld);
  };
  if (urgent) { clearTimeout(worldSendTimer); flush(); return; }
  if (worldSendTimer) return;
  worldSendTimer = setTimeout(flush, Math.max(0, WORLD_SEND_INTERVAL_MS - (Date.now() - worldLastSentAt)));
}

// ---------- áudio espacial ----------

// chamado por ensurePeerBoostGraph (18-call-audio.js) ao montar o áudio de cada pessoa
function createWorldPanner(ctx) {
  const p = ctx.createPanner();
  p.panningModel = 'HRTF';      // som "em volta da cabeça" (com fone é bem convincente)
  // linear = some de verdade: até 1,2 m volume cheio, cai até ZERO em 9 m (antes, com 'inverse',
  // dava pra ouvir o apartamento inteiro). Quer conversar com alguém longe? Chega perto.
  p.distanceModel = 'linear';
  p.refDistance = 1.2;
  p.maxDistance = 9;
  p.rolloffFactor = 1;
  return p;
}

function setAudioParam(param, value, ctx) {
  if (!param) return;
  // suaviza: as posições chegam ~10x por segundo, sem isso o som "pula"
  try { param.setTargetAtTime(value, ctx.currentTime, 0.06); } catch (_) { param.value = value; }
}

function headHeight(st) { return (st ? st.y || 0 : 0) + (st && st.action === 'sit' ? WORLD_HEAD_SITTING : WORLD_HEAD_STANDING); }

function updateSpatialFor(userId) {
  const peer = peers.get(userId);
  const st = worldPeople.get(userId);
  if (!peer || !peer.spatialPanner || !st) return;
  const ctx = getAudioCtx();
  const p = peer.spatialPanner;
  if (p.positionX) {
    setAudioParam(p.positionX, st.x, ctx);
    setAudioParam(p.positionY, headHeight(st), ctx);
    setAudioParam(p.positionZ, st.z, ctx);
  } else {
    p.setPosition(st.x, headHeight(st), st.z);
  }
}

function updateWorldListener() {
  if (!myWorld || !audioCtx) return;
  const ctx = audioCtx;
  const l = ctx.listener;
  // posição = minha cabeça; direção = pra onde a câmera olha (esquerda da tela = ouvido esquerdo)
  const yaw = worldListenerYaw != null ? worldListenerYaw : myWorld.ry;
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  if (l.positionX) {
    setAudioParam(l.positionX, myWorld.x, ctx);
    setAudioParam(l.positionY, headHeight(myWorld), ctx);
    setAudioParam(l.positionZ, myWorld.z, ctx);
    setAudioParam(l.forwardX, fx, ctx);
    setAudioParam(l.forwardY, 0, ctx);
    setAudioParam(l.forwardZ, fz, ctx);
    setAudioParam(l.upX, 0, ctx);
    setAudioParam(l.upY, 1, ctx);
    setAudioParam(l.upZ, 0, ctx);
  } else {
    l.setPosition(myWorld.x, headHeight(myWorld), myWorld.z);
    l.setOrientation(fx, 0, fz, 0, 1, 0);
  }
}

// ---------- mostrar o mundo na tela da call ----------

function worldParticipantsList() {
  if (!currentUser) return [];
  const list = [{ id: currentUser.id, isSelf: true, user: currentUser, muted: isMuted, deafened: isDeafened }];
  for (const [id, st] of callParticipantsState.entries()) {
    if (id === currentUser.id || id === BOT_USER_ID) continue;
    const user = findUser(id);
    if (user) list.push({ id, isSelf: false, user, muted: !!st.muted, deafened: !!st.deafened });
  }
  return list;
}

// chamado no começo de renderCallParticipants() (19-call-ui.js): decide se a tela da call mostra a
// grade de sempre ou o mundo, e mantém a lista de bonecos em dia
function syncWorldView() {
  const show = worldCallActive() && !!currentChannel && currentChannel.id === voiceChannel.id && !callView.hidden;
  callView.classList.toggle('is-world', show);
  worldStage.hidden = !show;
  callParticipants.hidden = show;
  if (!show) { if (worldRenderer) worldRenderer.setVisible(false); return; }
  if (worldRenderer) {
    worldRenderer.setVisible(true);
    worldRenderer.setParticipants(worldParticipantsList());
    worldRenderer.screensChanged();
    return;
  }
  ensureWorldRenderer();
}

// a cena; se o arquivo dela não existir mais, cai na padrão (mesma regra do servidor, server/world.js)
async function loadWorldScene(id) {
  try {
    return await fetchWorldScene(id);
  } catch (err) {
    if (id === 'penthouse') throw err;
    return fetchWorldScene('penthouse');
  }
}
function fetchWorldScene(id) {
  if (!worldSceneCache.has(id)) {
    const p = fetch(`/world/scenes/${encodeURIComponent(id)}.json?v=${WORLD_ASSET_VERSION}`).then((r) => {
      if (!r.ok) throw new Error('cena não encontrada');
      return r.json();
    });
    p.catch(() => worldSceneCache.delete(id));
    worldSceneCache.set(id, p);
  }
  return worldSceneCache.get(id);
}

async function ensureWorldRenderer() {
  if (worldRenderer || worldLoading) return worldLoading;
  const channelId = voiceChannel.id;
  worldStage.innerHTML = '<div class="world-loading"><span class="world-loading-cube"></span>carregando o mundinho…</div>';
  worldLoading = (async () => {
    try {
      const [mod, scene] = await Promise.all([
        import(`/world/world.js?v=${WORLD_ASSET_VERSION}`),
        loadWorldScene(worldSceneId || voiceChannel.world_scene),
      ]);
      // saiu da call (ou trocou de canal) enquanto baixava
      if (!worldCallActive() || voiceChannel.id !== channelId) return null;
      worldStage.innerHTML = '';
      worldRenderer = mod.createWorld(worldStage, {
        scene,
        version: WORLD_ASSET_VERSION,
        getSelf: () => myWorld,
        getPeople: () => worldPeople,
        isSpeaking: (id) => speakingUsers.has(id),
        sendSelf: worldSendSelf,
        setListenerYaw: (yaw) => { worldListenerYaw = yaw; updateWorldListener(); },
        openProfile: (id, anchor) => openViewProfile(id, anchor),
        openContextMenu: (e, id, name) => openParticipantContextMenu(e, id, name),
        // TV
        user: (id) => (currentUser && id === currentUser.id ? currentUser : findUser(id)),
        userName: (id) => { const u = currentUser && id === currentUser.id ? currentUser : findUser(id); return u ? u.username : 'alguém'; },
        myPosition: () => myWorld,
        getScreenStream: worldScreenStream,
        screenSharers: worldScreenSharers,
        startScreenShare: () => { if (!screenOn) toggleScreenShare(); },
        sendTv: (msg) => Realtime.send('world_tv', msg),
        // jogos e piano
        getGames: () => worldGames,
        serverNow: () => Date.now() + worldGameClock,
        sendGame: (msg) => Realtime.send('game', msg),
        sendPiano: (note, on) => Realtime.send('piano', { note, on }),
        audioCtx: () => getAudioCtx(),
        createPanner: (ctx) => createWorldPanner(ctx),
        myId: () => (currentUser ? currentUser.id : null),
        isDeafened: () => isDeafened,
        toast: (text, kind) => toast(text, kind),
        setTvAudio: (a) => {
          worldTvAudio = { muted: !!a.muted, volume: Math.max(0, Math.min(100, Number(a.volume) || 0)) };
          if (worldTv.mode === 'screen') applyLocalOverrideToRemoteScreenAudio(worldTv.userId);
        },
      });
      worldRenderer.setParticipants(worldParticipantsList());
      if (myWorld) worldRenderer.applySelf(myWorld, true);
      worldRenderer.setTv(worldTv, worldTvNow);
      for (const g of worldGames.values()) worldRenderer.setGame(g);
      syncWorldView();
      return worldRenderer;
    } catch (err) {
      console.error('[mundinho] não deu pra carregar:', err);
      const webgl = (() => { try { return !!document.createElement('canvas').getContext('webgl2'); } catch (_) { return false; } })();
      worldStage.innerHTML = '<div class="world-loading"><span class="world-loading-text"></span><small class="world-loading-detail"></small><button type="button" class="world-pill-btn">tentar de novo</button></div>';
      worldStage.querySelector('.world-loading-text').textContent = webgl ? 'não deu pra carregar o mundinho' : 'seu navegador está sem WebGL (aceleração 3D) — o mundinho precisa dele';
      worldStage.querySelector('.world-loading-detail').textContent = err && err.message ? err.message : '';
      worldStage.querySelector('button').addEventListener('click', () => { worldStage.innerHTML = ''; ensureWorldRenderer(); });
      return null;
    } finally {
      worldLoading = null;
    }
  })();
  return worldLoading;
}

// trocar de aba / minimizar: o mundo para de desenhar sozinho (ver public/world/world.js), mas o
// áudio espacial continua — as posições seguem chegando por aqui
