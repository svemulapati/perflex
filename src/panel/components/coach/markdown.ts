/**
 * Tiny dependency-free markdown → HTML for Coach responses. Handles fenced and
 * inline code, bold, italic, headings, and lists. All text is HTML-escaped
 * before any tags are introduced, so the output is safe to inject.
 */
const PH = '@@CODE';

function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
}

export function mdToHtml(md: string): string {
  // 1. Pull fenced code blocks out first (escaped, restored at the end).
  const blocks: string[] = [];
  let src = md.replace(/```(\w*)\n?([\s\S]*?)```/g, (_m, _lang, code: string) => {
    const i = blocks.length;
    blocks.push(`<pre class="md-pre"><code>${esc(code.replace(/\n$/, ''))}</code></pre>`);
    return `${PH}${i}@@`;
  });

  // 2. Escape everything else, then layer inline formatting back on.
  src = esc(src);
  src = src.replace(/`([^`]+)`/g, '<code class="md-code">$1</code>');
  src = src.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  src = src.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');

  // 3. Block layout: headings, lists, paragraphs.
  const lines = src.split('\n');
  const out: string[] = [];
  let list: 'ul' | 'ol' | null = null;
  const closeList = () => {
    if (list) {
      out.push(`</${list}>`);
      list = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^(#{1,4})\s+(.*)/))) {
      closeList();
      const lvl = Math.min(4, m[1].length);
      out.push(`<div class="md-h md-h${lvl}">${m[2]}</div>`);
    } else if ((m = line.match(/^\s*[-*]\s+(.*)/))) {
      if (list !== 'ul') {
        closeList();
        out.push('<ul class="md-list">');
        list = 'ul';
      }
      out.push(`<li>${m[1]}</li>`);
    } else if ((m = line.match(/^\s*\d+\.\s+(.*)/))) {
      if (list !== 'ol') {
        closeList();
        out.push('<ol class="md-list">');
        list = 'ol';
      }
      out.push(`<li>${m[1]}</li>`);
    } else if (line.trim() === '') {
      closeList();
    } else if (/^@@CODE\d+@@$/.test(line.trim())) {
      closeList();
      out.push(line.trim());
    } else {
      closeList();
      out.push(`<p class="md-p">${line}</p>`);
    }
  }
  closeList();

  let html = out.join('\n');
  html = html.replace(/@@CODE(\d+)@@/g, (_m, i) => blocks[Number(i)]);
  return html;
}
