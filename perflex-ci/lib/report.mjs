/** Pure report rendering for Perflex CI — markdown (PR comment) + summary. */

function fmt(metric, v) {
  if (v == null) return '—';
  if (metric === 'cls') return Number(v).toFixed(3);
  return v >= 1000 ? `${(v / 1000).toFixed(2)}s` : `${Math.round(v)}ms`;
}

/** Markdown table suitable for posting as a GitHub PR comment. */
export function toMarkdown({ flow, summary, evaluation }) {
  const icon = evaluation.pass ? '✅' : '❌';
  const lines = [];
  lines.push(`## ${icon} Perflex Performance Check — ${flow.name}`);
  lines.push('');
  lines.push(
    evaluation.pass
      ? '**All performance checks passed.**'
      : `**${evaluation.errors} check(s) failed**${evaluation.warnings ? ` · ${evaluation.warnings} warning(s)` : ''}.`
  );
  lines.push('');

  const targetHeader = evaluation.mode === 'budgets' ? 'Budget' : 'Baseline';
  lines.push(`| Metric | Value | ${targetHeader} | Status |`);
  lines.push('|---|---|---|---|');
  for (const r of evaluation.results) {
    const target =
      evaluation.mode === 'budgets'
        ? `${r.operator} ${fmt(r.metric, r.threshold)}`
        : `${fmt(r.metric, r.baseline)}${r.allowed != null ? ` (≤ ${fmt(r.metric, r.allowed)})` : ''}`;
    const status = r.pass ? '✅' : '❌';
    lines.push(`| ${r.metric.toUpperCase()} | ${fmt(r.metric, r.value)} | ${target} | ${status} |`);
  }
  lines.push('');
  lines.push(
    `_Replayed ${summary.pages} page(s) · ${flow.steps.length} steps${evaluation.mode === 'baseline' ? ` · ±${Math.round(evaluation.tolerance * 100)}% tolerance` : ''} · Perflex CI_`
  );
  return lines.join('\n');
}

export function summaryLine({ flow, evaluation }) {
  return `${evaluation.pass ? 'PASS' : 'FAIL'} — ${flow.name}: ${evaluation.errors} error(s), ${evaluation.warnings} warning(s)`;
}
