// dusky — FSR 1 (AMD FidelityFX Super Resolution) pra tela compartilhada, do lado de quem ASSISTE
//
// Quem compartilha pode mandar numa resolução menor (menos peso no codificador e na internet dele) e
// quem assiste aumenta e dá nitidez aqui, na placa de vídeo, com os dois passos do FSR 1:
//   EASU — aumenta a resolução reconstruindo as bordas (12 amostras, filtro tipo Lanczos que segue
//          a direção da borda);
//   RCAS — nitidez que se adapta ao contraste (não estoura branco/preto) e ajuda a disfarçar a
//          imagem lavada de bitrate baixo.
// Sem aumentar (a tela já chega no tamanho em que é mostrada), só o RCAS roda.
//
// É um port pra WebGL2 (GLSL ES 3.00) do ffx_fsr1.h original, versão de 32 bits. Diferenças do
// original: as amostras são lidas uma a uma com texelFetch (WebGL não tem textureGather) e as
// aproximações rápidas de 1/x e 1/√x viraram divisão e inversesqrt de verdade.
//
// Uso (window.DuskyFsr):
//   const fsr = DuskyFsr.create(canvas, glOptions)   // null se não tiver WebGL2 de verdade
//   fsr.draw(fonte, larguraFonte, alturaFonte, { upscale, sharpness, maxWidth, maxHeight })
//      fonte: <video>, <canvas> ou VideoFrame. O canvas vira do tamanho da saída.
//      sharpness: em "stops" do RCAS — 0 = máximo; cada 1 = metade da nitidez.
//   fsr.info   → { srcW, srcH, outW, outH, easu } do último quadro
//   fsr.destroy()
//
// ------------------------------------------------------------------------------------------------
// Partes deste arquivo são derivadas de AMD FidelityFX Super Resolution 1 (ffx_fsr1.h,
// https://github.com/GPUOpen-Effects/FidelityFX-FSR), sob a licença MIT:
//
// Copyright (c) 2021 Advanced Micro Devices, Inc. All rights reserved.
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files(the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and / or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions :
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.
// ------------------------------------------------------------------------------------------------
(function () {
  'use strict';

  // um triângulo que cobre a tela inteira (sem buffer de vértices)
  const VERT = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

  // EASU: escreve num quadro intermediário (linha 0 = topo da imagem, igual à textura de origem)
  const EASU = `#version 300 es
precision highp float;
precision highp int;
uniform highp sampler2D uSrc;
uniform vec4 uCon0;      // escala (entrada/saída) e deslocamento, como o FsrEasuCon
uniform ivec2 uSrcMax;   // último pixel da entrada
out vec4 outColor;

vec3 tap(ivec2 p) { return texelFetch(uSrc, clamp(p, ivec2(0), uSrcMax), 0).rgb; }
float luma2(vec3 c) { return c.b * 0.5 + (c.r * 0.5 + c.g); } // "luma vezes 2" do FSR

void easuSet(inout vec2 dir, inout float len, float w, float lA, float lB, float lC, float lD, float lE) {
  float dc = lD - lC;
  float cb = lC - lB;
  float lenX = max(abs(dc), abs(cb));
  float dirX = lD - lB;
  dir.x += dirX * w;
  lenX = clamp(abs(dirX) / max(lenX, 1.0 / 65536.0), 0.0, 1.0);
  lenX *= lenX;
  len += lenX * w;
  float ec = lE - lC;
  float ca = lC - lA;
  float lenY = max(abs(ec), abs(ca));
  float dirY = lE - lA;
  dir.y += dirY * w;
  lenY = clamp(abs(dirY) / max(lenY, 1.0 / 65536.0), 0.0, 1.0);
  lenY *= lenY;
  len += lenY * w;
}

void easuTap(inout vec3 aC, inout float aW, vec2 off, vec2 dir, vec2 len, float lob, float clp, vec3 c) {
  vec2 v = vec2(off.x * dir.x + off.y * dir.y, off.x * (-dir.y) + off.y * dir.x);
  v *= len;
  float d2 = min(dot(v, v), clp);
  float wB = (2.0 / 5.0) * d2 - 1.0;
  float wA = lob * d2 - 1.0;
  wB *= wB;
  wA *= wA;
  wB = (25.0 / 16.0) * wB - (25.0 / 16.0 - 1.0);
  float w = wB * wA;
  aC += c * w;
  aW += w;
}

void main() {
  ivec2 ip = ivec2(gl_FragCoord.xy);
  vec2 pp = vec2(ip) * uCon0.xy + uCon0.zw;
  vec2 fp = floor(pp);
  pp -= fp;
  ivec2 f0 = ivec2(fp);
  //    b c
  //  e f g h
  //  i j k l
  //    n o
  vec3 b = tap(f0 + ivec2(0, -1)), c = tap(f0 + ivec2(1, -1));
  vec3 e = tap(f0 + ivec2(-1, 0)), f = tap(f0), g = tap(f0 + ivec2(1, 0)), h = tap(f0 + ivec2(2, 0));
  vec3 i = tap(f0 + ivec2(-1, 1)), j = tap(f0 + ivec2(0, 1)), k = tap(f0 + ivec2(1, 1)), l = tap(f0 + ivec2(2, 1));
  vec3 n = tap(f0 + ivec2(0, 2)), o = tap(f0 + ivec2(1, 2));
  float bL = luma2(b), cL = luma2(c), eL = luma2(e), fL = luma2(f), gL = luma2(g), hL = luma2(h);
  float iL = luma2(i), jL = luma2(j), kL = luma2(k), lL = luma2(l), nL = luma2(n), oL = luma2(o);

  vec2 dir = vec2(0.0);
  float len = 0.0;
  easuSet(dir, len, (1.0 - pp.x) * (1.0 - pp.y), bL, eL, fL, gL, jL);
  easuSet(dir, len, pp.x * (1.0 - pp.y), cL, fL, gL, hL, kL);
  easuSet(dir, len, (1.0 - pp.x) * pp.y, fL, iL, jL, kL, nL);
  easuSet(dir, len, pp.x * pp.y, gL, jL, kL, lL, oL);

  vec2 dir2 = dir * dir;
  float dirR = dir2.x + dir2.y;
  bool zro = dirR < (1.0 / 32768.0);
  dirR = zro ? 1.0 : inversesqrt(dirR);
  dir.x = zro ? 1.0 : dir.x;
  dir *= dirR;
  len = len * 0.5;
  len *= len;
  float stretch = dot(dir, dir) / max(abs(dir.x), abs(dir.y));
  vec2 len2 = vec2(1.0 + (stretch - 1.0) * len, 1.0 - 0.5 * len);
  float lob = 0.5 + ((1.0 / 4.0 - 0.04) - 0.5) * len;
  float clp = 1.0 / lob;

  vec3 min4 = min(min(f, g), min(j, k));
  vec3 max4 = max(max(f, g), max(j, k));
  vec3 aC = vec3(0.0);
  float aW = 0.0;
  easuTap(aC, aW, vec2(0.0, -1.0) - pp, dir, len2, lob, clp, b);
  easuTap(aC, aW, vec2(1.0, -1.0) - pp, dir, len2, lob, clp, c);
  easuTap(aC, aW, vec2(-1.0, 1.0) - pp, dir, len2, lob, clp, i);
  easuTap(aC, aW, vec2(0.0, 1.0) - pp, dir, len2, lob, clp, j);
  easuTap(aC, aW, vec2(0.0, 0.0) - pp, dir, len2, lob, clp, f);
  easuTap(aC, aW, vec2(-1.0, 0.0) - pp, dir, len2, lob, clp, e);
  easuTap(aC, aW, vec2(1.0, 1.0) - pp, dir, len2, lob, clp, k);
  easuTap(aC, aW, vec2(2.0, 1.0) - pp, dir, len2, lob, clp, l);
  easuTap(aC, aW, vec2(2.0, 0.0) - pp, dir, len2, lob, clp, h);
  easuTap(aC, aW, vec2(1.0, 0.0) - pp, dir, len2, lob, clp, g);
  easuTap(aC, aW, vec2(1.0, 2.0) - pp, dir, len2, lob, clp, o);
  easuTap(aC, aW, vec2(0.0, 2.0) - pp, dir, len2, lob, clp, n);
  outColor = vec4(min(max4, max(min4, aC / aW)), 1.0);
}`;

  // RCAS: lê a entrada (já aumentada, ou a original) e escreve no canvas. O canvas tem a linha 0
  // embaixo (gl_FragCoord), a textura tem a linha 0 em cima: por isso o "uOutH - 1 - y".
  const RCAS = `#version 300 es
precision highp float;
precision highp int;
uniform highp sampler2D uSrc;
uniform ivec2 uSrcMax;
uniform int uOutH;
uniform float uSharp;    // 2^-stops (FsrRcasCon)
out vec4 outColor;

const float RCAS_LIMIT = 0.25 - (1.0 / 16.0);
vec3 ld(ivec2 p) { return texelFetch(uSrc, clamp(p, ivec2(0), uSrcMax), 0).rgb; }

void main() {
  ivec2 sp = ivec2(int(gl_FragCoord.x), uOutH - 1 - int(gl_FragCoord.y));
  //    b
  //  d e f
  //    h
  vec3 b = ld(sp + ivec2(0, -1));
  vec3 d = ld(sp + ivec2(-1, 0));
  vec3 e = ld(sp);
  vec3 f = ld(sp + ivec2(1, 0));
  vec3 h = ld(sp + ivec2(0, 1));
  vec3 mn4 = min(min(b, d), min(f, h));
  vec3 mx4 = max(max(b, d), max(f, h));
  vec3 hitMin = min(mn4, e) / max(4.0 * mx4, vec3(1.0 / 65536.0));
  vec3 hitMax = (1.0 - max(mx4, e)) / min(4.0 * mn4 - 4.0, vec3(-1.0 / 65536.0));
  vec3 lobeRGB = max(-hitMin, hitMax);
  float lobe = max(-RCAS_LIMIT, min(max(max(lobeRGB.r, lobeRGB.g), lobeRGB.b), 0.0)) * uSharp;
  outColor = vec4((lobe * (b + d + h + f) + e) / (4.0 * lobe + 1.0), 1.0);
}`;

  // sem FSR (desligado pelo meio do caminho no app do Linux): só copia, igual ao que era antes
  const COPY = `#version 300 es
precision highp float;
uniform highp sampler2D uSrc;
uniform int uOutH;
out vec4 outColor;
void main() {
  outColor = vec4(texelFetch(uSrc, ivec2(int(gl_FragCoord.x), uOutH - 1 - int(gl_FragCoord.y)), 0).rgb, 1.0);
}`;

  function compile(gl, vsSrc, fsSrc) {
    const mk = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, mk(gl.VERTEX_SHADER, vsSrc));
    gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fsSrc));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('programa: ' + gl.getProgramInfoLog(p));
    const u = {};
    for (const name of ['uSrc', 'uCon0', 'uSrcMax', 'uOutH', 'uSharp']) u[name] = gl.getUniformLocation(p, name);
    return { p, u };
  }

  function makeTexture(gl) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  // WebGL2 "de mentira" (desenhado no processador): aí o FSR pesaria mais do que ajuda
  function isSoftwareGl(gl) {
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = String((info && gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) || gl.getParameter(gl.RENDERER) || '');
    return /llvmpipe|softpipe|swiftshader|software/i.test(renderer);
  }

  function create(canvas, glOptions) {
    let gl = null;
    try {
      gl = canvas.getContext('webgl2', Object.assign({ alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false }, glOptions || {}));
    } catch (_) { gl = null; }
    if (!gl || isSoftwareGl(gl)) return null;
    let easu, rcas, copy;
    try {
      easu = compile(gl, VERT, EASU);
      rcas = compile(gl, VERT, RCAS);
      copy = compile(gl, VERT, COPY);
    } catch (err) {
      console.warn('[fsr] não deu pra montar os shaders:', err && err.message);
      return null;
    }
    const vao = gl.createVertexArray(); // o WebGL2 exige um, mesmo sem atributos
    const srcTex = makeTexture(gl);
    const midTex = makeTexture(gl);
    const fbo = gl.createFramebuffer();
    let midW = 0;
    let midH = 0;
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);

    const self = {
      gl,
      info: { srcW: 0, srcH: 0, outW: 0, outH: 0, easu: false },
      lost: false,
      // desenha um quadro. Devolve false se não deu (contexto perdido, fonte sem tamanho)
      draw(source, srcW, srcH, opts) {
        if (self.lost || gl.isContextLost()) { self.lost = true; return false; }
        if (!srcW || !srcH) return false;
        const o = opts || {};
        // tamanho da saída: o espaço onde a tela aparece, sem passar de 2x a entrada (o EASU foi
        // feito até 2x) nem do teto pedido; mantém a proporção da entrada
        let outW = srcW;
        let outH = srcH;
        if (o.upscale && o.maxWidth && o.maxHeight) {
          const k = Math.min(2, o.maxWidth / srcW, o.maxHeight / srcH);
          if (k > 1.05) { outW = Math.round(srcW * k); outH = Math.round(srcH * k); }
        }
        const useEasu = outW > srcW;
        if (canvas.width !== outW) canvas.width = outW;
        if (canvas.height !== outH) canvas.height = outH;

        gl.bindVertexArray(vao);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, srcTex);
        try {
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
        } catch (_) {
          return false; // vídeo ainda sem quadro, ou fonte que não dá pra subir
        }

        let input = srcTex;
        let inW = srcW;
        let inH = srcH;
        if (useEasu) {
          if (midW !== outW || midH !== outH) {
            gl.bindTexture(gl.TEXTURE_2D, midTex);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, outW, outH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
            gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, midTex, 0);
            midW = outW;
            midH = outH;
          }
          gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
          gl.viewport(0, 0, outW, outH);
          gl.useProgram(easu.p);
          gl.bindTexture(gl.TEXTURE_2D, srcTex);
          gl.uniform1i(easu.u.uSrc, 0);
          gl.uniform4f(easu.u.uCon0, srcW / outW, srcH / outH, 0.5 * srcW / outW - 0.5, 0.5 * srcH / outH - 0.5);
          gl.uniform2i(easu.u.uSrcMax, srcW - 1, srcH - 1);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          input = midTex;
          inW = outW;
          inH = outH;
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, outW, outH);
        gl.bindTexture(gl.TEXTURE_2D, input);
        if (o.sharpen === false && !useEasu) {
          gl.useProgram(copy.p);
          gl.uniform1i(copy.u.uSrc, 0);
          gl.uniform1i(copy.u.uOutH, outH);
        } else {
          gl.useProgram(rcas.p);
          gl.uniform1i(rcas.u.uSrc, 0);
          gl.uniform2i(rcas.u.uSrcMax, inW - 1, inH - 1);
          gl.uniform1i(rcas.u.uOutH, outH);
          gl.uniform1f(rcas.u.uSharp, o.sharpen === false ? 0 : Math.pow(2, -(Number(o.sharpness) || 0)));
        }
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        self.info = { srcW, srcH, outW, outH, easu: useEasu };
        return true;
      },
      destroy() {
        self.lost = true;
        try {
          gl.deleteTexture(srcTex);
          gl.deleteTexture(midTex);
          gl.deleteFramebuffer(fbo);
          for (const x of [easu, rcas, copy]) gl.deleteProgram(x.p);
          const ext = gl.getExtension('WEBGL_lose_context');
          if (ext) ext.loseContext(); // devolve a memória da placa na hora
        } catch (_) { /* já perdido */ }
      },
    };
    return self;
  }

  window.DuskyFsr = { create };
})();
