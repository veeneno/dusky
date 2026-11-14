// Efeito no nome (perfil): LED RGB, neon, degradê, brilho, pulso.
//
// Gravado em users.name_style como JSON {"effect","c1","c2"} e mandado junto com os dados públicos
// do perfil (access.PUBLIC_USER_COLUMNS, middleware/auth.js, routes/members.js, as mensagens em
// db/messageQueries.js) — todo mundo vê o efeito no chat, DMs, lista de membros e cartão de perfil.
//
// A aparência de cada efeito mora em public/css/profile.css (.name-fx-<efeito>) e o seletor em
// public/js/app/12-members-profile.js (NAME_EFFECTS). Efeito novo: os três lugares.

const NAME_EFFECTS = ['gradiente', 'led', 'neon', 'brilho', 'pulso'];
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

// null = sem efeito; senão a string JSON pra gravar. Lança Error com a mensagem pro usuário.
function cleanNameStyle(input) {
  if (input === null || input === '' || (input && typeof input === 'object' && input.effect === '')) return null;
  if (typeof input !== 'object' || Array.isArray(input)) throw new Error('efeito do nome inválido');
  if (!NAME_EFFECTS.includes(input.effect)) throw new Error('efeito do nome inválido');
  const out = { effect: input.effect };
  for (const k of ['c1', 'c2']) {
    if (input[k] == null || input[k] === '') continue;
    if (typeof input[k] !== 'string' || !HEX_RE.test(input[k])) throw new Error('cor do efeito inválida');
    out[k] = input[k].toLowerCase();
  }
  return JSON.stringify(out);
}

module.exports = { NAME_EFFECTS, cleanNameStyle };
