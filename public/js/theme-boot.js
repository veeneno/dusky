// aplica o tema guardado antes da página aparecer (fica num arquivo: a CSP não deixa script inline)
DuskyTheme.boot();

// app desktop no uso de memória "mínimo": sem desfoque atrás dos painéis (ver css/theme.css)
try {
  const info = window.duskyDesktop && window.duskyDesktop.appInfo;
  if (info && info.gpu && info.gpu.memoryMode === 'minimo') document.documentElement.setAttribute('data-low-memory', '');
} catch (_) { /* sem a ponte do app */ }
