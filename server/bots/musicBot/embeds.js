// monta os objetos de embed usados pelas respostas do bot de música. formato:
// { title, description, thumbnail, color, fields: [{name, value}], footer }
// o front-end (public/js/app/, .msg-embed em chat.css) sabe renderizar esse formato.
const { formatDuration } = require('./resolve');

const COLOR = {
  accent: '#A855F7',  // mesmo roxo de destaque do resto do app (var(--amethyst))
  ok: '#7CD9A0',       // mesmo verde de "online" (var(--online))
  warn: '#FF8F66',    // mesmo laranja de erro/aviso do app (var(--ember))
};

function trackLine(t, extra) {
  const dur = formatDuration(t.durationSec);
  const artist = t.artist ? ` — ${t.artist}` : '';
  return `**${t.title}**${artist} \`${dur}\`${extra || ''}`;
}

function nowPlayingEmbed(track, volume) {
  return {
    title: '🎵 tocando agora',
    description: trackLine(track),
    thumbnail: track.thumbnail || null,
    color: COLOR.accent,
    footer: `pedido por ${track.requestedBy || '?'} · volume ${volume}%`,
  };
}

function addedEmbed(tracks, requestedBy) {
  if (tracks.length === 1) {
    return {
      title: '➕ adicionada à fila',
      description: trackLine(tracks[0]),
      thumbnail: tracks[0].thumbnail || null,
      color: COLOR.accent,
      footer: `pedido por ${requestedBy}`,
    };
  }
  return {
    title: '➕ músicas adicionadas à fila',
    description: `${tracks.length} músicas na fila, pedidas por ${requestedBy}.`,
    color: COLOR.accent,
  };
}

function queueEmbed({ current, shown, startIndex, totalUpcoming, page, totalPages }) {
  const fields = [];
  if (current) {
    fields.push({ name: 'tocando agora', value: trackLine(current) });
  }
  if (shown.length) {
    const list = shown.map((t, i) => `${startIndex + i + 1}. ${trackLine(t)}`).join('\n');
    fields.push({ name: `a seguir (${totalUpcoming})`, value: list });
  } else if (!current) {
    fields.push({ name: 'fila', value: 'vazia. manda `/play <link ou nome>` pra começar.' });
  }
  return {
    title: '📜 fila de reprodução',
    color: COLOR.accent,
    fields,
    footer: totalPages > 1 ? `página ${page}/${totalPages} · /queue <número> pra ver outra` : null,
  };
}

function simpleEmbed(title, description, color) {
  return { title, description, color: color || COLOR.accent };
}

function errorEmbed(message) {
  return { title: '⚠️ ops', description: message, color: COLOR.warn };
}

// ---------- /search — lista numerada de resultados, tipo os bots clássicos de música ----------
function searchResultsEmbed(results, query) {
  const list = results.map((t, i) => `**${i + 1}.** ${trackLine(t)}`).join('\n');
  return {
    title: `🔎 resultados pra "${query}"`,
    description: list,
    color: COLOR.accent,
    footer: 'manda /play <número> pra tocar um desses (vale por 3 min)',
  };
}

// ---------- /skip ----------
function skippedEmbed(skippedTrack) {
  return {
    title: '⏭️ pulada',
    description: trackLine(skippedTrack),
    thumbnail: skippedTrack.thumbnail || null,
    color: COLOR.accent,
  };
}

// ---------- /skipto ----------
function skipToEmbed(targetTrack, skippedCount) {
  return {
    title: '⏭️ avançando na fila',
    description: `pulando ${skippedCount} música${skippedCount === 1 ? '' : 's'}, indo pra **${targetTrack.title}**${targetTrack.artist ? ' — ' + targetTrack.artist : ''}.`,
    thumbnail: targetTrack.thumbnail || null,
    color: COLOR.accent,
  };
}

// ---------- /pause ----------
function pausedEmbed(track) {
  return {
    title: '⏸️ pausado',
    description: track ? trackLine(track) : null,
    thumbnail: track && track.thumbnail || null,
    color: COLOR.accent,
  };
}

function resumedEmbed(track) {
  return {
    title: '▶️ retomado',
    description: track ? trackLine(track) : null,
    thumbnail: track && track.thumbnail || null,
    color: COLOR.accent,
  };
}

// ---------- /queue clear ----------
function queueClearedEmbed(count) {
  return {
    title: '🧹 fila limpa',
    description: count > 0
      ? `${count} música${count === 1 ? '' : 's'} removida${count === 1 ? '' : 's'} da fila. o que já tá tocando continua.`
      : 'a fila já estava vazia.',
    color: COLOR.accent,
  };
}

module.exports = {
  COLOR,
  nowPlayingEmbed,
  addedEmbed,
  queueEmbed,
  simpleEmbed,
  errorEmbed,
  searchResultsEmbed,
  skippedEmbed,
  skipToEmbed,
  pausedEmbed,
  resumedEmbed,
  queueClearedEmbed,
};
