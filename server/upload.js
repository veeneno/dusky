const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const UPLOADS_ROOT = path.join(__dirname, '..', 'public', 'uploads');

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

// avatar/banner: só imagem (inclui gif), até 15MB
// anexos de chat: qualquer tipo de arquivo, até 2GB — imagem e vídeo continuam com preview
// inline no chat; qualquer outro tipo (pdf, zip, docx, exe, etc.) vira um chip de download
// genérico. 2GB (não 200MB) pra dar conta de vídeos/backups/isos maiores sem precisar
// dividir o arquivo — o multer grava direto em disco (diskStorage) conforme os bytes chegam,
// então isso não pesa na memória do processo Node mesmo em arquivos grandes.
const attachmentUpload = multer({
  storage: makeStorage('attachments'),
  limits: { fileSize: 2 * 1024 * 1024 * 1024 },
});

const avatarUpload = multer({
  storage: makeStorage('avatars'),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, IMAGE_TYPES.includes(file.mimetype)),
});

const bannerUpload = multer({
  storage: makeStorage('banners'),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, IMAGE_TYPES.includes(file.mimetype)),
});

const serverIconUpload = multer({
  storage: makeStorage('server'),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, IMAGE_TYPES.includes(file.mimetype)),
});

// imagem de fundo do tema de cada pessoa (ver routes/profile.js, /theme/background)
const themeBackgroundUpload = multer({
  storage: makeStorage('themes'),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, IMAGE_TYPES.includes(file.mimetype)),
});

function attachmentTypeOf(mimetype) {
  if (IMAGE_TYPES.includes(mimetype)) return 'image';
  if (VIDEO_TYPES.includes(mimetype)) return 'video';
  return 'file'; // qualquer outro tipo — chip de download genérico no chat
}

module.exports = { avatarUpload, bannerUpload, attachmentUpload, serverIconUpload, themeBackgroundUpload, attachmentTypeOf, UPLOADS_ROOT };
