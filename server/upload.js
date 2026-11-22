const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const UPLOADS_ROOT = path.join(__dirname, '..', 'public', 'uploads');
// pasta das decorações do perfil é nova: cria se ainda não existir (o multer não cria sozinho)
require('fs').mkdirSync(path.join(UPLOADS_ROOT, 'decor'), { recursive: true });

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];

function extFor(mimetype, originalname) {
  const map = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'video/quicktime': '.mov',
  };
  if (map[mimetype]) return map[mimetype];
  // arquivo genérico (não imagem/vídeo conhecido) — preserva a extensão original do nome
  // enviado, senão o download perderia a extensão (ex: "relatorio" em vez de "relatorio.pdf")
  const ext = path.extname(originalname || '');
  return /^\.[a-zA-Z0-9]{1,10}$/.test(ext) ? ext.toLowerCase() : '';
}

function makeStorage(subdir) {
  return multer.diskStorage({
    destination: path.join(UPLOADS_ROOT, subdir),
    filename: (req, file, cb) => {
      const name = crypto.randomBytes(16).toString('hex') + extFor(file.mimetype, file.originalname);
      cb(null, name);
    },
  });
}

// limites que valem pra todo envio: um arquivo por pedido e poucos campos de texto pequenos
// (a legenda do anexo tem até 4000 caracteres). Sem isso, um pedido podia mandar milhares de
// campos/partes e prender o servidor só processando o formulário.
const FORM_LIMITS = { files: 1, fields: 10, fieldSize: 64 * 1024, parts: 12, fieldNameSize: 100 };

// anexos de chat: qualquer tipo de arquivo — imagem e vídeo continuam com preview inline no chat;
// qualquer outro tipo (pdf, zip, docx, exe, etc.) vira um chip de download genérico. O tamanho
// máximo é POR CONTA (padrão 100 MB, o admin muda no painel; o admin do site não tem limite) — ver
// server/uploadLimits.js. O multer grava direto em disco (diskStorage) conforme os bytes chegam,
// então nem arquivo grande pesa na memória do processo Node.
const attachmentStorage = makeStorage('attachments');
function attachmentUpload(maxBytes) {
  const limits = { ...FORM_LIMITS };
  if (Number.isFinite(maxBytes)) limits.fileSize = maxBytes;
  return multer({ storage: attachmentStorage, limits });
}

const avatarUpload = multer({
  storage: makeStorage('avatars'),
  limits: { ...FORM_LIMITS, fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, IMAGE_TYPES.includes(file.mimetype)),
});

const bannerUpload = multer({
  storage: makeStorage('banners'),
  limits: { ...FORM_LIMITS, fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, IMAGE_TYPES.includes(file.mimetype)),
});

const serverIconUpload = multer({
  storage: makeStorage('server'),
  limits: { ...FORM_LIMITS, fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, IMAGE_TYPES.includes(file.mimetype)),
});

// imagem de fundo do tema de cada pessoa (ver routes/profile.js, /theme/background)
// decorações do perfil enviadas pela pessoa (placa do nome, decoração do avatar, efeito do perfil —
// ver server/decor.js). Imagem com fundo transparente (png/webp/gif) é o normal; até 10MB
const decorUpload = multer({
  storage: makeStorage('decor'),
  limits: { ...FORM_LIMITS, fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, IMAGE_TYPES.includes(file.mimetype)),
});

const themeBackgroundUpload = multer({
  storage: makeStorage('themes'),
  limits: { ...FORM_LIMITS, fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, IMAGE_TYPES.includes(file.mimetype)),
});

// arquivo bruto do soundboard: vai pra pasta temporária do sistema, o ffmpeg corta/converte e o
// temporário é apagado (ver server/soundboard.js). Qualquer áudio ou vídeo, até 25MB.
const soundUpload = multer({
  storage: multer.diskStorage({
    destination: require('os').tmpdir(),
    filename: (req, file, cb) => cb(null, 'dusky-som-' + crypto.randomBytes(12).toString('hex')),
  }),
  limits: { ...FORM_LIMITS, fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^(audio|video)\//.test(file.mimetype) || file.mimetype === 'application/ogg'),
});

function attachmentTypeOf(mimetype) {
  if (IMAGE_TYPES.includes(mimetype)) return 'image';
  if (VIDEO_TYPES.includes(mimetype)) return 'video';
  return 'file'; // qualquer outro tipo — chip de download genérico no chat
}

// nome original do anexo, limpo antes de ir pro banco: tira caracteres de controle, aspas,
// < >, / e \ (o nome vai pra tela de todo mundo do canal e pro atributo download do link) e corta
// em 255. O arquivo no disco nunca usa esse nome (é sempre aleatório, ver makeStorage).
function sanitizeAttachmentName(name) {
  if (typeof name !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const clean = name.replace(/[\u0000-\u001f\u007f-\u009f"'<>/\\`]/g, '').trim().slice(0, 255);
  return clean || null;
}

module.exports = { extFor, sanitizeAttachmentName, decorUpload, avatarUpload, bannerUpload, soundUpload, attachmentUpload, serverIconUpload, themeBackgroundUpload, attachmentTypeOf, UPLOADS_ROOT };
