// dusky — Conta: e-mail e verificação em 2 etapas (perfil → "conta e segurança")
// Parte 31 do código do site (public/js/app/). Leia o README.md desta pasta antes de mexer.
//
// Neste arquivo:
//   - mostrar/trocar o e-mail da conta (código no e-mail novo; trocar pede a senha)
//   - 2 etapas pelo app autenticador: QR code -> código -> códigos de recuperação (mostrados 1 vez)
//   - 2 etapas por código no e-mail (liga/desliga com a senha)
// Servidor: server/routes/auth.js (e-mail) e server/routes/account.js (2 etapas).

const accountSecurityBox = document.getElementById('accountSecurity');
let secState = null;   // { email, emailPending, totp, email2fa, recoveryLeft, mailConfigured }
let secFlow = null;    // { kind, step, data } — o que está sendo feito agora
let secError = '';

function secEl(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children) if (c != null) el.append(c);
  return el;
}

async function secApi(method, path, body) {
  try {
    const res = await fetch(path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = {};
    try { data = await res.json(); } catch (_) { /* sem corpo */ }
    return { ok: res.ok, data };
  } catch (_) {
    return { ok: false, data: { error: 'não consegui falar com o servidor' } };
  }
}

async function loadAccountSecurity() {
  if (!accountSecurityBox) return;
  const r = await secApi('GET', '/api/account/security');
  if (r.ok) secState = r.data;
  renderAccountSecurity();
}

function startSecFlow(kind, step = 'ask', data = {}) {
  secFlow = { kind, step, data };
  secError = '';
  renderAccountSecurity();
}

function endSecFlow() {
  secFlow = null;
  secError = '';
  loadAccountSecurity();
}

// campo de formulário pequeno
function secField(label, input) {
  return secEl('div', { class: 'field' }, secEl('label', { text: label }), input);
}

function secInput(type, attrs = {}) {
  return secEl('input', { type, ...attrs });
}

// executa uma ação do formulário com o botão ocupado
async function secRun(btn, fn) {
  btn.disabled = true;
  secError = '';
  try { await fn(); } finally { btn.disabled = false; }
}

function secActions(...buttons) {
  return secEl('div', { class: 'sec-actions' }, ...buttons);
}

function secCancelBtn() {
  return secEl('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'cancelar', onclick: endSecFlow });
}

function renderRecoveryCodes(codes) {
  const text = codes.join('\n');
  const box = secEl('div', { class: 'sec-codes' }, ...codes.map((c) => secEl('code', { text: c })));
  const copy = secEl('button', {
    type: 'button',
    class: 'btn btn-ghost btn-sm',
    text: 'copiar',
    onclick: () => { navigator.clipboard && navigator.clipboard.writeText(text).then(() => toast('códigos copiados')).catch(() => {}); },
  });
  const save = secEl('button', {
    type: 'button',
    class: 'btn btn-ghost btn-sm',
    text: 'baixar .txt',
    onclick: () => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([`códigos de recuperação do dusky (${currentUser ? currentUser.username : ''})\ncada um vale uma vez:\n\n${text}\n`], { type: 'text/plain' }));
      a.download = 'dusky-codigos-de-recuperacao.txt';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    },
  });
  return secEl('div', {},
    secEl('p', { class: 'field-help', text: 'Guarde estes códigos num lugar seguro: sem o celular, cada um deles entra UMA vez no lugar do código do app. Eles não aparecem de novo.' }),
    box,
    secActions(copy, save, secEl('button', { type: 'button', class: 'btn btn-primary btn-sm', text: 'guardei', onclick: endSecFlow })));
}

function renderEmailSection() {
  const s = secState;
  const sec = secEl('section', { class: 'profile-edit-group profile-account' }, secEl('h4', { class: 'profile-edit-group-title', text: 'e-mail' }));
  const flow = secFlow && secFlow.kind === 'email' ? secFlow : null;
  if (!flow) {
    sec.append(
      secEl('p', { class: 'field-help' }, 'Serve pra entrar (no lugar do nick) e pra recuperar a senha. Ninguém mais vê.'),
      secEl('p', { class: 'sec-value', text: s.email || '—' }),
      secActions(secEl('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'trocar e-mail', onclick: () => startSecFlow('email') })),
    );
    return sec;
  }
  if (flow.step === 'ask') {
    const email = secInput('email', { maxlength: 254, autocomplete: 'email', placeholder: 'novo@exemplo.com' });
    const pw = secInput('password', { autocomplete: 'current-password' });
    const go = secEl('button', { type: 'button', class: 'btn btn-primary btn-sm', text: 'mandar código' });
    go.addEventListener('click', () => secRun(go, async () => {
      const r = await secApi('POST', '/api/auth/email', { email: email.value.trim(), password: pw.value });
      if (!r.ok) { secShowError(r.data.error || 'não deu'); return; }
      startSecFlow('email', 'code', { email: r.data.emailPending || email.value.trim() });
    }));
    sec.append(secField('e-mail novo', email), secField('sua senha', pw), secActions(go, secCancelBtn()));
    setTimeout(() => email.focus(), 30);
  } else {
    const code = secInput('text', { inputmode: 'numeric', maxlength: 6, autocomplete: 'one-time-code', placeholder: '000000', class: 'sec-code-input' });
    const go = secEl('button', { type: 'button', class: 'btn btn-primary btn-sm', text: 'confirmar' });
    go.addEventListener('click', () => secRun(go, async () => {
      const r = await secApi('POST', '/api/auth/email/confirm', { code: code.value.trim() });
      if (!r.ok) { secShowError(r.data.error || 'código errado'); return; }
      toast('e-mail trocado');
      endSecFlow();
    }));
    sec.append(secEl('p', { class: 'field-help', text: `Mandamos um código pra ${flow.data.email}. Olhe também o spam.` }), secField('código', code), secActions(go, secCancelBtn()));
    setTimeout(() => code.focus(), 30);
  }
  return sec;
}

function render2faSection() {
  const s = secState;
  const sec = secEl('section', { class: 'profile-edit-group profile-account' },
    secEl('h4', { class: 'profile-edit-group-title', text: 'verificação em 2 etapas' }),
    secEl('p', { class: 'field-help', text: 'Opcional. Além da senha, entrar pede um código — mesmo quem descobrir sua senha não entra. Pode ligar um dos dois ou os dois.' }));
  const flow = secFlow && !['email', 'delete'].includes(secFlow.kind) ? secFlow : null;

  if (!flow) {
    const row = (title, desc, on, btnLabel, onClick) => secEl('div', { class: 'sec-row' },
      secEl('div', { class: 'sec-row-text' }, secEl('strong', { text: title }), secEl('small', { text: desc })),
      secEl('span', { class: `sec-badge${on ? ' on' : ''}`, text: on ? 'ligado' : 'desligado' }),
      secEl('button', { type: 'button', class: on ? 'btn btn-ghost btn-sm' : 'btn btn-primary btn-sm', text: btnLabel, onclick: onClick }));
    sec.append(row('app autenticador', 'Google Authenticator, Authy, 2FAS, Aegis… o mais seguro', s.totp,
      s.totp ? 'desligar' : 'ligar', () => startSecFlow(s.totp ? 'totp-off' : 'totp-on')));
    sec.append(row('código por e-mail', `um código chega em ${s.email || 'seu e-mail'} toda vez que você entrar`, s.email2fa,
      s.email2fa ? 'desligar' : 'ligar', () => startSecFlow('email2fa', 'ask', { enable: !s.email2fa })));
    if (s.totp) {
      sec.append(secEl('div', { class: 'sec-row' },
        secEl('div', { class: 'sec-row-text' }, secEl('strong', { text: 'códigos de recuperação' }), secEl('small', { text: `${s.recoveryLeft} sobrando — pra entrar sem o celular` })),
        secEl('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'gerar novos', onclick: () => startSecFlow('recovery') })));
    }
    if (!s.mailConfigured && currentUser && currentUser.is_site_admin) {
      sec.append(secEl('p', { class: 'field-help sec-warn', text: 'admin: o envio de e-mail ainda não está configurado no servidor (RESEND_API_KEY no .env) — os códigos estão indo só pro log.' }));
    }
    return sec;
  }

  const pw = () => secInput('password', { autocomplete: 'current-password' });
  const codeInput = (ph = '000000', max = 6) => secInput('text', { inputmode: max > 6 ? 'text' : 'numeric', maxlength: max, autocomplete: 'one-time-code', placeholder: ph, class: 'sec-code-input' });

  if (flow.kind === 'totp-on' && flow.step === 'ask') {
    const p = pw();
    const go = secEl('button', { type: 'button', class: 'btn btn-primary btn-sm', text: 'continuar' });
    go.addEventListener('click', () => secRun(go, async () => {
      const r = await secApi('POST', '/api/account/totp/setup', { password: p.value });
      if (!r.ok) { secShowError(r.data.error || 'não deu'); return; }
      startSecFlow('totp-on', 'scan', r.data);
    }));
    sec.append(secEl('p', { class: 'field-help', text: 'Pra ligar o app autenticador, confirme sua senha.' }), secField('sua senha', p), secActions(go, secCancelBtn()));
    setTimeout(() => p.focus(), 30);
  } else if (flow.kind === 'totp-on' && flow.step === 'scan') {
    const c = codeInput();
    const go = secEl('button', { type: 'button', class: 'btn btn-primary btn-sm', text: 'ligar' });
    go.addEventListener('click', () => secRun(go, async () => {
      const r = await secApi('POST', '/api/account/totp/enable', { code: c.value.trim() });
      if (!r.ok) { secShowError(r.data.error || 'código errado'); return; }
      secState = r.data;
      startSecFlow('codes', 'show', { codes: r.data.recoveryCodes });
      toast('verificação em 2 etapas ligada');
    }));
    sec.append(
      secEl('p', { class: 'field-help', text: '1. No app autenticador, adicione uma conta escaneando o QR code (ou digitando a chave).' }),
      secEl('div', { class: 'sec-qr' }, secEl('img', { src: flow.data.qr, alt: 'QR code do app autenticador', width: 180, height: 180 })),
      secEl('p', { class: 'sec-secret' }, 'chave: ', secEl('code', { text: flow.data.secret })),
      secEl('p', { class: 'field-help', text: '2. Coloque aqui o código de 6 dígitos que o app mostrar pro dusky.' }),
      secField('código do app', c), secActions(go, secCancelBtn()));
    setTimeout(() => c.focus(), 30);
  } else if (flow.kind === 'codes') {
    sec.append(renderRecoveryCodes(flow.data.codes));
  } else if (flow.kind === 'totp-off' || flow.kind === 'recovery') {
    const p = pw();
    const c = codeInput('000000 ou ab12c-3de45', 11);
    const off = flow.kind === 'totp-off';
    const go = secEl('button', { type: 'button', class: off ? 'btn btn-danger-ghost btn-sm' : 'btn btn-primary btn-sm', text: off ? 'desligar o app' : 'gerar códigos novos' });
    go.addEventListener('click', () => secRun(go, async () => {
      const code = c.value.trim();
      const body = { password: p.value, code, method: /[a-z-]/i.test(code) ? 'recovery' : 'totp' };
      const r = await secApi('POST', off ? '/api/account/totp/disable' : '/api/account/recovery', body);
      if (!r.ok) { secShowError(r.data.error || 'não deu'); return; }
      secState = r.data;
      if (off) { toast('app autenticador desligado'); endSecFlow(); } else startSecFlow('codes', 'show', { codes: r.data.recoveryCodes });
    }));
    sec.append(secEl('p', { class: 'field-help', text: off ? 'Pra desligar, confirme a senha e um código do app (ou de recuperação).' : 'Os códigos antigos param de valer. Confirme a senha e um código do app.' }),
      secField('sua senha', p), secField(off ? 'código do app ou de recuperação' : 'código do app', c), secActions(go, secCancelBtn()));
    setTimeout(() => p.focus(), 30);
  } else if (flow.kind === 'email2fa') {
    const p = pw();
    const on = flow.data.enable;
    const go = secEl('button', { type: 'button', class: on ? 'btn btn-primary btn-sm' : 'btn btn-danger-ghost btn-sm', text: on ? 'ligar' : 'desligar' });
    go.addEventListener('click', () => secRun(go, async () => {
      const r = await secApi('POST', '/api/account/email2fa', { enabled: on, password: p.value });
      if (!r.ok) { secShowError(r.data.error || 'não deu'); return; }
      toast(on ? 'código por e-mail ligado' : 'código por e-mail desligado');
      endSecFlow();
    }));
    sec.append(secEl('p', { class: 'field-help', text: on ? `Toda vez que entrar, um código vai pra ${secState.email}. Confirme a senha pra ligar.` : 'Confirme a senha pra desligar.' }),
      secField('sua senha', p), secActions(go, secCancelBtn()));
    setTimeout(() => p.focus(), 30);
  }
  return sec;
}

// seus dados (LGPD): baixar tudo e excluir a conta
function renderDataSection() {
  const s = secState;
  const sec = secEl('section', { class: 'profile-edit-group profile-account' },
    secEl('h4', { class: 'profile-edit-group-title', text: 'seus dados' }));
  const flow = secFlow && secFlow.kind === 'delete' ? secFlow : null;
  const download = secEl('a', { class: 'btn btn-ghost btn-sm', href: '/api/account/export', download: 'dusky-meus-dados.json', text: 'baixar meus dados' });
  sec.append(
    secEl('p', { class: 'field-help', text: 'Uma cópia de tudo que sua conta tem aqui — perfil, servidores, mensagens e reações — num arquivo JSON.' }),
    secActions(download),
    secEl('p', { class: 'field-help' }, 'Veja também os ', secEl('a', { href: '/termos', target: '_blank', rel: 'noopener', text: 'termos de uso' }),
      ' e a ', secEl('a', { href: '/privacidade', target: '_blank', rel: 'noopener', text: 'política de privacidade' }), '. O código do dusky é aberto: ', secEl('a', { href: 'https://github.com/veeneno/dusky', target: '_blank', rel: 'noopener', text: 'github.com/veeneno/dusky' }), '.'));

  const zone = secEl('section', { class: 'profile-edit-group profile-account sec-danger-zone' },
    secEl('h4', { class: 'profile-edit-group-title', text: 'excluir conta' }));
  if (currentUser && currentUser.is_site_admin) {
    zone.append(secEl('p', { class: 'field-help', text: 'A conta de admin do site não pode ser excluída por aqui.' }));
    return [sec, zone];
  }
  if (!flow) {
    zone.append(
      secEl('p', { class: 'field-help', text: 'Apaga na hora seu nome, e-mail, senha, fotos, bio, tema e 2 etapas, e tira você de todos os servidores. Não tem volta.' }),
      secActions(secEl('button', { type: 'button', class: 'btn btn-danger-ghost btn-sm', text: 'excluir minha conta', onclick: () => startSecFlow('delete') })));
    return [sec, zone];
  }
  const p = secInput('password', { autocomplete: 'current-password' });
  const code = s.totp ? secInput('text', { inputmode: 'text', maxlength: 11, autocomplete: 'one-time-code', placeholder: '000000 ou ab12c-3de45', class: 'sec-code-input' }) : null;
  const wipe = secInput('checkbox');
  const confirmBox = secInput('text', { placeholder: 'excluir', autocomplete: 'off', maxlength: 20 });
  const go = secEl('button', { type: 'button', class: 'btn btn-danger btn-sm', text: 'excluir de vez', disabled: true });
  confirmBox.addEventListener('input', () => { go.disabled = confirmBox.value.trim().toLowerCase() !== 'excluir'; });
  go.addEventListener('click', () => secRun(go, async () => {
    const c = code ? code.value.trim() : '';
    const body = { password: p.value, deleteMessages: wipe.checked };
    if (code) { body.code = c; body.method = /[a-z-]/i.test(c) ? 'recovery' : 'totp'; }
    const r = await secApi('POST', '/api/account/delete', body);
    if (!r.ok) { secShowError(r.data.error || 'não deu'); return; }
    if (voiceChannel) leaveVoiceCall({ silent: true });
    window.location.replace('/login.html?conta=excluida');
  }));
  zone.append(
    secEl('p', { class: 'field-help', text: 'Antes de excluir: se você é dono de algum servidor, apague ele primeiro. Quer uma cópia dos seus dados? Baixe ali em cima antes.' }),
    secField('sua senha', p),
    ...(code ? [secField('código do app ou de recuperação', code)] : []),
    secEl('label', { class: 'sec-check' }, wipe, secEl('span', { text: 'apagar também todas as minhas mensagens e anexos (sem marcar, elas ficam nas conversas como "conta excluída")' })),
    secField('digite "excluir" pra confirmar', confirmBox),
    secActions(go, secCancelBtn()));
  setTimeout(() => p.focus(), 30);
  return [sec, zone];
}

// erro sem redesenhar (o que a pessoa digitou continua lá)
function secShowError(msg) {
  let el = accountSecurityBox.querySelector('.sec-error');
  if (!el) {
    el = secEl('div', { class: 'field-error sec-error' });
    accountSecurityBox.append(el);
  }
  el.textContent = msg;
}

function renderAccountSecurity() {
  if (!accountSecurityBox) return;
  accountSecurityBox.textContent = '';
  if (!secState) {
    accountSecurityBox.append(secEl('p', { class: 'field-help', text: 'carregando…' }));
    return;
  }
  accountSecurityBox.append(renderEmailSection(), render2faSection(), ...renderDataSection());
  if (secError) accountSecurityBox.append(secEl('div', { class: 'field-error sec-error', text: secError }));
}
