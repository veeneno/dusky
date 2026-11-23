// dusky — geração de quadros pra tela compartilhada, do lado de quem ASSISTE
//
// Quem compartilha manda, por exemplo, 30 quadros por segundo; aqui são inventados os quadros do
// meio (30 → 60, 90, 120), parecido com o "frame generation" do Lossless Scaling, só que feito do
// zero e rodando na placa de vídeo de quem assiste, em WebGL2 (funciona no Chrome/Edge, no app do
// Windows, que é Chromium, e no app do Linux, que é WebKitGTK e não tem WebGPU).
//
// Como cada quadro do meio é feito (tudo em shaders, sem passar pelo processador):
//   1. pirâmide de brilho: cada quadro que chega vira versões em tons de cinza cada vez menores
//      (1/2, 1/4, 1/8… do tamanho), feitas uma vez só por quadro;
//   2. estimativa de movimento "bilateral": pra cada bloquinho do quadro DO MEIO, procura o
//      deslocamento d que faz o pedaço do quadro anterior (em -d/2) bater com o do quadro novo
//      (em +d/2). Começa no tamanho menor, procurando em volta (pega movimentos grandes barato), e
//      vai refinando nos maiores, partindo do que achou no nível de cima e dos vizinhos, até
//      frações de pixel no último. Na dúvida (área lisa), segue o movimento de cima. Um
//      movimento GLOBAL (rolagem de texto, giro de câmera), achado comparando perfis de brilho
//      de linhas e colunas num alcance grande, entra como candidato em todos os níveis;
//   3. o quadro do meio, no tamanho original: cada pixel escolhe entre poucos vetores (o dos
//      blocos em volta, o zero e o global) o que faz os dois quadros baterem ali (num pedacinho em
//      cruz em volta dele, não num pixel só), puxa a cor do anterior em
//      -t·d e do novo em +(1-t)·d e mistura. É isso que deixa a interface parada (HUD, chat)
//      nítida por cima de um fundo que se mexe. Onde nada bate (algo que aparece ou some atrás de
//      outra coisa, movimento rápido demais pra busca), usa só o mais próximo no tempo, em vez de
//      misturar duas coisas diferentes (que dá "fantasma").
// O movimento é calculado uma vez por par de quadros e serve pra todos os quadros do meio dele
// (2x, 3x ou 4x). Os vetores ficam em texturas RGBA8 (16 bits por eixo), então não depende de
// extensão de textura de ponto flutuante, que o WebKitGTK nem sempre tem.
//
// Uso (window.DuskyFrameGen), pelo renderizador de public/js/screen-fsr.js:
//   const fg = DuskyFrameGen.create(gl)                 // null se não deu pra montar
//   fg.buildPyramid(slot, texturaDoQuadro, w, h)         // a cada quadro que chega (slot 0 ou 1)
//   fg.estimate(slotAnterior, slotNovo, w, h)            // uma vez por par
//   const tex = fg.interpolate(texAnterior, texNova, w, h, t)   // t entre 0 e 1
(function () {
  'use strict';

  const VERT = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;
  const HEAD = '#version 300 es\nprecision highp float;\nprecision highp int;\n';

  // vetor (em pixels do tamanho original, de -256 a +256, precisão de 1/128) guardado em RGBA8:
  // 16 bits por eixo, byte alto e byte baixo
  const VEC = `
vec2 decodeVec(vec4 c) {
  c = floor(c * 255.0 + 0.5);
  return vec2(c.r * 256.0 + c.g, c.b * 256.0 + c.a) / 128.0 - 256.0;
}
vec4 encodeVec(vec2 v) {
  vec2 q = clamp(floor((v + 256.0) * 128.0 + 0.5), 0.0, 65535.0);
  return vec4(floor(q.x / 256.0), mod(q.x, 256.0), floor(q.y / 256.0), mod(q.y, 256.0)) / 255.0;
}`;

  // brilho em meia resolução, a partir do quadro colorido (média de 2x2)
  const LUMA_FIRST = HEAD + `
uniform highp sampler2D uSrc;
uniform ivec2 uSrcMax;
out vec4 o;
vec3 f(ivec2 p) { return texelFetch(uSrc, clamp(p, ivec2(0), uSrcMax), 0).rgb; }
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy) * 2;
  vec3 c = (f(p) + f(p + ivec2(1, 0)) + f(p + ivec2(0, 1)) + f(p + ivec2(1, 1))) * 0.25;
  o = vec4(dot(c, vec3(0.299, 0.587, 0.114)), 0.0, 0.0, 1.0);
}`;

  // próximo nível da pirâmide: metade do anterior
  const LUMA_DOWN = HEAD + `
uniform highp sampler2D uSrc;
uniform ivec2 uSrcMax;
out vec4 o;
float f(ivec2 p) { return texelFetch(uSrc, clamp(p, ivec2(0), uSrcMax), 0).r; }
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy) * 2;
  o = vec4((f(p) + f(p + ivec2(1, 0)) + f(p + ivec2(0, 1)) + f(p + ivec2(1, 1))) * 0.25, 0.0, 0.0, 1.0);
}`;

  // movimento GLOBAL (rolagem, giro de câmera): perfis de brilho de cada quadro — média de cada
  // linha e de cada coluna, separada em faixas (BANDS) — comparados deslocando de -S a +S.
  // É barato (1D) e enxerga longe; vira um candidato a mais em todos os níveis da busca. As faixas
  // existem porque texto rolando tem linhas parecidas e igualmente espaçadas: a média da linha
  // inteira se repete e "rolou 40 px" fica igual a "rolou 6 px", mas o fim de cada linha muda
  const PROFILE = HEAD + `
uniform highp sampler2D uLuma;   // brilho em meia resolução
uniform ivec2 uLumaSize;
uniform int uBands;
uniform int uRows;               // 1 = média de cada linha (por faixa vertical); 0 = de cada coluna
out vec4 o;
void main() {
  ivec2 f = ivec2(gl_FragCoord.xy);
  float s = 0.0;
  float n = 0.0;
  if (uRows == 1) {
    // saída: x = faixa, y = linha
    int x0 = f.x * uLumaSize.x / uBands;
    int x1 = (f.x + 1) * uLumaSize.x / uBands;
    for (int x = x0; x < x1; x++) { s += texelFetch(uLuma, ivec2(x, f.y), 0).r; n += 1.0; }
  } else {
    // saída: x = coluna, y = faixa
    int y0 = f.y * uLumaSize.y / uBands;
    int y1 = (f.y + 1) * uLumaSize.y / uBands;
    for (int y = y0; y < y1; y++) { s += texelFetch(uLuma, ivec2(f.x, y), 0).r; n += 1.0; }
  }
  // média com 16 bits (dois bytes): diferenças pequenas entre perfis importam
  float v = floor(clamp(s / max(n, 1.0), 0.0, 1.0) * 65535.0 + 0.5);
  o = vec4(floor(v / 256.0), mod(v, 256.0), 0.0, 255.0) / 255.0;
}`;

  // custo de cada deslocamento: linha 0 = horizontal (perfis de coluna), linha 1 = vertical
  const SHIFT = HEAD + `
uniform highp sampler2D uColsPrev; uniform highp sampler2D uColsCur;  // (largura × faixas)
uniform highp sampler2D uRowsPrev; uniform highp sampler2D uRowsCur;  // (faixas × altura)
uniform ivec2 uLumaSize;
uniform int uBands;
uniform int uRange;
out vec4 o;
float val(highp sampler2D t, ivec2 p) { vec4 c = floor(texelFetch(t, p, 0) * 255.0 + 0.5); return (c.r * 256.0 + c.g) / 65535.0; }
void main() {
  ivec2 f = ivec2(gl_FragCoord.xy);
  int d = f.x - uRange;           // deslocamento do anterior pro novo, em pixels de meia resolução
  float s = 0.0;
  float n = 0.0;
  if (f.y == 0) {
    for (int b = 0; b < uBands; b++) {
      for (int x = max(0, -d); x < min(uLumaSize.x, uLumaSize.x - d); x++) {
        s += abs(val(uColsPrev, ivec2(x, b)) - val(uColsCur, ivec2(x + d, b))); n += 1.0;
      }
    }
  } else {
    for (int b = 0; b < uBands; b++) {
      for (int y = max(0, -d); y < min(uLumaSize.y, uLumaSize.y - d); y++) {
        s += abs(val(uRowsPrev, ivec2(b, y)) - val(uRowsCur, ivec2(b, y + d))); n += 1.0;
      }
    }
  }
  float c = floor(clamp(s / max(n, 1.0) * 8.0, 0.0, 1.0) * 65535.0 + 0.5);
  o = vec4(floor(c / 256.0), mod(c, 256.0), 0.0, 255.0) / 255.0;
}`;

  // o melhor deslocamento de cada eixo vira um vetor (em pixels do original) num texel só
  const PICK = HEAD + VEC + `
uniform highp sampler2D uCost;   // (2*uRange+1) × 2
uniform int uRange;
out vec4 o;
float cst(int i, int row) { vec4 c = floor(texelFetch(uCost, ivec2(i, row), 0) * 255.0 + 0.5); return c.r * 256.0 + c.g; }
void main() {
  vec2 best = vec2(0.0);
  for (int row = 0; row < 2; row++) {
    int bi = uRange;                // empate fica com o zero
    float bc = cst(uRange, row);
    for (int i = 0; i <= 2 * uRange; i++) {
      float c = cst(i, row) + float(abs(i - uRange)) * 0.5; // leve preferência por desloc. menor
      if (c < bc) { bc = c; bi = i; }
    }
    if (row == 0) best.x = float(bi - uRange); else best.y = float(bi - uRange);
  }
  o = encodeVec(best * 2.0);      // meia resolução → original
}`;

  // estimativa de movimento num nível da pirâmide (uma saída por pixel do nível)
  const MOTION = HEAD + VEC + `
uniform highp sampler2D uPrev;    // brilho do quadro anterior, neste nível (filtro linear)
uniform highp sampler2D uCur;     // brilho do quadro novo, neste nível
uniform highp sampler2D uParent;  // vetores do nível de cima (mais grosso)
uniform ivec2 uParentMax;
uniform int uMode;                // 0 = busca completa (nível mais grosso), 1 = refinar
uniform int uRadius;
uniform int uWin;                 // janela comparada: (2*uWin+1)²
uniform vec2 uSize;               // tamanho deste nível
uniform float uScale;             // pixels do original por pixel deste nível
uniform int uSubpixel;            // 1 = refinar frações de pixel (nível mais fino)
uniform highp sampler2D uGlobal;  // movimento global (1 texel)
out vec4 o;

float cost(vec2 q, vec2 d) {
  float s = 0.0;
  for (int y = -uWin; y <= uWin; y++) {
    for (int x = -uWin; x <= uWin; x++) {
      vec2 p = q + vec2(float(x), float(y));
      s += abs(texture(uPrev, (p - 0.5 * d) / uSize).r - texture(uCur, (p + 0.5 * d) / uSize).r);
    }
  }
  float n = float((2 * uWin + 1) * (2 * uWin + 1));
  return s / n;
}

void main() {
  vec2 q = gl_FragCoord.xy;
  vec2 best = vec2(0.0);
  float bestC = 1e9;
  if (uMode == 0) {
    // nível mais grosso: o movimento global primeiro (empate fica com ele), depois busca completa
    // em volta do zero
    vec2 g = decodeVec(texelFetch(uGlobal, ivec2(0), 0)) / uScale;
    best = g;
    bestC = cost(q, g);
    float c0 = cost(q, vec2(0.0));
    if (c0 < bestC) { bestC = c0; best = vec2(0.0); }
    for (int y = -uRadius; y <= uRadius; y++) {
      for (int x = -uRadius; x <= uRadius; x++) {
        if (x == 0 && y == 0) continue;
        vec2 d = vec2(float(x), float(y));
        float c = cost(q, d) + 0.002 * length(d);
        if (c < bestC) { bestC = c; best = d; }
      }
    }
  } else {
    // refinar: o vetor do nível de cima é testado primeiro e sem penalidade, então em área lisa
    // (onde qualquer vetor "bate") o movimento continua o mesmo dos vizinhos em vez de virar zero
    // e rasgar a imagem na borda. Os outros candidatos pagam uma penalidade pequena e limitada
    // por fugir dele: só ganham quando batem melhor de verdade (ex.: interface parada por cima
    // de um fundo que se mexe ganha com o zero)
    ivec2 pp = ivec2(q * 0.5);
    vec2 center = decodeVec(texelFetch(uParent, clamp(pp, ivec2(0), uParentMax), 0)) / uScale;
    best = center;
    bestC = cost(q, center);
    vec2 g = decodeVec(texelFetch(uGlobal, ivec2(0), 0)) / uScale;
    for (int i = 0; i < 7; i++) {
      ivec2 off = i == 1 ? ivec2(1, 0) : i == 2 ? ivec2(-1, 0) : i == 3 ? ivec2(0, 1) : i == 4 ? ivec2(0, -1) : ivec2(0);
      vec2 pv = i == 5 ? vec2(0.0) : i == 6 ? g : decodeVec(texelFetch(uParent, clamp(pp + off, ivec2(0), uParentMax), 0)) / uScale;
      int r = i == 0 ? uRadius : 0;   // em volta do vetor de cima; dos vizinhos, do zero e do global, só ele mesmo
      for (int y = -r; y <= r; y++) {
        for (int x = -r; x <= r; x++) {
          if (i == 0 && x == 0 && y == 0) continue;
          vec2 d = pv + vec2(float(x), float(y));
          float c = cost(q, d) + 0.01 * min(length(d - center), 8.0);
          if (c < bestC) { bestC = c; best = d; }
        }
      }
    }
    // no nível mais fino: acerta frações de pixel (meio, depois um quarto). Sem isso o vetor fica
    // em múltiplos de 4 pixels da imagem (o nível fino é 1/4 do tamanho) e a borda sai duplicada
    if (uSubpixel == 1) {
      for (int s = 0; s < 2; s++) {
        float step = s == 0 ? 0.5 : 0.25;
        vec2 base = best;
        for (int y = -1; y <= 1; y++) {
          for (int x = -1; x <= 1; x++) {
            if (x == 0 && y == 0) continue;
            vec2 d = base + vec2(float(x), float(y)) * step;
            float c = cost(q, d) + 0.01 * min(length(d - center), 8.0);
            if (c < bestC) { bestC = c; best = d; }
          }
        }
      }
    }
  }
  o = encodeVec(best * uScale);
}`;

  // o quadro do meio, no tamanho original
  const INTERP = HEAD + VEC + `
uniform highp sampler2D uPrevC;   // quadro anterior (cor, filtro linear)
uniform highp sampler2D uCurC;    // quadro novo
uniform highp sampler2D uVec;     // vetores (nível mais fino)
uniform highp sampler2D uGlobal;  // movimento global (1 texel)
uniform ivec2 uVecMax;
uniform vec2 uVecScale;           // pixels do campo de vetores por pixel do original
uniform vec2 uSize;               // tamanho do original
uniform float uT;                 // 0 = anterior, 1 = novo
out vec4 o;

vec2 vecTexel(ivec2 i) { return decodeVec(texelFetch(uVec, clamp(i, ivec2(0), uVecMax), 0)); }

void main() {
  vec2 p = gl_FragCoord.xy;
  // parado de verdade: o pixel é igual nos dois quadros, no mesmo lugar (com folga pro ruído da
  // compressão), E tem detalhe em volta (borda, letra). Aí fica como está: é interface, texto
  // fixo. Sem isso uma letra parada por cima de um fundo que se mexe ganha "cópias" de um vetor
  // errado. Em área lisa isso não vale: fundo igual nos dois quadros não quer dizer que nada passou
  // por ali no meio do caminho (texto rolando), então quem decide é o movimento
  vec3 s0 = texture(uPrevC, p / uSize).rgb;
  vec3 s1 = texture(uCurC, p / uSize).rgb;
  float lmin = dot(s0, vec3(0.299, 0.587, 0.114));
  float lmax = lmin;
  for (int j = 0; j < 4; j++) {
    vec2 o2 = j == 0 ? vec2(1.5, 0.0) : j == 1 ? vec2(-1.5, 0.0) : j == 2 ? vec2(0.0, 1.5) : vec2(0.0, -1.5);
    float l = dot(texture(uPrevC, (p + o2) / uSize).rgb, vec3(0.299, 0.587, 0.114));
    lmin = min(lmin, l);
    lmax = max(lmax, l);
  }
  if (length(s0 - s1) < 0.04 && lmax - lmin > 0.1) { o = vec4(mix(s0, s1, uT), 1.0); return; }
  // candidatos: o vetor interpolado dos 4 blocos em volta, cada um dos 4 sozinho e o zero. Cada
  // pixel fica com o que faz o anterior e o novo baterem melhor ali (com leve preferência pelo
  // interpolado). Assim uma letra parada de interface por cima de um fundo que se mexe escolhe o
  // zero e fica nítida, e o fundo em volta dela segue o movimento
  vec2 g = p * uVecScale - 0.5;
  vec2 fr = fract(g);
  ivec2 i = ivec2(floor(g));
  vec2 v00 = vecTexel(i);
  vec2 v10 = vecTexel(i + ivec2(1, 0));
  vec2 v01 = vecTexel(i + ivec2(0, 1));
  vec2 v11 = vecTexel(i + ivec2(1, 1));
  vec2 vb = mix(mix(v00, v10, fr.x), mix(v01, v11, fr.x), fr.y);
  vec2 vg = decodeVec(texelFetch(uGlobal, ivec2(0), 0));
  vec3 bestA = vec3(0.0);
  vec3 bestB = vec3(0.0);
  float bestE = 1e9;
  for (int k = 0; k < 7; k++) {
    vec2 v = k == 0 ? vb : k == 1 ? v00 : k == 2 ? v10 : k == 3 ? v01 : k == 4 ? v11 : k == 5 ? vec2(0.0) : vg;
    vec2 pa = p - uT * v;
    vec2 pb = p + (1.0 - uT) * v;
    vec3 a = texture(uPrevC, pa / uSize).rgb;
    vec3 b = texture(uCurC, pb / uSize).rgb;
    // compara um pedacinho em cruz, não só o pixel: num texto branco, um vetor errado que cai em
    // letra branca nos dois quadros "bateria" e criaria letra onde não tem
    float e = length(a - b);
    for (int j = 0; j < 4; j++) {
      vec2 o2 = j == 0 ? vec2(1.5, 0.0) : j == 1 ? vec2(-1.5, 0.0) : j == 2 ? vec2(0.0, 1.5) : vec2(0.0, -1.5);
      e += length(texture(uPrevC, (pa + o2) / uSize).rgb - texture(uCurC, (pb + o2) / uSize).rgb);
    }
    e = e / 5.0 + (k == 0 ? 0.0 : 0.02);
    if (e < bestE) { bestE = e; bestA = a; bestB = b; }
  }
  vec3 m = mix(bestA, bestB, uT);
  // nem o melhor bate: em vez de misturar duas coisas diferentes (fantasma), fica com o mais perto
  float w = smoothstep(0.15, 0.4, bestE);
  o = vec4(mix(m, uT < 0.5 ? bestA : bestB, w), 1.0);
}`;

  function compile(gl, fs, uniforms) {
    const mk = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, mk(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('programa: ' + gl.getProgramInfoLog(p));
    const u = {};
    for (const name of uniforms) u[name] = gl.getUniformLocation(p, name);
    return { p, u };
  }

  // textura + framebuffer de um tamanho (refeitos só quando o tamanho muda)
  function makeTarget(gl, internal, format, w, h, linear) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, linear ? gl.LINEAR : gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, linear ? gl.LINEAR : gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, gl.UNSIGNED_BYTE, null);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    return { tex, fbo, w, h, ok };
  }
  function freeTarget(gl, t) {
    if (!t) return;
    gl.deleteTexture(t.tex);
    gl.deleteFramebuffer(t.fbo);
  }

  // níveis da pirâmide pra um quadro W×H: o campo de vetores final fica no nível "fino" (até ~512
  // de largura, pra caber no orçamento até em 4K) e a busca completa no "grosso" (até ~64 de
  // largura). Com raio 6 no grosso, pega movimento de até ~6×2^nível pixels por quadro, mais o
  // que os refinamentos somam (1080p: ~192 + 56 px por quadro), além do movimento global.
  function levelsFor(W) {
    let fine = 1;
    while (Math.ceil(W / 2 ** fine) > 512) fine++;
    let coarse = fine + 1;
    while (Math.ceil(W / 2 ** coarse) > 64) coarse++;
    return { fine, coarse };
  }

  function create(gl) {
    let progs;
    try {
      progs = {
        first: compile(gl, LUMA_FIRST, ['uSrc', 'uSrcMax']),
        down: compile(gl, LUMA_DOWN, ['uSrc', 'uSrcMax']),
        motion: compile(gl, MOTION, ['uPrev', 'uCur', 'uParent', 'uParentMax', 'uMode', 'uRadius', 'uWin', 'uSize', 'uScale', 'uSubpixel', 'uGlobal']),
        profile: compile(gl, PROFILE, ['uLuma', 'uLumaSize', 'uBands', 'uRows']),
        shift: compile(gl, SHIFT, ['uColsPrev', 'uColsCur', 'uRowsPrev', 'uRowsCur', 'uLumaSize', 'uBands', 'uRange']),
        pick: compile(gl, PICK, ['uCost', 'uRange']),
        interp: compile(gl, INTERP, ['uPrevC', 'uCurC', 'uVec', 'uVecMax', 'uVecScale', 'uSize', 'uT', 'uGlobal']),
      };
    } catch (err) {
      console.warn('[geração de quadros] não deu pra montar os shaders:', err && err.message);
      return null;
    }
    const vao = gl.createVertexArray();
    const pyramids = [null, null]; // por slot: { W, H, levels: [null, nível1, nível2…] }
    let fields = null;             // { W, H, levels: [...] } — vetores por nível
    let out = null;                // quadro do meio
    let glob = null;               // texturas do movimento global (perfis, custos, resultado)
    let destroyed = false;
    const BANDS = 8;

    const pass = (prog, target) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
      gl.viewport(0, 0, target.w, target.h);
      gl.useProgram(prog.p);
    };
    const bindTex = (unit, tex, loc) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(loc, unit);
    };
    const levelSize = (W, H, k) => [Math.max(1, Math.ceil(W / 2 ** k)), Math.max(1, Math.ceil(H / 2 ** k))];

    function ensurePyramid(slot, W, H) {
      const cur = pyramids[slot];
      if (cur && cur.W === W && cur.H === H) return cur;
      if (cur) for (const l of cur.levels) freeTarget(gl, l);
      const { coarse } = levelsFor(W);
      const levels = [null];
      for (let k = 1; k <= coarse; k++) {
        const [w, h] = levelSize(W, H, k);
        levels.push(makeTarget(gl, gl.R8, gl.RED, w, h, true));
      }
      pyramids[slot] = { W, H, levels };
      return pyramids[slot];
    }

    function ensureFields(W, H) {
      if (fields && fields.W === W && fields.H === H) return fields;
      if (fields) for (const l of fields.levels) freeTarget(gl, l);
      const { fine, coarse } = levelsFor(W);
      const levels = [];
      for (let k = 0; k <= coarse; k++) {
        if (k < fine) { levels.push(null); continue; }
        const [w, h] = levelSize(W, H, k);
        levels.push(makeTarget(gl, gl.RGBA8, gl.RGBA, w, h, false));
      }
      fields = { W, H, fine, coarse, levels };
      return fields;
    }

    function ensureGlobal(W, H) {
      if (glob && glob.W === W && glob.H === H) return glob;
      if (glob) for (const t of glob.all) freeTarget(gl, t);
      const [w1, h1] = levelSize(W, H, 1);
      // alcance: até 1/3 da imagem e no máximo 128 px de meia resolução (256 px do original) por quadro
      const range = Math.max(4, Math.min(128, Math.floor(Math.min(w1, h1) / 3)));
      const mk = (w, h) => makeTarget(gl, gl.RGBA8, gl.RGBA, w, h, false);
      const g = {
        W, H, w1, h1, range,
        rows: [mk(BANDS, h1), mk(BANDS, h1)], cols: [mk(w1, BANDS), mk(w1, BANDS)],
        cost: mk(2 * range + 1, 2), result: mk(1, 1),
      };
      g.all = [...g.rows, ...g.cols, g.cost, g.result];
      glob = g;
      return g;
    }

    // movimento global entre os dois quadros (vai pra glob.result)
    function estimateGlobal(a, b, W, H) {
      const g = ensureGlobal(W, H);
      const pr = progs.profile;
      [a, b].forEach((pyr, i) => {
        for (const rows of [1, 0]) {
          const target = rows ? g.rows[i] : g.cols[i];
          pass(pr, target);
          bindTex(0, pyr.levels[1].tex, pr.u.uLuma);
          gl.uniform2i(pr.u.uLumaSize, g.w1, g.h1);
          gl.uniform1i(pr.u.uBands, BANDS);
          gl.uniform1i(pr.u.uRows, rows);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
        }
      });
      const sh = progs.shift;
      pass(sh, g.cost);
      bindTex(0, g.cols[0].tex, sh.u.uColsPrev);
      bindTex(1, g.cols[1].tex, sh.u.uColsCur);
      bindTex(2, g.rows[0].tex, sh.u.uRowsPrev);
      bindTex(3, g.rows[1].tex, sh.u.uRowsCur);
      gl.uniform2i(sh.u.uLumaSize, g.w1, g.h1);
      gl.uniform1i(sh.u.uBands, BANDS);
      gl.uniform1i(sh.u.uRange, g.range);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      const pk = progs.pick;
      pass(pk, g.result);
      bindTex(0, g.cost.tex, pk.u.uCost);
      gl.uniform1i(pk.u.uRange, g.range);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      return g.result;
    }

    function ensureOut(W, H) {
      if (out && out.w === W && out.h === H) return out;
      freeTarget(gl, out);
      out = makeTarget(gl, gl.RGBA8, gl.RGBA, W, H, false);
      return out;
    }

    const self = {
      // a cada quadro que chega: monta a pirâmide de brilho dele (no slot do quadro)
      buildPyramid(slot, srcTex, W, H) {
        if (destroyed) return false;
        const pyr = ensurePyramid(slot, W, H);
        gl.bindVertexArray(vao);
        for (let k = 1; k < pyr.levels.length; k++) {
          const target = pyr.levels[k];
          if (k === 1) {
            pass(progs.first, target);
            bindTex(0, srcTex, progs.first.u.uSrc);
            gl.uniform2i(progs.first.u.uSrcMax, W - 1, H - 1);
          } else {
            const src = pyr.levels[k - 1];
            pass(progs.down, target);
            bindTex(0, src.tex, progs.down.u.uSrc);
            gl.uniform2i(progs.down.u.uSrcMax, src.w - 1, src.h - 1);
          }
          gl.drawArrays(gl.TRIANGLES, 0, 3);
        }
        return pyr.levels.every((l) => !l || l.ok);
      },

      // movimento entre o quadro anterior e o novo, do nível grosso pro fino
      estimate(prevSlot, curSlot, W, H) {
        if (destroyed) return false;
        const a = pyramids[prevSlot];
        const b = pyramids[curSlot];
        if (!a || !b || a.W !== W || b.W !== W || a.H !== H || b.H !== H) return false;
        const f = ensureFields(W, H);
        gl.bindVertexArray(vao);
        const global = estimateGlobal(a, b, W, H);
        const m = progs.motion;
        for (let k = f.coarse; k >= f.fine; k--) {
          const target = f.levels[k];
          pass(m, target);
          bindTex(0, a.levels[k].tex, m.u.uPrev);
          bindTex(1, b.levels[k].tex, m.u.uCur);
          // no nível grosso não existe "pai" (a busca é completa) e o shader não o lê; mesmo assim
          // algo precisa estar ligado ali, e não pode ser a própria textura de saída (o WebGL
          // recusa ler e escrever a mesma textura): vai o brilho do quadro anterior, à toa
          const parent = k < f.coarse ? f.levels[k + 1] : a.levels[k];
          bindTex(2, parent.tex, m.u.uParent);
          gl.uniform2i(m.u.uParentMax, Math.max(0, parent.w - 1), Math.max(0, parent.h - 1));
          gl.uniform1i(m.u.uMode, k === f.coarse ? 0 : 1);
          gl.uniform1i(m.u.uRadius, k === f.coarse ? 6 : 1);
          gl.uniform1i(m.u.uWin, k === f.fine ? 1 : 2); // no fino a janela é menor (é o nível mais caro)
          gl.uniform2f(m.u.uSize, target.w, target.h);
          gl.uniform1f(m.u.uScale, 2 ** k);
          gl.uniform1i(m.u.uSubpixel, k === f.fine ? 1 : 0);
          bindTex(3, global.tex, m.u.uGlobal);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
        }
        return true;
      },

      // o quadro do meio em t (0 = anterior, 1 = novo); devolve a textura dele
      interpolate(prevTex, curTex, W, H, t) {
        if (destroyed || !fields) return null;
        const target = ensureOut(W, H);
        const vec = fields.levels[fields.fine];
        const p = progs.interp;
        gl.bindVertexArray(vao);
        pass(p, target);
        bindTex(0, prevTex, p.u.uPrevC);
        bindTex(1, curTex, p.u.uCurC);
        bindTex(2, vec.tex, p.u.uVec);
        bindTex(3, glob.result.tex, p.u.uGlobal);
        gl.uniform2i(p.u.uVecMax, vec.w - 1, vec.h - 1);
        gl.uniform2f(p.u.uVecScale, vec.w / W, vec.h / H);
        gl.uniform2f(p.u.uSize, W, H);
        gl.uniform1f(p.u.uT, t);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.activeTexture(gl.TEXTURE0);
        return target.tex;
      },

      destroy() {
        destroyed = true;
        try {
          for (const pyr of pyramids) if (pyr) for (const l of pyr.levels) freeTarget(gl, l);
          if (fields) for (const l of fields.levels) freeTarget(gl, l);
          if (glob) for (const t of glob.all) freeTarget(gl, t);
          freeTarget(gl, out);
          for (const x of Object.values(progs)) gl.deleteProgram(x.p);
          gl.deleteVertexArray(vao);
        } catch (_) { /* contexto já perdido */ }
      },
    };
    return self;
  }

  window.DuskyFrameGen = { create };
})();
