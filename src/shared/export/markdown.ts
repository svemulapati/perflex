import type { PerformanceFinding, ScriptProfile } from '../types';

function ms(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(2)}s` : `${Math.round(n)}ms`;
}

/** Markdown for a single finding — suitable for a Jira/GitHub issue. */
export function findingToMarkdown(f: PerformanceFinding): string {
  const lines: string[] = [];
  lines.push(`### ${f.patternName} (${f.severity})`);
  lines.push('');
  lines.push(f.description);
  lines.push('');
  lines.push(`- **Category:** ${f.category}`);
  lines.push(`- **Impact:** ${f.impact.estimatedUserImpact} · ~${ms(f.impact.totalDuration)} across ${f.impact.frequency}×`);
  if (f.impact.coreWebVitalAffected) lines.push(`- **Core Web Vital:** ${f.impact.coreWebVitalAffected}`);
  lines.push(`- **Confidence:** ${Math.round(f.confidence * 100)}%`);
  if (f.evidence.scriptUrl) lines.push(`- **Script:** \`${f.evidence.scriptUrl}\``);
  if (f.evidence.functionName) lines.push(`- **Function:** \`${f.evidence.functionName}\``);

  const rem = f.remediation;
  if (rem) {
    lines.push('');
    lines.push(`**Fix (${rem.riskLevel}):** ${rem.summary}`);
    lines.push('');
    lines.push(rem.detailed);
    if (rem.codeExample) {
      lines.push('');
      lines.push('```' + rem.codeExample.language);
      lines.push('// before');
      lines.push(rem.codeExample.before);
      lines.push('// after');
      lines.push(rem.codeExample.after);
      lines.push('```');
    }
    lines.push('');
    lines.push(`> Business safety: ${rem.businessSafetyNote}`);
    if (rem.validationSteps.length) {
      lines.push('');
      lines.push('**Validate:**');
      rem.validationSteps.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
    }
  }
  return lines.join('\n');
}

export function scriptToMarkdown(s: ScriptProfile): string {
  return [
    `### ${s.url}`,
    `- Classification: ${s.classification}${s.category ? ` (${s.category})` : ''}`,
    `- Main-thread time: ${ms(s.metrics.totalMainThreadTime)}`,
    `- Long tasks: ${s.metrics.longTaskCount} (max ${ms(s.metrics.maxLongTaskDuration)})`,
    `- Transfer: ${(s.metrics.totalTransferSize / 1024).toFixed(1)} KB`,
    `- Network: ${s.metrics.networkRequestCount} req · ${ms(s.metrics.totalNetworkTime)}`,
    s.hotFunctions.length
      ? `- Hot functions:\n${s.hotFunctions.map((fn) => `  - \`${fn.functionName}\` ${ms(fn.totalDuration)} ×${fn.invocationCount}`).join('\n')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}
