// ponto de entrada do bot de música — reconhece /play /search /skip /skipto /pause /stop
// /shuffle /volume /queue digitados em qualquer canal de texto e delega pra fila (queue.js) e
// resolução de link/busca (resolve.js).
const resolve = require('./resolve');
const queue = require('./queue');
const embeds = require('./embeds');
const { postBotMessage } = require('./post');
const realtime = require('../../realtime');
const access = require('../../access');

// retorna true se `content` era um comando do bot (já tratado); false se não é comando nenhum
// (mensagem normal segue seu fluxo de sempre em routes/messages.js)
async function maybeHandleCommand(content, channelId, user) {
  if (typeof content !== 'string') return false;
  const trimmed = content.trim();
  if (!trimmed.startsWith('/')) return false;

  const spaceIdx = trimmed.indexOf(' ');
  const cmd = (spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx)).toLowerCase();
  const arg = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1).trim();

  switch (cmd) {
    case '/play':
      await cmdPlay(arg, channelId, user);
      return true;
    case '/search':
      await cmdSearch(arg, channelId, user);
      return true;
    case '/skip':
      queue.skip(channelId);
      return true;
    case '/skipto':
      await cmdSkipTo(arg, channelId);
      return true;
    case '/pause':
      queue.pause(channelId);
      return true;
    case '/stop':
      queue.stop(channelId);
      return true;
    case '/shuffle':
      queue.shuffle(channelId);
      return true;
    case '/volume':
      queue.setVolume(channelId, arg);
      return true;
    case '/queue':
      if (arg.toLowerCase() === 'clear') {
        queue.clearQueue(channelId);
      } else {
        queue.list(channelId, arg);
      }
      return true;
    default:
      return false; // "/" que não é comando do bot — deixa como mensagem normal mesmo
  }
}

// /play aceita: link do youtube/spotify, nome de música (busca e toca o 1º resultado direto),
// ou um número de 1 a 5 se houver um /search recente pendente nesse canal (escolhe daquela lista)
async function cmdPlay(arg, channelId, user) {
  if (!arg) {
    postBotMessage(channelId, '', embeds.errorEmbed('uso: `/play <link do youtube/spotify>`, `/play <nome da música>` ou `/play <número>` depois de um `/search`.'));
    return;
  }
  // o bot toca na call de quem pediu, e cada servidor tem o seu bot — então a call tem que ser
  // deste servidor (sem call, a música tocaria pra ninguém)
  const serverId = access.getChannel(channelId).server_id;
  const voice = realtime.voiceStateOf(user.id);
  if (!voice || voice.serverId !== serverId) {
    postBotMessage(channelId, '', embeds.errorEmbed('entra num canal de voz deste servidor primeiro — eu toco na call em que você estiver.'));
    return;
  }
  // já tocando pra outra call deste servidor: não sai arrastando o bot (e a música) de quem está ouvindo
  const busyIn = queue.botVoiceChannel(serverId);
  if (busyIn && busyIn !== voice.channelId && realtime.humansInChannel(busyIn).length > 0) {
    const busyChannel = access.getChannel(busyIn);
    postBotMessage(channelId, '', embeds.errorEmbed(`já estou tocando em **${busyChannel ? busyChannel.name : 'outra call'}** — entra lá ou espera a fila acabar.`));
    return;
  }

  const asNumber = Number(arg);
  if (Number.isInteger(asNumber) && queue.hasPendingSearchResult(channelId, asNumber)) {
    const track = queue.takePendingSearchResult(channelId, asNumber, user.username);
    await queue.enqueue(channelId, [track], user, voice.channelId);
    return;
  }

  try {
    const tracks = await resolve.resolveInput(arg, user.username);
    await queue.enqueue(channelId, tracks, user, voice.channelId);
  } catch (err) {
    postBotMessage(channelId, '', embeds.errorEmbed(err.message));
  }
}

// /search <nome> — mostra os 5 melhores resultados do youtube numa lista numerada (igual os
// bots de música clássicos do Discord), pra escolher com /play <número>
async function cmdSearch(arg, channelId, user) {
  if (!arg) {
    postBotMessage(channelId, '', embeds.errorEmbed('uso: `/search <nome da música>`'));
    return;
  }
  try {
    await queue.search(channelId, arg, user);
  } catch (err) {
    postBotMessage(channelId, '', embeds.errorEmbed(err.message));
  }
}

async function cmdSkipTo(arg, channelId) {
  if (!arg) {
    postBotMessage(channelId, '', embeds.errorEmbed('uso: `/skipto <número>` (posição na fila, veja com `/queue`)'));
    return;
  }
  await queue.skipTo(channelId, arg);
}

module.exports = { maybeHandleCommand };
