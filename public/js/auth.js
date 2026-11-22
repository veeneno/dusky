// Tela de entrar/criar conta e o que vem junto:
//   - entrar com nick OU e-mail; criar conta pede e-mail (confirmado com um código);
//   - verificação em 2 etapas (app autenticador, código por e-mail ou código de recuperação);
//   - esqueci minha senha (código no e-mail -> senha nova);
//   - confirmar e-mail: conta nova, ou conta antiga que ainda não tem (o site manda pra cá com
//     ?etapa=email enquanto o e-mail não estiver confirmado — sem ele nada mais funciona).
// Se a pessoa chegou por um link de convite (/invite/CODIGO -> /login.html?invite=CODIGO), mostra
// pra qual servidor ela foi chamada, abre direto no modo "criar conta" e leva o convite junto.
(function () {
  const $ = (id) => document.getElementById(id);
  const form = $('authForm');
  const usernameInput = $('username');
  const emailField = $('emailField');
  const regEmail = $('regEmail');
  const passwordInput = $('password');
  const loginLabel = $('loginLabel');
  const submitBtn = $('submitBtn');
  const forgotLink = $('forgotLink');
  const banner = $('authBanner');
  const notice = $('authNotice');
  const title = $('formTitle');
  const tagline = $('formTagline');
  const switchBox = $('authSwitch');
  const switchText = $('switchText');
  const switchBtn = $('switchBtn');
  const inviteBox = $('authInvite');
  const inviteIcon = $('authInviteIcon');
  const inviteLead = $('authInviteLead');
  const inviteName = $('authInviteName');

  const params = new URLSearchParams(window.location.search);
  const inviteCode = (params.get('invite') || '').replace(/[^A-Za-z0-9]/g, '');
  const appUrl = inviteCode ? `/app.html?invite=${encodeURIComponent(inviteCode)}` : '/app.html';

  let mode = 'login'; // ou 'register'
  let twofa = null;   // { methods, emailHint, method }
  let resetLogin = '';
  let pendingEmail = '';
  const termsField = $('termsField');
  const acceptTerms = $('acceptTerms');
  const turnstileBox = $('turnstileBox');
  let config = { turnstileSiteKey: null };
  let turnstileWidget = null;
  let turnstileToken = null;

  // ---------- telas ----------

  function showPane(id) {
    for (const pane of document.querySelectorAll('.auth-pane')) pane.hidden = pane.id !== id;
    switchBox.hidden = id !== 'authForm';
    hideBanner();
    const first = $(id).querySelector('input:not([type=hidden])');
    if (first) setTimeout(() => first.focus(), 30);
  }

  function setHead(t, sub) {
    title.textContent = t;
    tagline.textContent = sub;
  }

  function applyMode() {
    const reg = mode === 'register';
    if (reg) {
      setHead('criar conta', inviteCode ? 'leva menos de um minuto, e você já entra no servidor' : 'escolha um nome, seu e-mail e uma senha');
      submitBtn.textContent = 'criar conta';
      switchText.textContent = 'já tem conta?';
      switchBtn.textContent = 'entrar';
      loginLabel.textContent = 'usuário';
      usernameInput.placeholder = 'seu nome de usuário';
      usernameInput.maxLength = 32;
      passwordInput.autocomplete = 'new-password';
      passwordInput.minLength = 8;
    } else {
      setHead(inviteCode ? 'entre pra aceitar o convite' : 'bem-vindo de volta', inviteCode ? 'já tem conta? é só entrar' : 'entre para continuar');
      submitBtn.textContent = 'entrar';
      switchText.textContent = 'ainda não tem conta?';
      switchBtn.textContent = 'criar conta';
      loginLabel.textContent = 'nick ou e-mail';
      usernameInput.placeholder = 'seu nick ou e-mail';
      usernameInput.maxLength = 254;
      passwordInput.autocomplete = 'current-password';
      passwordInput.removeAttribute('minlength');
    }
    emailField.hidden = !reg;
    regEmail.required = reg;
    termsField.hidden = !reg;
    acceptTerms.required = reg;
    forgotLink.hidden = reg;
    turnstileBox.hidden = !(reg && config.turnstileSiteKey);
    if (reg) startTurnstile();
    showPane('authForm');
  }

  // "não sou robô" do cadastro (Cloudflare Turnstile) — só quando o servidor tem as chaves
  function startTurnstile() {
    if (!config.turnstileSiteKey || turnstileWidget !== null) return;
    turnstileWidget = 'carregando';
    const render = () => {
      turnstileWidget = window.turnstile.render(turnstileBox, {
        sitekey: config.turnstileSiteKey,
        theme: 'dark',
        language: 'pt-br',
        callback: (t) => { turnstileToken = t; },
        'expired-callback': () => { turnstileToken = null; },
        'error-callback': () => { turnstileToken = null; },
      });
    };
    if (window.turnstile) { render(); return; }
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = render;
    s.onerror = () => { turnstileWidget = null; showBanner('não carregou a verificação anti-robô — confere a internet e recarrega a página'); };
    document.head.appendChild(s);
  }
  function resetTurnstile() {
    turnstileToken = null;
    if (window.turnstile && turnstileWidget && turnstileWidget !== 'carregando') window.turnstile.reset(turnstileWidget);
  }

  function showBanner(msg) {
    notice.classList.remove('show');
    banner.textContent = msg;
    banner.classList.add('show');
  }
  function hideBanner() {
    banner.classList.remove('show');
    notice.classList.remove('show');
  }
  function showNotice(msg) {
    banner.classList.remove('show');
    notice.textContent = msg;
    notice.classList.add('show');
  }

  // escapa também aspas (o jeito antigo, textContent → innerHTML, deixava " passar e um
  // texto podia fechar um atributo)
  function escapeHtml(str) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return String(str ?? '').replace(/[&<>"']/g, (c) => map[c]);
  }

  async function api(path, body) {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    let data = {};
    try { data = await res.json(); } catch (_) { /* sem corpo */ }
    return { ok: res.ok, status: res.status, data };
  }

  // botão "ocupado" enquanto o pedido vai
  async function busy(btn, label, fn) {
    const old = btn.textContent;
    btn.disabled = true;
    btn.textContent = label;
    try { return await fn(); } catch (_) {
      showBanner('não consegui falar com o servidor');
      return null;
    } finally {
      btn.disabled = false;
      btn.textContent = old;
    }
  }

  // depois de entrar: falta e-mail? -> confirmar; senão, pro app
  function afterLogin(data) {
    const user = data && data.user;
    if (data && (data.needsEmail || (user && user.needs_email))) {
      startEmailStep(user);
      return;
    }
    window.location.href = appUrl;
  }

  // ---------- entrar / criar conta ----------

  switchBtn.addEventListener('click', () => {
    mode = mode === 'login' ? 'register' : 'login';
    applyMode();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideBanner();
    if (mode === 'register' && config.turnstileSiteKey && !turnstileToken) {
      showBanner('espera a verificação anti-robô (logo acima do botão) terminar');
      return;
    }
    const body = mode === 'login'
      ? { login: usernameInput.value.trim(), password: passwordInput.value }
      : { username: usernameInput.value.trim(), email: regEmail.value.trim(), password: passwordInput.value, acceptTerms: acceptTerms.checked, turnstileToken };
    const r = await busy(submitBtn, mode === 'login' ? 'entrando...' : 'criando...', () => api(`/api/auth/${mode}`, body));
    if (!r) return;
    if (!r.ok) {
      if (mode === 'register') resetTurnstile();
      showBanner(r.data.error || 'algo deu errado');
      return;
    }
    if (r.data.twofa) { startTwofa(r.data.twofa); return; }
    afterLogin(r.data);
  });

  // ---------- 2 etapas ----------

  const twofaForm = $('twofaForm');
  const twofaCode = $('twofaCode');
  const twofaNote = $('twofaNote');
  const twofaLabel = $('twofaLabel');
  const twofaAlts = $('twofaAlts');

  function startTwofa(info) {
    twofa = { ...info, method: info.methods.includes('totp') ? 'totp' : 'email' };
    setHead('verificação em 2 etapas', 'só mais um passo');
    showPane('twofaForm');
    renderTwofa();
  }

  function renderTwofa() {
    const m = twofa.method;
    twofaCode.value = '';
    twofaCode.maxLength = m === 'recovery' ? 11 : 6;
    twofaCode.inputMode = m === 'recovery' ? 'text' : 'numeric';
    twofaCode.placeholder = m === 'recovery' ? 'ab12c-3de45' : '000000';
    twofaLabel.textContent = m === 'totp' ? 'código do app autenticador' : m === 'email' ? 'código do e-mail' : 'código de recuperação';
    twofaNote.textContent = m === 'totp'
      ? 'Abra o app autenticador (Google Authenticator, Authy, 2FAS…) e coloque o código do dusky.'
      : m === 'email'
        ? `Mandamos um código pra ${twofa.emailHint || 'o seu e-mail'}. Olhe também o spam.`
        : 'Use um dos códigos de recuperação que você guardou quando ligou o app. Cada um vale uma vez.';
    twofaAlts.textContent = '';
    const alt = (label, fn) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'auth-link';
      b.textContent = label;
      b.addEventListener('click', fn);
      twofaAlts.appendChild(b);
    };
    if (m !== 'email' && twofa.methods.includes('email')) alt('mandar código por e-mail', () => sendTwofaEmail(true));
    if (m === 'email') alt('mandar de novo', () => sendTwofaEmail(false));
    if (m !== 'totp' && twofa.methods.includes('totp')) alt('usar o app autenticador', () => { twofa.method = 'totp'; renderTwofa(); });
    if (m !== 'recovery' && twofa.methods.includes('totp')) alt('usar código de recuperação', () => { twofa.method = 'recovery'; renderTwofa(); });
    if (m === 'email' && twofa.codeSent === false) sendTwofaEmail(false);
    setTimeout(() => twofaCode.focus(), 30);
  }

  async function sendTwofaEmail(switchTo) {
    const r = await api('/api/auth/login/2fa/email');
    if (r.data && r.data.restart) { mode = 'login'; applyMode(); showBanner(r.data.error); return; }
    if (!r.ok) { showBanner(r.data.error || 'não deu pra mandar o código'); return; }
    if (switchTo) { twofa.method = 'email'; twofa.codeSent = true; renderTwofa(); }
    showNotice(`código mandado pra ${r.data.emailHint || 'o seu e-mail'}`);
  }

  twofaForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = twofaForm.querySelector('button[type=submit]');
    const r = await busy(btn, 'conferindo...', () => api('/api/auth/login/2fa', { method: twofa.method, code: twofaCode.value.trim() }));
    if (!r) return;
    if (r.data.restart) { mode = 'login'; applyMode(); showBanner(r.data.error); return; }
    if (!r.ok) { showBanner(r.data.error || 'código errado'); twofaCode.select(); return; }
    afterLogin(r.data);
  });

  // ---------- esqueci minha senha ----------

  const forgotForm = $('forgotForm');
  const resetForm = $('resetForm');
  const resetTotpField = $('resetTotpField');

  forgotLink.addEventListener('click', () => {
    $('forgotLogin').value = usernameInput.value.trim();
    setHead('esqueci minha senha', 'a gente te ajuda a criar outra');
    showPane('forgotForm');
  });

  forgotForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    resetLogin = $('forgotLogin').value.trim();
    const btn = forgotForm.querySelector('button[type=submit]');
    const r = await busy(btn, 'mandando...', () => api('/api/auth/forgot', { login: resetLogin }));
    if (!r) return;
    if (!r.ok) { showBanner(r.data.error || 'algo deu errado'); return; }
    resetTotpField.hidden = true;
    $('resetCode').value = '';
    $('resetPassword').value = '';
    setHead('crie uma senha nova', 'com o código que chegou no e-mail');
    showPane('resetForm');
    showNotice(r.data.message || 'se a conta tiver e-mail confirmado, o código chegou lá');
  });

  resetForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const totp = $('resetTotp').value.trim();
    const body = { login: resetLogin, code: $('resetCode').value.trim(), password: $('resetPassword').value };
    if (!resetTotpField.hidden && totp) {
      body.twofaCode = totp;
      body.twofaMethod = /[a-z-]/i.test(totp) ? 'recovery' : 'totp';
    }
    const btn = resetForm.querySelector('button[type=submit]');
    const r = await busy(btn, 'trocando...', () => api('/api/auth/reset', body));
    if (!r) return;
    if (!r.ok) {
      if (r.data.needTotp) { resetTotpField.hidden = false; $('resetTotp').focus(); }
      showBanner(r.data.error || 'não deu pra trocar a senha');
      return;
    }
    afterLogin(r.data);
  });

  // ---------- confirmar e-mail ----------

  const emailForm = $('emailForm');
  const emailCodeForm = $('emailCodeForm');

  function startEmailStep(user) {
    pendingEmail = (user && user.email_pending) || '';
    if (pendingEmail) {
      showEmailCode(pendingEmail);
    } else {
      setHead('adicione seu e-mail', user && user.username ? `oi, ${user.username}!` : 'falta só isso');
      $('emailInput').value = '';
      showPane('emailForm');
    }
  }

  function showEmailCode(email) {
    pendingEmail = email;
    setHead('confirme seu e-mail', 'é rapidinho');
    $('emailCodeNote').innerHTML = `Mandamos um código de 6 dígitos pra <strong>${escapeHtml(email)}</strong>. Olhe também o spam.`;
    $('emailCode').value = '';
    showPane('emailCodeForm');
  }

  emailForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('emailInput').value.trim();
    const btn = emailForm.querySelector('button[type=submit]');
    const r = await busy(btn, 'mandando...', () => api('/api/auth/email', { email }));
    if (!r) return;
    if (r.status === 401 && !r.data.error) { window.location.replace('/login.html'); return; }
    if (!r.ok) { showBanner(r.data.error || 'não deu pra mandar o código'); return; }
    showEmailCode(r.data.emailPending || email);
  });

  emailCodeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = emailCodeForm.querySelector('button[type=submit]');
    const r = await busy(btn, 'conferindo...', () => api('/api/auth/email/confirm', { code: $('emailCode').value.trim() }));
    if (!r) return;
    if (!r.ok) { showBanner(r.data.error || 'código errado'); $('emailCode').select(); return; }
    window.location.href = appUrl;
  });

  $('emailResend').addEventListener('click', async () => {
    const r = await api('/api/auth/email/resend');
    if (!r.ok) { showBanner(r.data.error || 'não deu pra mandar de novo'); return; }
    showNotice(`código mandado de novo pra ${pendingEmail}`);
  });

  $('emailChange').addEventListener('click', () => {
    setHead('adicione seu e-mail', 'qual e-mail usar?');
    $('emailInput').value = pendingEmail;
    showPane('emailForm');
  });

  for (const b of document.querySelectorAll('[data-logout]')) {
    b.addEventListener('click', async () => {
      await api('/api/auth/logout').catch(() => {});
      mode = 'login';
      applyMode();
    });
  }
  for (const b of document.querySelectorAll('[data-back]')) {
    b.addEventListener('click', () => { mode = 'login'; applyMode(); });
  }

  // ---------- convite ----------

  async function loadInvitePreview() {
    if (!inviteCode) return;
    try {
      const res = await fetch(`/api/invites/${encodeURIComponent(inviteCode)}`);
      if (!res.ok) {
        inviteLead.textContent = 'esse convite não funciona mais';
        inviteName.textContent = 'peça um link novo pra quem te chamou';
        inviteBox.classList.add('is-invalid');
        inviteBox.hidden = false;
        return;
      }
      const { invite } = await res.json();
      const s = invite.server;
      // URL do ícone pelo DOM, não dentro do HTML (vem do dono do servidor)
      inviteIcon.innerHTML = s.icon_url
        ? '<img alt="">'
        : `<span>${escapeHtml(s.name.trim().slice(0, 2))}</span>`;
      if (s.icon_url) inviteIcon.querySelector('img').src = s.icon_url;
      inviteLead.textContent = invite.inviter ? `${invite.inviter} te convidou pra` : 'você foi convidado pra';
      inviteName.textContent = s.name;
      inviteBox.hidden = false;
    } catch (_) { /* sem prévia, segue normal */ }
  }

  // ---------- começo ----------

  // quem chega por convite quase sempre ainda não tem conta
  if (inviteCode) mode = 'register';
  applyMode();
  loadInvitePreview();
  if (params.get('conta') === 'excluida') showNotice('sua conta foi excluída. Até mais!');
  fetch('/api/auth/config').then((r) => r.json()).then((c) => {
    config = c || config;
    if (mode === 'register' && !termsField.hidden) { turnstileBox.hidden = !config.turnstileSiteKey; startTurnstile(); }
  }).catch(() => {});

  // já tem sessão? sem e-mail confirmado: confirma aqui; com: direto pro app (com o convite)
  fetch('/api/auth/me')
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      if (!data || !data.user) return;
      if (data.user.needs_email) startEmailStep(data.user);
      else window.location.replace(appUrl);
    })
    .catch(() => {});
})();
