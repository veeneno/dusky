// Markdown do chat, no estilo do Discord. Monta os elementos direto (createElement/textNode) — nunca
// usa innerHTML com o texto da mensagem, então não tem como alguém injetar HTML pelo chat.
//
// Blocos:  # título · ## título · ### título · -# texto pequeno · > citação · >>> citação até o fim
//          - lista / * lista / 1. lista numerada (2 espaços = um nível a mais) · ```bloco de código```
// No meio do texto: **negrito** · *itálico* ou _itálico_ · __sublinhado__ · ~~riscado~~ · `código`
//          ||spoiler|| · [texto](https://link) · links soltos · <https://link> (sem prévia)
//          <@id> menção · @everyone / @here · \* escapa qualquer símbolo
//
// window.DuskyMarkdown.render(texto, ctx) -> DocumentFragment
//   ctx.resolveUser(id) -> { username } | null     ctx.meId     ctx.onMention(id, el)
// window.DuskyMarkdown.plain(texto, ctx) -> string  (pra notificação, resposta, prévia)
// window.DuskyMarkdown.links(texto) -> [url]          (links que ganham prévia)
(function () {
  'use strict';

  const ESCAPABLE = /[\\`*_~|<>#\-[\]()>@:.!]/;
  const URL_RE = /^https?:\/\/[^\s<>"']+/i;
  const MAX_DEPTH = 12;

  function el(tag, cls, children) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (children) for (const c of children) n.append(c);
    return n;
  }

  // tira pontuação do fim do link ("veja https://x.com." -> sem o ponto), mas mantém um ")" que
  // fecha um "(" do próprio link (ex: wikipedia)
  function trimUrl(url) {
    while (/[.,;:!?)\]}'"]$/.test(url)) {
      if (url.endsWith(')') && (url.match(/\(/g) || []).length >= (url.match(/\)/g) || []).length) break;
      url = url.slice(0, -1);
    }
    return url;
  }

  function safeHref(url) {
    try {
      const u = new URL(url);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
      if (!u.hostname.includes('.') && u.hostname !== 'localhost') return null;
      return u.href;
    } catch (_) { return null; }
  }

  function linkEl(href, label) {
    const a = el('a', 'msg-link');
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = label;
    return a;
  }

  const isWordChar = (c) => !!c && /[\p{L}\p{N}_]/u.test(c);

  // procura o fechamento de um delimitador a partir de `from` (ignorando o que estiver escapado)
  function findClose(text, delim, from) {
    let i = from;
    while (i < text.length) {
      if (text[i] === '\\') { i += 2; continue; }
      if (text[i] === '`') { // pula código inline inteiro: delimitador dentro de `código` não conta
        const run = text.slice(i).match(/^`+/)[0];
        const end = text.indexOf(run, i + run.length);
        if (end !== -1) { i = end + run.length; continue; }
      }
      if (text.startsWith(delim, i)) return i;
      i++;
    }
    return -1;
  }

  // ------------------------------------------------------------------ no meio do texto

  function inline(text, ctx, depth) {
    const out = [];
    let buf = '';
    const flush = () => { if (buf) { out.push(document.createTextNode(buf)); buf = ''; } };
    if (depth > MAX_DEPTH) return [document.createTextNode(text)];

    let i = 0;
    while (i < text.length) {
      const c = text[i];
      const rest = text.slice(i);

      if (c === '\\' && i + 1 < text.length && ESCAPABLE.test(text[i + 1])) { buf += text[i + 1]; i += 2; continue; }

      if (c === '`') {
        const run = rest.match(/^`+/)[0];
        const end = text.indexOf(run, i + run.length);
        if (end !== -1 && end > i + run.length) {
          flush();
          let code = text.slice(i + run.length, end);
          if (run.length === 3 && code.includes('\n')) { // ```bloco``` no meio da linha
            const lm = code.match(/^([\w+#.-]{1,20})\n/);
            out.push(codeBlock(lm ? code.slice(lm[0].length) : code, lm ? lm[1] : ''));
            i = end + 3;
            continue;
          }
          if (run.length > 1 && code.startsWith(' ') && code.endsWith(' ') && code.trim()) code = code.slice(1, -1);
          out.push(el('code', 'md-code', [code]));
          i = end + run.length;
          continue;
        }
        buf += run; i += run.length; continue;
      }

      // pares: ||spoiler|| **negrito** __sublinhado__ ~~riscado~~
      const pair = ['||', '**', '__', '~~'].find((d) => rest.startsWith(d));
      if (pair) {
        const end = findClose(text, pair, i + 2);
        if (end > i + 2) {
          flush();
          const inner = inline(text.slice(i + 2, end), ctx, depth + 1);
          if (pair === '||') {
            const sp = el('span', 'md-spoiler', inner);
            sp.tabIndex = 0;
            sp.setAttribute('role', 'button');
            sp.title = 'spoiler — clique pra ver';
            const reveal = (e) => { e.stopPropagation(); sp.classList.add('is-revealed'); sp.removeAttribute('title'); };
            sp.addEventListener('click', reveal);
            sp.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') reveal(e); });
            out.push(sp);
          } else {
            out.push(el(pair === '**' ? 'strong' : pair === '__' ? 'u' : 's', null, inner));
          }
          i = end + 2;
          continue;
        }
      }

      // *itálico* e _itálico_ (o _ só vale fora de palavra, senão nome_de_arquivo virava itálico)
      if ((c === '*' || c === '_') && text[i + 1] !== c && text[i + 1] && !/\s/.test(text[i + 1])) {
        const okStart = c === '*' || !isWordChar(text[i - 1]);
        let end = okStart ? findClose(text, c, i + 1) : -1;
        while (end !== -1 && (text[end + 1] === c || /\s/.test(text[end - 1]) || (c === '_' && isWordChar(text[end + 1])))) {
          end = findClose(text, c, end + 1);
        }
        if (end > i + 1) {
          flush();
          out.push(el('em', null, inline(text.slice(i + 1, end), ctx, depth + 1)));
          i = end + 1;
          continue;
        }
      }

      if (c === '[') {
        const m = rest.match(/^\[([^\]\n]{1,300})\]\(<?(https?:\/\/[^\s)>]+)>?\)/i);
        const href = m && safeHref(m[2]);
        if (href) {
          flush();
          const a = linkEl(href, '');
          a.append(...inline(m[1], ctx, depth + 1));
          a.title = href;
          out.push(a);
          i += m[0].length;
          continue;
        }
      }

      if (c === '<') {
        const mention = rest.match(/^<@(\d{1,10})>/);
        if (mention) {
          flush();
          out.push(mentionEl(Number(mention[1]), ctx));
          i += mention[0].length;
          continue;
        }
        const quiet = rest.match(/^<(https?:\/\/[^\s>]+)>/i);
        const href = quiet && safeHref(quiet[1]);
        if (href) { flush(); out.push(linkEl(href, quiet[1])); i += quiet[0].length; continue; }
      }

      if ((c === 'h' || c === 'H') && !isWordChar(text[i - 1])) {
        const m = rest.match(URL_RE);
        if (m) {
          const url = trimUrl(m[0]);
          const href = safeHref(url);
          if (href) { flush(); out.push(linkEl(href, url)); i += url.length; continue; }
        }
      }

      if (c === '@' && !isWordChar(text[i - 1])) {
        const m = rest.match(/^@(everyone|here)\b/);
        if (m) {
          flush();
          const chip = el('span', 'md-mention is-everyone', ['@' + m[1]]);
          out.push(chip);
          i += m[0].length;
          continue;
        }
      }

      buf += c;
      i++;
    }
    flush();
    return out;
  }

  function mentionEl(id, ctx) {
    const u = ctx && ctx.resolveUser ? ctx.resolveUser(id) : null;
    const chip = el('span', 'md-mention' + (ctx && ctx.meId === id ? ' is-me' : ''), ['@' + (u ? u.username : 'alguém')]);
    if (u && ctx.onMention) {
      chip.classList.add('is-clickable');
      chip.addEventListener('click', (e) => { e.stopPropagation(); ctx.onMention(id, chip); });
    }
    return chip;
  }

  // ------------------------------------------------------------------ blocos

  const LIST_RE = /^(\s*)([-*]|\d{1,3}[.)])\s+(.*)$/;

  function blocks(lines, ctx, depth, out) {
    let para = [];
    const flushPara = () => {
      if (!para.length) return;
      // linhas em branco nas pontas não viram espaço vazio
      while (para.length && !para[0].trim()) para.shift();
      while (para.length && !para[para.length - 1].trim()) para.pop();
      if (para.length) out.append(el('div', 'md-p', inline(para.join('\n'), ctx, depth)));
      para = [];
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // ```bloco de código```
      const fence = line.match(/^\s*```([\w+#.-]{0,20})\s*(.*)$/);
      if (fence) {
        const sameLineEnd = fence[2].indexOf('```');
        let code; let lang = fence[1]; let consumed = i;
        if (sameLineEnd !== -1) {
          code = fence[2].slice(0, sameLineEnd);
        } else {
          const body = fence[2] ? [fence[2]] : [];
          let j = i + 1;
          for (; j < lines.length; j++) {
            const close = lines[j].indexOf('```');
            if (close !== -1) { if (close > 0) body.push(lines[j].slice(0, close)); break; }
            body.push(lines[j]);
          }
          if (j >= lines.length) { para.push(line); continue; } // sem fechar: fica texto normal
          code = body.join('\n');
          consumed = j;
          if (!fence[2] && !lang) lang = '';
        }
        flushPara();
        out.append(codeBlock(code, lang));
        i = consumed;
        continue;
      }

      // >>> citação até o fim da mensagem
      const bigQuote = line.match(/^>>>\s?(.*)$/);
      if (bigQuote && depth < MAX_DEPTH) {
        flushPara();
        const q = el('blockquote', 'md-quote');
        blocks([bigQuote[1], ...lines.slice(i + 1)], ctx, depth + 1, q);
        out.append(q);
        break;
      }

      // > citação (linhas seguidas)
      if (/^>\s/.test(line) || line === '>') {
        flushPara();
        const quoted = [];
        while (i < lines.length && (/^>\s/.test(lines[i]) || lines[i] === '>')) { quoted.push(lines[i].replace(/^>\s?/, '')); i++; }
        i--;
        const q = el('blockquote', 'md-quote');
        if (depth < MAX_DEPTH) blocks(quoted, ctx, depth + 1, q);
        out.append(q);
        continue;
      }

      // # títulos e -# texto pequeno
      const head = line.match(/^(#{1,3}|-#)\s+(.+)$/);
      if (head) {
        flushPara();
        const tag = head[1] === '-#' ? 'div' : `h${head[1].length}`;
        const cls = head[1] === '-#' ? 'md-subtext' : `md-h${head[1].length}`;
        out.append(el(tag, cls, inline(head[2], ctx, depth)));
        continue;
      }

      // listas
      if (LIST_RE.test(line)) {
        flushPara();
        const items = [];
        let firstOrdered = null;
        while (i < lines.length && LIST_RE.test(lines[i])) {
          const m = lines[i].match(LIST_RE);
          const ordered = /\d/.test(m[2]);
          const topLevel = m[1].replace(/\t/g, '  ').length < 2;
          if (topLevel && firstOrdered !== null && ordered !== firstOrdered) break; // trocou de - pra 1. : outra lista
          if (topLevel && firstOrdered === null) firstOrdered = ordered;
          items.push({ level: Math.min(Math.floor(m[1].replace(/\t/g, '  ').length / 2), 4), ordered: /\d/.test(m[2]), start: parseInt(m[2], 10), text: m[3] });
          i++;
        }
        i--;
        out.append(buildList(items, ctx, depth));
        continue;
      }

      para.push(line);
    }
    flushPara();
    return out;
  }

  function buildList(items, ctx, depth) {
    const root = { children: [], level: -1 };
    const stack = [root];
    for (const it of items) {
      while (stack.length > 1 && stack[stack.length - 1].level >= it.level) stack.pop();
      const node = { ...it, children: [] };
      stack[stack.length - 1].children.push(node);
      stack.push(node);
    }
    const make = (nodes) => {
      const ordered = nodes[0] && nodes[0].ordered;
      const list = el(ordered ? 'ol' : 'ul', 'md-list');
      if (ordered && nodes[0].start > 1) list.start = nodes[0].start;
      for (const n of nodes) {
        const li = el('li', null, inline(n.text, ctx, depth));
        if (n.children.length) li.append(make(n.children));
        list.append(li);
      }
      return list;
    };
    return make(root.children);
  }

  function codeBlock(code, lang) {
    const pre = el('pre', 'md-codeblock');
    const c = el('code', null, [code.replace(/^\n+|\n+$/g, '')]);
    if (lang) pre.dataset.lang = lang;
    const copy = el('button', 'md-copy', ['copiar']);
    copy.type = 'button';
    copy.addEventListener('click', (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(c.textContent).then(() => {
        copy.textContent = 'copiado!';
        setTimeout(() => { copy.textContent = 'copiar'; }, 1500);
      }).catch(() => {});
    });
    pre.append(c, copy);
    return pre;
  }

  // ------------------------------------------------------------------ API

  // mensagem só com emojis (até 27): mostra grandão, igual o Discord
  const EMOJI_ONLY_RE = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|[#*0-9]️?⃣|[‍️\u{1F3FB}-\u{1F3FF}\u{E0020}-\u{E007F}]|\s)+$/u;
  function isEmojiOnly(text) {
    const t = (text || '').trim();
    if (!t || !EMOJI_ONLY_RE.test(t) || /^[\d#*\s]+$/.test(t)) return false;
    const count = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(t.replace(/\s+/g, ''))].length;
    return count <= 27;
  }

  function render(text, ctx) {
    const frag = document.createDocumentFragment();
    if (!text) return frag;
    blocks(String(text).replace(/\r\n?/g, '\n').split('\n'), ctx || {}, 0, frag);
    return frag;
  }

  // versão em texto puro (notificação, prévia de resposta): sem símbolos de formatação, menções
  // com nome, e spoiler escondido
  const ESC_CHARS = '\\`*_~|<>#-[]()@:.!';
  function plain(text, ctx) {
    if (!text) return '';
    // \* escapado vira um caractere reservado enquanto tira a formatação, e volta no fim
    const hide = (t) => t.replace(/\\([\\`*_~|<>#\-[\]()@:.!])/g, (_, ch) => String.fromCharCode(0xE000 + ESC_CHARS.indexOf(ch)));
    const unhide = (t) => t.replace(/[\uE000-\uE01F]/g, (ch) => ESC_CHARS[ch.charCodeAt(0) - 0xE000] || '');
    return unhide(hide(String(text))
      .replace(/```[\w+#.-]*\n?([\s\S]*?)```/g, '$1')
      .replace(/\|\|([\s\S]+?)\|\|/g, '(spoiler)')
      .replace(/<@(\d{1,10})>/g, (_, id) => {
        const u = ctx && ctx.resolveUser ? ctx.resolveUser(Number(id)) : null;
        return '@' + (u ? u.username : 'alguém');
      })
      .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1')
      .replace(/<(https?:\/\/[^\s>]+)>/g, '$1')
      .replace(/^(#{1,3}|-#|>>>|>)\s+/gm, '')
      .replace(/(\*\*|__|~~|`)/g, '')
      .replace(/(^|[^\w*])\*(\S[^*]*)\*/g, '$1$2')
      .replace(/(^|[^\w])_(\S[^_]*)_(?!\w)/g, '$1$2')
      .replace(/\s+/g, ' ')
      .trim());
  }

  // links que ganham prévia: soltos no texto (não dentro de código, não entre <>, não de spoiler)
  function links(text) {
    if (!text) return [];
    const clean = String(text)
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/`[^`]*`/g, ' ')
      .replace(/\|\|[\s\S]*?\|\|/g, ' ')
      .replace(/<https?:\/\/[^\s>]+>/gi, ' ');
    const out = [];
    for (const m of clean.matchAll(/(?:^|[^\w])(https?:\/\/[^\s<>"']+)/gi)) {
      const href = safeHref(trimUrl(m[1]));
      if (href && !out.includes(href)) out.push(href);
      if (out.length >= 3) break;
    }
    return out;
  }

  window.DuskyMarkdown = { render, plain, links, isEmojiOnly };
})();
