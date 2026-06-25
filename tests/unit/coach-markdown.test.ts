import { describe, expect, it } from 'vitest';
import { mdToHtml } from '../../src/panel/components/coach/markdown';

describe('mdToHtml', () => {
  it('renders bold, inline code, and paragraphs', () => {
    const html = mdToHtml('Use **defer** on `script.js` to fix it.');
    expect(html).toContain('<strong>defer</strong>');
    expect(html).toContain('<code class="md-code">script.js</code>');
    expect(html).toContain('<p class="md-p">');
  });

  it('renders fenced code blocks without further markdown processing', () => {
    const html = mdToHtml('Before:\n```js\nconst x = a ** b;\n```');
    expect(html).toContain('<pre class="md-pre"><code>const x = a ** b;</code></pre>');
    // The ** inside the code block must NOT become <strong>.
    expect(html).not.toContain('<strong>');
  });

  it('renders unordered and ordered lists', () => {
    const ul = mdToHtml('- one\n- two');
    expect(ul).toContain('<ul class="md-list">');
    expect(ul).toContain('<li>one</li>');
    expect(ul).toContain('<li>two</li>');
    expect(ul).toContain('</ul>');
    expect(mdToHtml('1. first\n2. second')).toContain('<ol class="md-list">');
  });

  it('escapes HTML to prevent injection', () => {
    const html = mdToHtml('look: <img src=x onerror=alert(1)>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  it('renders headings', () => {
    expect(mdToHtml('## Findings')).toContain('md-h2');
  });
});
