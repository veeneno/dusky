// termos/privacidade: preenche o contato (CONTACT_EMAIL no .env do servidor, se tiver)
fetch('/api/auth/config').then((r) => r.json()).then((cfg) => {
  if (!cfg.contactEmail) return;
  document.querySelectorAll('[data-contact]').forEach((el) => {
    el.textContent = '';
    const a = document.createElement('a');
    a.href = `mailto:${cfg.contactEmail}`;
    a.textContent = cfg.contactEmail;
    el.append('pelo e-mail ', a, ' ou ', el.dataset.contact);
  });
}).catch(() => {});
