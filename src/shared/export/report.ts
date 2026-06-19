import type { ExportBundle, PerformanceFinding } from '../types';

function ms(n: number | null): string {
  if (n === null) return '—';
  return n >= 1000 ? `${(n / 1000).toFixed(2)}s` : `${Math.round(n)}ms`;
}
function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}
const sevColor: Record<string, string> = { critical: '#EF4444', warning: '#F59E0B', info: '#3B82F6' };

/**
 * Self-contained, printable HTML report (open in a tab → Cmd/Ctrl+P → Save as
 * PDF). No <script> (so it works under any CSP); styling is inline <style>.
 */
export function buildReportHTML(bundle: ExportBundle, generatedAt = Date.now()): string {
  const { snapshot } = bundle;
  const v = snapshot.vitals;
  const topScripts = snapshot.scripts.slice(0, 10);
  const topFindings = snapshot.findings.slice(0, 5);
  const grade =
    snapshot.healthScore >= 90 ? 'A' : snapshot.healthScore >= 80 ? 'B' : snapshot.healthScore >= 70 ? 'C' : snapshot.healthScore >= 60 ? 'D' : 'F';

  const findingRow = (f: PerformanceFinding) => `
    <div class="finding">
      <span class="dot" style="background:${sevColor[f.severity]}"></span>
      <div>
        <div class="ftitle">${esc(f.patternName)} <span class="sev">${f.severity}</span></div>
        <div class="fdesc">${esc(f.description)}</div>
        ${f.remediation ? `<div class="fix">Fix: ${esc(f.remediation.summary)}</div>` : ''}
      </div>
    </div>`;

  return `<!doctype html><html><head><meta charset="utf-8"><title>Perflex Report — ${esc(snapshot.url)}</title>
<style>
  @page { margin: 16mm; }
  body { font-family: -apple-system, system-ui, sans-serif; color: #18181b; margin: 0; padding: 24px; }
  h1 { font-size: 20px; margin: 0 0 2px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .05em; color: #71717a; margin: 20px 0 6px; }
  .url { color: #6366F1; font-size: 12px; word-break: break-all; }
  .meta { color: #a1a1aa; font-size: 11px; margin-top: 2px; }
  .score { display:flex; align-items:center; gap:16px; margin-top:14px; }
  .badge { font-size: 34px; font-weight: 800; }
  .vitals { display:flex; gap:10px; flex-wrap:wrap; }
  .vital { border:1px solid #e4e4e7; border-radius:6px; padding:6px 10px; font-size:12px; }
  .vital b { display:block; font-size:15px; }
  table { width:100%; border-collapse:collapse; font-size:11px; }
  th,td { text-align:left; padding:4px 6px; border-bottom:1px solid #ececef; }
  th { color:#71717a; font-weight:600; }
  td.n { text-align:right; font-variant-numeric:tabular-nums; }
  .finding { display:flex; gap:8px; padding:6px 0; border-bottom:1px solid #f1f1f3; }
  .dot { width:8px; height:8px; border-radius:50%; margin-top:5px; flex:0 0 auto; }
  .ftitle { font-weight:600; font-size:12px; }
  .sev { font-size:9px; text-transform:uppercase; color:#71717a; }
  .fdesc { font-size:11px; color:#52525b; }
  .fix { font-size:11px; color:#16a34a; margin-top:2px; }
  .note { background:#f4f4f5; border-radius:6px; padding:8px 10px; font-size:11px; color:#52525b; margin-top:18px; }
</style></head><body>
  <h1>Perflex Performance Report</h1>
  <div class="url">${esc(snapshot.url)}</div>
  <div class="meta">Generated ${new Date(generatedAt).toLocaleString()}</div>

  <div class="score">
    <div class="badge" style="color:${snapshot.healthScore >= 80 ? '#10B981' : snapshot.healthScore >= 60 ? '#F59E0B' : '#EF4444'}">${snapshot.healthScore} · ${grade}</div>
    <div class="vitals">
      <div class="vital">LCP<b>${ms(v.lcp)}</b></div>
      <div class="vital">INP<b>${ms(v.inp)}</b></div>
      <div class="vital">CLS<b>${v.cls.toFixed(3)}</b></div>
      <div class="vital">TBT<b>${ms(snapshot.totalBlockingTime)}</b></div>
    </div>
  </div>

  <h2>Top Findings</h2>
  ${topFindings.length ? topFindings.map(findingRow).join('') : '<div class="fdesc">No findings.</div>'}

  <h2>Script Leaderboard (Top 10)</h2>
  <table>
    <thead><tr><th>Script</th><th>Class</th><th class="n">Main-thread</th><th class="n">Tasks</th><th class="n">Transfer</th></tr></thead>
    <tbody>
      ${topScripts
        .map(
          (s) => `<tr>
        <td>${esc(s.url)}</td>
        <td>${s.classification}</td>
        <td class="n">${ms(s.metrics.totalMainThreadTime)}</td>
        <td class="n">${s.metrics.longTaskCount}</td>
        <td class="n">${(s.metrics.totalTransferSize / 1024).toFixed(1)} KB</td>
      </tr>`
        )
        .join('')}
    </tbody>
  </table>

  <div class="note">Tip: Use your browser's Print dialog (Cmd/Ctrl+P) and choose "Save as PDF" to export this report.</div>
</body></html>`;
}
