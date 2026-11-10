// tela de login/registro — alterna entre os dois modos no mesmo formulário. Se a pessoa chegou
// por um link de convite (/invite/CODIGO -> /login.html?invite=CODIGO), mostra pra qual servidor
// ela foi chamada, abre direto no modo "criar conta" e leva o convite junto depois de entrar.
(function () {
  const form = document.getElementById('authForm');
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const submitBtn = document.getElementById('submitBtn');
  const banner = document.getElementById('authBanner');
  const title = document.getElementById('formTitle');
  const tagline = document.getElementById('formTagline');
  const switchText = document.getElementById('switchText');
  const switchBtn = document.getElementById('switchBtn');
  const inviteBox = document.getElementById('authInvite');
  const inviteIcon = document.getElementById('authInviteIcon');
  const inviteLead = document.getElementById('authInviteLead');
  const inviteName = document.getElementById('authInviteName');

  const inviteCode = (new URLSearchParams(window.location.search).get('invite') || '').replace(/[^A-Za-z0-9]/g, '');
  const appUrl = inviteCode ? `/app.html?invite=${encodeURIComponent(inviteCode)}` : '/app.html';

  let mode = 'login'; // ou 'register'

  function applyMode() {
    if (mode === 'login') {
      title.textContent = inviteCode ? 'entre pra aceitar o convite' : 'bem-vindo de volta';
      tagline.textContent = inviteCode ? 'já tem conta? é só entrar' : 'entre para continuar';
      submitBtn.textContent = 'entrar';
      switchText.textContent = 'ainda não tem conta?';
      switchBtn.textContent = 'criar conta';
      passwordInput.autocomplete = 'current-password';
    } else {
      title.textContent = 'criar conta';
      tagline.textContent = inviteCode ? 'leva menos de um minuto, e você já entra no servidor' : 'escolha um nome e uma senha';
      submitBtn.textContent = 'criar conta';
      switchText.textContent = 'já tem conta?';
      switchBtn.textContent = 'entrar';
      passwordInput.autocomplete = 'new-password';
    }
    hideBanner();
  }

  function showBanner(msg) {
    banner.textContent = msg;
    banner.classList.add('show');
  }

  function hideBanner() {
    banner.classList.remove('show');
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

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
      inviteIcon.innerHTML = s.icon_url
        ? `<img src="${escapeHtml(s.icon_url)}" alt="">`
        : `<span>${escapeHtml(s.name.trim().slice(0, 2))}</span>`;
      inviteLead.textContent = invite.inviter ? `${invite.inviter} te convidou pra` : 'você foi convidado pra';
      inviteName.textContent = s.name;
      inviteBox.hidden = false;
    } catch (_) { /* sem prévia, segue normal */ }
  }

  switchBtn.addEventListener('click', () => {
    mode = mode === 'login' ? 'register' : 'login';
    applyMode();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideBanner();

    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    submitBtn.disabled = true;
    submitBtn.textContent = mode === 'login' ? 'entrando...' : 'criando...';

    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        showBanner(data.error || 'algo deu errado');
        submitBtn.disabled = false;
        applyMode(); // restaura o texto do botão
        return;
      }

      window.location.href = appUrl;
    } catch (err) {
      showBanner('não consegui falar com o servidor');
      submitBtn.disabled = false;
      applyMode();
    }
  });

  // se já tiver sessão válida, pula direto pro app (com o convite, se houver)
  fetch('/api/auth/me')
    .then((res) => (res.ok ? window.location.replace(appUrl) : null))
    .catch(() => {});

  // quem chega por convite quase sempre ainda não tem conta
  if (inviteCode) mode = 'register';
  applyMode();
  loadInvitePreview();
})();
