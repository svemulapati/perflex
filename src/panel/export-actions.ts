/** Browser-side helpers for downloading exports and copying to the clipboard. */

export function downloadFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Open a printable HTML report in a new tab (user prints → Save as PDF). */
export function openReport(html: string): void {
  const win = window.open('', '_blank');
  if (win) {
    win.document.open();
    win.document.write(html);
    win.document.close();
  } else {
    // Popup blocked — fall back to downloading the HTML.
    downloadFile('perflex-report.html', html, 'text/html');
  }
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function timestampedName(base: string, ext: string): string {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `perflex-${base}-${ts}.${ext}`;
}

/**
 * Build a fully self-contained shareable HTML file: the packaged viewer with the
 * session inlined as `window.__PERFLEX_DATA__`. Opens offline, no extension/server.
 */
export async function buildShareableHTML(payload: unknown): Promise<string> {
  const res = await fetch(chrome.runtime.getURL('viewer.html'));
  const template = await res.text();
  // Escape `<` so the JSON can't terminate the <script> early.
  const json = JSON.stringify(payload).replace(/</g, '\\u003c');
  const inject = `<script>window.__PERFLEX_DATA__=${json};</script>`;
  return template.replace('</head>', `${inject}\n</head>`);
}
