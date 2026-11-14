// Compatibilidade com o nome antigo do projeto ("didiscord"). Carregado ANTES de tudo nas páginas.
//
// 1) localStorage: as preferências eram guardadas em "didiscord:*" (e "didiscord-tema:*"). Na
//    primeira carga copia cada uma pra chave nova ("dusky:*" / "dusky-tema:*") sem apagar a antiga
//    (se alguém voltar pra uma versão velha, nada some). Chave nova que já existe não é sobrescrita.
// 2) App desktop: o app Electron já instalado expõe window.didiscordDesktop; o novo (Tauri) expõe
//    os dois nomes. O site usa só window.duskyDesktop.
(function () {
  'use strict';
  try {
    const DONE = 'dusky:storageMigrated';
    if (!localStorage.getItem(DONE)) {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
      for (const key of keys) {
        const m = /^didiscord([:-].*)$/.exec(key || '');
        if (!m) continue;
        const fresh = 'dusky' + m[1];
        if (localStorage.getItem(fresh) === null) localStorage.setItem(fresh, localStorage.getItem(key));
      }
      localStorage.setItem(DONE, '1');
    }
  } catch (_) { /* sem localStorage (modo privado etc.): segue com o padrão */ }

  try {
    if (!window.duskyDesktop && window.didiscordDesktop) window.duskyDesktop = window.didiscordDesktop;
  } catch (_) { /* ok */ }
})();
