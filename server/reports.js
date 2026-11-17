// Denúncias: qualquer pessoa denuncia uma mensagem que consegue ver, ou alguém com quem divide
// servidor/DM. Vão pro painel do admin do site (aba "denúncias") e, se o e-mail estiver
// configurado, o admin recebe um aviso. O texto e o anexo da mensagem ficam guardados como prova
// mesmo se a pessoa apagar depois (anexo: link físico em server/reports-evidence/, fora do site).
const fs = require('fs');
const path = require('path');
const db = require('./db');

const EVIDENCE_DIR = path.join(__dirname, 'reports-evidence');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const ATTACHMENT_URL = /^\/uploads\/attachments\/([a-f0-9]{32}(?:\.[a-z0-9]{1,10})?)$/;

const REASONS = {
  spam: 'spam ou golpe',
  harassment: 'assédio ou discurso de ódio',
  violence: 'violência ou ameaça',
  sexual: 'conteúdo sexual explícito',
  child: 'abuso ou exploração de menores',
  selfharm: 'automutilação ou suicídio',
  illegal: 'outra coisa ilegal',
  other: 'outro motivo',
};

// guarda o anexo da mensagem denunciada: link físico (não ocupa espaço de novo e sobrevive ao
// arquivo original ser apagado). Se não der (outro disco), copia.
function keepEvidence(reportId, attachmentUrl) {
  const m = ATTACHMENT_URL.exec(attachmentUrl || '');
  if (!m) return null;
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true, mode: 0o700 });
  const name = `${reportId}-${m[1]}`;
  const src = path.join(PUBLIC_DIR, 'uploads', 'attachments', m[1]);
  const dest = path.join(EVIDENCE_DIR, name);
  try { fs.linkSync(src, dest); } catch (_) {
    try { fs.copyFileSync(src, dest); } catch (_) { return null; }
  }
  return name;
}

function evidencePath(name) {
  if (!/^\d+-[a-f0-9]{32}(?:\.[a-z0-9]{1,10})?$/.test(name || '')) return null;
  return path.join(EVIDENCE_DIR, name);
}

function siteAdmins() {
  return db.prepare('SELECT id, username, email FROM users WHERE is_site_admin = 1').all();
}

module.exports = { REASONS, keepEvidence, evidencePath, siteAdmins, EVIDENCE_DIR };
