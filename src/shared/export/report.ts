import type {
  DetectedFramework,
  ExportBundle,
  InteractionSession,
  PerformanceFinding,
  ScriptProfile,
  SessionSnapshot,
} from '../types';
import { CWV_THRESHOLDS } from '../constants';
import { estimateSpeedIndex, scoreBand, scorePerformance } from '../lighthouse-scoring';

function ms(n: number | null): string {
  if (n === null || n === undefined) return '—';
  return n >= 1000 ? `${(n / 1000).toFixed(2)}s` : `${Math.round(n)}ms`;
}
function kb(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}
function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}
function fileLabel(url: string): string {
  if (!url || url === 'unknown' || url === '(inline)') return url || 'unknown';
  try {
    const u = new URL(url);
    return u.pathname.split('/').filter(Boolean).pop() || u.hostname;
  } catch {
    return url;
  }
}

const SEV = { critical: '#EF4444', warning: '#F59E0B', info: '#3B82F6' } as const;
const SUCCESS = '#10B981';
const BRAND = '#6366F1';

function healthColor(score: number): string {
  return score >= 80 ? SUCCESS : score >= 60 ? '#F59E0B' : '#EF4444';
}
function gradeOf(score: number): string {
  return score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';
}
function bandColor(band: 'fail' | 'average' | 'pass'): string {
  return band === 'pass' ? SUCCESS : band === 'average' ? '#F59E0B' : '#EF4444';
}

/** Color-coded CWV rating against the published good/poor thresholds. */
function rating(value: number | null, good: number, poor: number): { label: string; color: string } {
  if (value === null || value === undefined) return { label: 'No data', color: '#a1a1aa' };
  if (value <= good) return { label: 'Good', color: SUCCESS };
  if (value >= poor) return { label: 'Poor', color: '#EF4444' };
  return { label: 'Needs work', color: '#F59E0B' };
}

/** A circular SVG score gauge (no script — safe under any CSP). */
function gauge(score: number, color: string, caption: string): string {
  const r = 42;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.max(0, Math.min(100, score)) / 100);
  return `<svg width="104" height="104" viewBox="0 0 110 110" aria-hidden="true">
    <circle cx="55" cy="55" r="${r}" fill="none" stroke="#e4e4e7" stroke-width="9"/>
    <circle cx="55" cy="55" r="${r}" fill="none" stroke="${color}" stroke-width="9" stroke-linecap="round"
      stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}" transform="rotate(-90 55 55)"/>
    <text x="55" y="60" text-anchor="middle" font-size="28" font-weight="800" fill="${color}">${score}</text>
    <text x="55" y="76" text-anchor="middle" font-size="9" fill="#71717a">${esc(caption)}</text>
  </svg>`;
}

/** A donut from weighted segments. */
function donut(segments: { value: number; color: string }[]): string {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = 38;
  const circ = 2 * Math.PI * r;
  let acc = 0;
  const arcs = segments
    .filter((s) => s.value > 0)
    .map((s) => {
      const frac = s.value / total;
      const dash = `${(frac * circ).toFixed(1)} ${circ.toFixed(1)}`;
      const off = (-acc * circ).toFixed(1);
      acc += frac;
      return `<circle cx="50" cy="50" r="${r}" fill="none" stroke="${s.color}" stroke-width="16"
        stroke-dasharray="${dash}" stroke-dashoffset="${off}" transform="rotate(-90 50 50)"/>`;
    })
    .join('');
  return `<svg width="92" height="92" viewBox="0 0 100 100" aria-hidden="true">${arcs}</svg>`;
}

function vitalCard(label: string, value: string, value2: number | null, good: number, poor: number): string {
  const r = rating(value2, good, poor);
  return `<div class="vcard" style="border-top:3px solid ${r.color}">
    <div class="vlabel">${label}</div>
    <div class="vval">${value}</div>
    <div class="vrate" style="color:${r.color}">${r.label}</div>
  </div>`;
}

function metricCard(label: string, value: string, color = '#18181b'): string {
  return `<div class="mcard"><div class="mlabel">${esc(label)}</div><div class="mval" style="color:${color}">${value}</div></div>`;
}

function findingCard(f: PerformanceFinding): string {
  const color = SEV[f.severity];
  const evidence = [
    f.evidence?.scriptUrl ? fileLabel(f.evidence.scriptUrl) : null,
    f.evidence?.functionName ? `${f.evidence.functionName}()` : null,
  ]
    .filter(Boolean)
    .map((x) => esc(String(x)))
    .join(' · ');
  const imp = f.impact;
  const impactBits = [
    imp?.frequency ? `${imp.frequency}× occurrences` : null,
    imp?.totalDuration ? `${ms(imp.totalDuration)} total` : null,
    imp?.coreWebVitalAffected ? `affects ${esc(imp.coreWebVitalAffected)}` : null,
    imp?.estimatedUserImpact ? `${esc(imp.estimatedUserImpact)} user impact` : null,
  ]
    .filter(Boolean)
    .join(' • ');
  const rem = f.remediation;
  const code = rem?.codeExample;
  return `<div class="fcard" style="border-left:4px solid ${color}">
    <div class="frow">
      <div class="ftitle">${esc(f.patternName)}</div>
      <span class="fbadge" style="background:${color}1a;color:${color}">${f.severity}</span>
    </div>
    <div class="fmeta">${esc(f.category)}${typeof f.confidence === 'number' ? ` · ${Math.round(f.confidence * 100)}% confidence` : ''}${evidence ? ` · ${evidence}` : ''}</div>
    <div class="fdesc">${esc(f.description)}</div>
    ${impactBits ? `<div class="fimpact">${impactBits}</div>` : ''}
    ${rem?.summary ? `<div class="ffix"><b>Fix:</b> ${esc(rem.summary)}${rem.riskLevel ? ` <span class="risk">${esc(rem.riskLevel)}</span>` : ''}</div>` : ''}
    ${
      code?.before || code?.after
        ? `<div class="code">${code.before ? `<div class="clabel">Before</div><pre>${esc(code.before)}</pre>` : ''}${code.after ? `<div class="clabel after">After</div><pre>${esc(code.after)}</pre>` : ''}</div>`
        : ''
    }
  </div>`;
}

function scriptRow(s: ScriptProfile, maxMt: number): string {
  const mt = s.metrics.totalMainThreadTime;
  const pct = maxMt > 0 ? (mt / maxMt) * 100 : 0;
  const isThird = s.classification.startsWith('third-party');
  const cls = isThird ? '3P' : s.classification === 'inline' ? 'IN' : '1P';
  const clsColor = isThird ? '#F59E0B' : BRAND;
  return `<tr>
    <td><span class="tag" style="background:${clsColor}1a;color:${clsColor}">${cls}</span> <span class="mono">${esc(fileLabel(s.url))}</span></td>
    <td class="n">
      <div class="barwrap"><div class="bar" style="width:${pct.toFixed(0)}%;background:${mt >= 250 ? '#EF4444' : mt >= 80 ? '#F59E0B' : SUCCESS}"></div></div>
      <span>${ms(mt)}</span>
    </td>
    <td class="n">${s.metrics.longTaskCount}</td>
    <td class="n">${ms(s.metrics.maxLongTaskDuration)}</td>
    <td class="n">${kb(s.metrics.totalTransferSize)}</td>
    <td class="n">${s.metrics.forcedReflowCount}</td>
  </tr>`;
}

function frameworkChips(fw: DetectedFramework[]): string {
  if (!fw.length) return '<div class="muted">None detected.</div>';
  return `<div class="chips">${fw
    .map(
      (f) =>
        `<span class="chip" style="${f.devBuild ? `background:#EF44441a;color:#EF4444` : ''}">${esc(f.name)}${f.version ? ` ${esc(f.version)}` : ''}${f.devBuild ? ' · DEV BUILD' : ''}</span>`
    )
    .join('')}</div>`;
}

function interactionsBlock(interactions: InteractionSession[]): string {
  if (!interactions.length) return '<div class="muted">No interactions recorded.</div>';
  const worst = [...interactions].sort((a, b) => a.health - b.health)[0];
  const avg = Math.round(interactions.reduce((s, i) => s + i.health, 0) / interactions.length);
  return `<div class="kgrid">
    ${metricCard('Interactions', String(interactions.length))}
    ${metricCard('Avg interaction health', `${avg}`, healthColor(avg))}
    ${metricCard('Worst interaction', `${worst.health}`, healthColor(worst.health))}
  </div>
  <div class="muted" style="margin-top:6px">Worst: <b>${esc(worst.trigger.type)}</b> on ${esc(worst.trigger.target)} — health ${worst.health}, ${ms(worst.duration)}.</div>`;
}

function verdict(snap: SessionSnapshot, lh: number | null): string {
  const crit = snap.findings.filter((f) => f.severity === 'critical').length;
  const parts: string[] = [];
  parts.push(`Health ${snap.healthScore}/100 (grade ${gradeOf(snap.healthScore)})`);
  if (lh !== null) parts.push(`estimated Lighthouse ${lh}`);
  if (crit) parts.push(`${crit} critical issue${crit === 1 ? '' : 's'}`);
  return parts.join(' · ');
}

/**
 * Self-contained, printable HTML report (open in a tab → Cmd/Ctrl+P → Save as
 * PDF). Fully static markup — no inline JS — so it renders under any CSP;
 * styling is inline and the charts are inline SVG.
 */
export function buildReportHTML(bundle: ExportBundle, generatedAt = Date.now()): string {
  const snapshot = bundle.snapshot;
  const v = snapshot.vitals;

  // Lighthouse estimate (reuses the Feature 7 scorer).
  const lh = scorePerformance({
    fcp: v.fcp,
    si: estimateSpeedIndex(v.fcp, snapshot.totalBlockingTime),
    lcp: v.lcp,
    tbt: snapshot.totalBlockingTime,
    cls: v.cls,
  });

  const sevCounts = {
    critical: snapshot.findings.filter((f) => f.severity === 'critical').length,
    warning: snapshot.findings.filter((f) => f.severity === 'warning').length,
    info: snapshot.findings.filter((f) => f.severity === 'info').length,
  };

  // Show all critical + warning, capped for sane PDF length.
  const DETAIL_CAP = 24;
  const detailFindings = [...snapshot.findings]
    .sort((a, b) => sevRank(a.severity) - sevRank(b.severity))
    .slice(0, DETAIL_CAP);
  const omitted = snapshot.findings.length - detailFindings.length;

  const scripts = snapshot.scripts.slice(0, 12);
  const maxMt = scripts.reduce((m, s) => Math.max(m, s.metrics.totalMainThreadTime), 0);

  // First- vs third-party main-thread split.
  const firstMt = sumBy(snapshot.scripts.filter((s) => !s.classification.startsWith('third-party')), (s) => s.metrics.totalMainThreadTime);
  const thirdMt = sumBy(snapshot.scripts.filter((s) => s.classification.startsWith('third-party')), (s) => s.metrics.totalMainThreadTime);

  const lhColor = lh.score === null ? '#a1a1aa' : bandColor(scoreBand(lh.score));

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Perflex Report — ${esc(snapshot.url)}</title>
<style>
  @page { margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; color: #18181b; margin: 0; padding: 28px 30px; font-size: 12px; line-height: 1.45; }
  .mono { font-family: ui-monospace, 'SF Mono', Menlo, monospace; }
  .muted { color: #a1a1aa; font-size: 11px; }
  header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #18181b; padding-bottom:14px; }
  .brand { display:flex; align-items:center; gap:9px; }
  .logo { width:30px; height:30px; border-radius:7px; background:${BRAND}; color:#fff; font-weight:800; font-size:18px; display:flex; align-items:center; justify-content:center; }
  .brand h1 { font-size:18px; margin:0; letter-spacing:-.01em; }
  .brand .sub { font-size:10px; color:#71717a; text-transform:uppercase; letter-spacing:.08em; }
  .hmeta { text-align:right; font-size:10px; color:#71717a; }
  .url { color:${BRAND}; font-size:12px; word-break:break-all; max-width:340px; }
  h2 { font-size:11px; text-transform:uppercase; letter-spacing:.07em; color:#71717a; margin:24px 0 8px; border-bottom:1px solid #ececef; padding-bottom:4px; }
  .verdict { background:#f4f4f5; border-radius:8px; padding:9px 13px; font-size:12px; font-weight:600; margin-top:14px; }
  .scorecards { display:flex; gap:14px; margin-top:14px; }
  .scard { flex:1; border:1px solid #e4e4e7; border-radius:10px; padding:12px; display:flex; align-items:center; gap:12px; }
  .scard .stitle { font-size:11px; color:#71717a; text-transform:uppercase; letter-spacing:.06em; }
  .scard .ssub { font-size:10px; color:#a1a1aa; margin-top:3px; }
  .vrow { display:flex; gap:8px; flex-wrap:wrap; }
  .vcard { flex:1; min-width:84px; border:1px solid #e4e4e7; border-radius:8px; padding:8px 10px; }
  .vlabel { font-size:10px; color:#71717a; }
  .vval { font-size:17px; font-weight:700; margin:1px 0; }
  .vrate { font-size:10px; font-weight:600; }
  .kgrid { display:flex; gap:8px; flex-wrap:wrap; }
  .mcard { flex:1; min-width:80px; border:1px solid #e4e4e7; border-radius:8px; padding:8px 10px; }
  .mlabel { font-size:10px; color:#71717a; }
  .mval { font-size:16px; font-weight:700; }
  .sevbar { display:flex; gap:8px; }
  .sevchip { border-radius:6px; padding:5px 11px; font-size:12px; font-weight:700; }
  .fcard { border:1px solid #ececef; border-radius:8px; padding:10px 12px; margin-bottom:8px; break-inside:avoid; }
  .frow { display:flex; justify-content:space-between; align-items:center; }
  .ftitle { font-weight:700; font-size:13px; }
  .fbadge { font-size:9px; font-weight:700; text-transform:uppercase; padding:2px 7px; border-radius:20px; }
  .fmeta { font-size:10px; color:#a1a1aa; margin-top:2px; }
  .fdesc { font-size:11px; color:#3f3f46; margin-top:5px; }
  .fimpact { font-size:11px; color:#52525b; margin-top:4px; font-weight:600; }
  .ffix { font-size:11px; color:#16a34a; margin-top:5px; }
  .risk { font-size:9px; text-transform:uppercase; color:#a1a1aa; border:1px solid #e4e4e7; border-radius:4px; padding:0 4px; }
  .code { margin-top:6px; }
  .clabel { font-size:9px; text-transform:uppercase; color:#a1a1aa; margin-top:4px; }
  .clabel.after { color:${SUCCESS}; }
  pre { background:#f8f8f9; border:1px solid #ececef; border-radius:5px; padding:7px 9px; font-size:10px; font-family:ui-monospace,monospace; white-space:pre-wrap; word-break:break-word; margin:2px 0 0; overflow:hidden; }
  table { width:100%; border-collapse:collapse; font-size:11px; }
  th,td { text-align:left; padding:5px 7px; border-bottom:1px solid #ececef; }
  th { color:#71717a; font-weight:600; font-size:10px; text-transform:uppercase; letter-spacing:.04em; }
  td.n { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
  .barwrap { display:inline-block; width:60px; height:5px; background:#f1f1f3; border-radius:3px; vertical-align:middle; margin-right:6px; overflow:hidden; }
  .bar { height:5px; border-radius:3px; }
  .tag { font-size:8px; font-weight:700; padding:1px 4px; border-radius:3px; }
  .chips { display:flex; gap:6px; flex-wrap:wrap; }
  .chip { background:#f1f1f3; color:#3f3f46; border-radius:5px; padding:3px 8px; font-size:11px; font-weight:600; }
  .split { display:flex; align-items:center; gap:16px; }
  .legend { font-size:11px; }
  .legend div { display:flex; align-items:center; gap:6px; margin:3px 0; }
  .dot { width:10px; height:10px; border-radius:3px; }
  footer { margin-top:26px; padding-top:10px; border-top:1px solid #ececef; font-size:10px; color:#a1a1aa; display:flex; justify-content:space-between; }
</style></head><body>
  <header>
    <div class="brand">
      <div class="logo">P</div>
      <div>
        <h1>Perflex Performance Report</h1>
        <div class="sub">Real-time JavaScript profiling</div>
      </div>
    </div>
    <div class="hmeta">
      <div class="url">${esc(snapshot.url)}</div>
      <div style="margin-top:4px">Generated ${esc(new Date(generatedAt).toLocaleString())}</div>
    </div>
  </header>

  <div class="verdict">${esc(verdict(snapshot, lh.score))}</div>

  <div class="scorecards">
    <div class="scard">
      ${gauge(snapshot.healthScore, healthColor(snapshot.healthScore), `GRADE ${gradeOf(snapshot.healthScore)}`)}
      <div><div class="stitle">Perflex Health</div><div class="ssub">Composite of long tasks, INP,<br>CLS, memory, network & frames</div></div>
    </div>
    <div class="scard">
      ${gauge(lh.score ?? 0, lhColor, lh.score === null ? 'NO DATA' : 'ESTIMATE')}
      <div><div class="stitle">Lighthouse (est.)</div><div class="ssub">Local estimate — run Lighthouse<br>for the official score</div></div>
    </div>
  </div>

  <h2>Core Web Vitals</h2>
  <div class="vrow">
    ${vitalCard('LCP', ms(v.lcp), v.lcp, CWV_THRESHOLDS.lcp.good, CWV_THRESHOLDS.lcp.poor)}
    ${vitalCard('INP', ms(v.inp), v.inp, CWV_THRESHOLDS.inp.good, CWV_THRESHOLDS.inp.poor)}
    ${vitalCard('CLS', v.cls.toFixed(3), v.cls, CWV_THRESHOLDS.cls.good, CWV_THRESHOLDS.cls.poor)}
    ${vitalCard('FCP', ms(v.fcp), v.fcp, CWV_THRESHOLDS.fcp.good, CWV_THRESHOLDS.fcp.poor)}
    ${vitalCard('TTFB', ms(v.ttfb), v.ttfb, 800, 1800)}
  </div>

  <h2>Key Metrics</h2>
  <div class="kgrid">
    ${metricCard('Total Blocking', ms(snapshot.totalBlockingTime), snapshot.totalBlockingTime > 300 ? '#EF4444' : snapshot.totalBlockingTime > 150 ? '#F59E0B' : SUCCESS)}
    ${metricCard('JS Heap', kb(snapshot.heapSize))}
    ${metricCard('Requests', String(snapshot.networkRequestCount))}
    ${metricCard('Frame Drops', `${(snapshot.frameDropRate * 100).toFixed(0)}%`, snapshot.frameDropRate > 0.2 ? '#EF4444' : snapshot.frameDropRate > 0.05 ? '#F59E0B' : SUCCESS)}
    ${metricCard('FPS', String(snapshot.fps))}
  </div>

  <h2>Findings — ${snapshot.findings.length} total</h2>
  <div class="sevbar">
    <div class="sevchip" style="background:${SEV.critical}1a;color:${SEV.critical}">${sevCounts.critical} Critical</div>
    <div class="sevchip" style="background:${SEV.warning}1a;color:${SEV.warning}">${sevCounts.warning} Warning</div>
    <div class="sevchip" style="background:${SEV.info}1a;color:${SEV.info}">${sevCounts.info} Info</div>
  </div>
  <div style="margin-top:10px">
    ${detailFindings.length ? detailFindings.map(findingCard).join('') : '<div class="muted">No findings — clean run.</div>'}
    ${omitted > 0 ? `<div class="muted">+ ${omitted} more finding${omitted === 1 ? '' : 's'} (see JSON export for the full set).</div>` : ''}
  </div>

  <h2>Script Leaderboard</h2>
  <table>
    <thead><tr><th>Script</th><th class="n">Main-thread</th><th class="n">Tasks</th><th class="n">Max task</th><th class="n">Transfer</th><th class="n">Reflows</th></tr></thead>
    <tbody>${scripts.length ? scripts.map((s) => scriptRow(s, maxMt)).join('') : '<tr><td colspan="6" class="muted">No scripts captured.</td></tr>'}</tbody>
  </table>

  <h2>First-party vs Third-party Main-thread</h2>
  <div class="split">
    ${donut([
      { value: firstMt, color: BRAND },
      { value: thirdMt, color: '#F59E0B' },
    ])}
    <div class="legend">
      <div><span class="dot" style="background:${BRAND}"></span> First-party — ${ms(firstMt)}</div>
      <div><span class="dot" style="background:#F59E0B"></span> Third-party — ${ms(thirdMt)}</div>
      <div class="muted" style="margin-top:4px">${firstMt + thirdMt > 0 ? `${Math.round((thirdMt / (firstMt + thirdMt)) * 100)}% of main-thread time is third-party` : 'No attributed main-thread time'}</div>
    </div>
  </div>

  <h2>Detected Frameworks</h2>
  ${frameworkChips(snapshot.frameworks)}

  <h2>Interactions</h2>
  ${interactionsBlock(snapshot.interactions)}

  <footer>
    <span>Generated by Perflex — perflex.dev</span>
    <span>Lighthouse figures are local estimates. Run Lighthouse for official scores.</span>
  </footer>
</body></html>`;
}

function sevRank(s: string): number {
  return s === 'critical' ? 0 : s === 'warning' ? 1 : 2;
}
function sumBy<T>(arr: T[], fn: (t: T) => number): number {
  return arr.reduce((s, x) => s + fn(x), 0);
}
