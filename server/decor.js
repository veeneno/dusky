// Decorações do perfil (estilo Discord): placa do nome, decoração do avatar e efeito do perfil.
//
// Cada uma fica numa coluna de users (nameplate, avatar_deco, profile_fx) com um destes valores:
//   null                               nada
//   "preset:<nome>"                    um dos modelos desenhados em CSS (public/css/profile.css)
//   "/uploads/decor/<32 hex>.<ext>"    imagem que a própria pessoa enviou (POST /api/profile/decor/:slot)
// Vão junto com os dados públicos do perfil (access.PUBLIC_USER_COLUMNS etc.), então todo mundo vê.
//
// Modelo novo: aqui (PRESETS), no CSS (.np-<nome>, .avatar-deco-<nome>, .pc-fx-<nome>) e na lista
// DECOR_SLOTS de public/js/app/12-members-profile.js.

const PRESETS = {
  nameplate: ['aurora', 'galaxia', 'por-do-sol', 'sakura'],
  avatar_deco: ['anel-rgb', 'aura', 'orbita', 'brilhos'],
  profile_fx: ['neve', 'estrelas', 'bolhas', 'coracoes'],
};
const SLOTS = Object.keys(PRESETS);
const UPLOAD_RE = /^\/uploads\/decor\/[a-f0-9]{32}\.(png|jpg|webp|gif)$/;

function isDecorUpload(value) {
  return typeof value === 'string' && UPLOAD_RE.test(value);
}

// valor que o site mandou no PATCH → o que gravar. `current` é o que está no banco: a imagem
// enviada só pode "continuar" (o site manda de volta a mesma), nunca apontar pra outra.
// Devolve { value } ou lança Error com a mensagem pro usuário.
function cleanDecor(slot, input, current) {
  if (!SLOTS.includes(slot)) throw new Error('decoração inválida');
  if (input === null || input === '') return { value: null };
  if (typeof input !== 'string') throw new Error('decoração inválida');
  if (input.startsWith('preset:')) {
    if (!PRESETS[slot].includes(input.slice(7))) throw new Error('modelo de decoração inválido');
    return { value: input };
  }
  if (isDecorUpload(input) && input === current) return { value: input };
  throw new Error('decoração inválida');
}

module.exports = { PRESETS, SLOTS, isDecorUpload, cleanDecor };
