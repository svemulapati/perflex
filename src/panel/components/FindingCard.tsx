import { useState } from 'react';
import type { PerformanceFinding } from '@/shared/types';
import { findingToMarkdown } from '@/shared/export';
import { copyToClipboard } from '../export-actions';
import { ms, shortUrl } from '../format';
import { RemediationPanel } from './RemediationPanel';

const SEVERITY_STYLE: Record<string, { badge: string; border: string }> = {
  critical: { badge: 'bg-severity-critical/20 text-severity-critical', border: 'border-l-severity-critical' },
  warning: { badge: 'bg-severity-warning/20 text-severity-warning', border: 'border-l-severity-warning' },
  info: { badge: 'bg-severity-info/20 text-severity-info', border: 'border-l-severity-info' },
};

const CATEGORY_LABEL: Record<string, string> = {
  loading: 'Loading',
  execution: 'Execution',
  rendering: 'Rendering',
  network: 'Network',
  'third-party': 'Third-party',
};

export function FindingCard({ finding, onDismiss }: { finding: PerformanceFinding; onDismiss: () => void }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState('');
  const sev = SEVERITY_STYLE[finding.severity];

  const copy = async (kind: 'md' | 'json') => {
    const text = kind === 'md' ? findingToMarkdown(finding) : JSON.stringify(finding, null, 2);
    if (await copyToClipboard(text)) {
      setCopied(kind);
      setTimeout(() => setCopied(''), 1200);
    }
  };

  return (
    <div className={`rounded-md border border-zinc-800 border-l-2 bg-zinc-900/40 p-2.5 ${sev.border}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${sev.badge}`}>
              {finding.severity}
            </span>
            <span className="text-[9px] uppercase tracking-wide text-zinc-500">
              {CATEGORY_LABEL[finding.category]}
            </span>
            <span className="text-xs font-semibold text-zinc-100">{finding.patternName}</span>
          </div>
          <p className="mt-1 text-[11px] text-zinc-400">{finding.description}</p>
        </div>
        <button
          onClick={onDismiss}
          title="Dismiss"
          className="shrink-0 text-zinc-600 hover:text-zinc-300"
        >
          ✕
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-zinc-500">
        <span>
          Impact: <span className="text-zinc-300">{finding.impact.estimatedUserImpact}</span>
        </span>
        {finding.impact.totalDuration > 0 && <span>~{ms(finding.impact.totalDuration)}</span>}
        <span>×{finding.impact.frequency}</span>
        {finding.impact.coreWebVitalAffected && (
          <span className="rounded bg-zinc-800 px-1 text-zinc-300">{finding.impact.coreWebVitalAffected}</span>
        )}
        <span>conf {Math.round(finding.confidence * 100)}%</span>
        {finding.evidence.scriptUrl && (
          <span className="truncate font-mono text-zinc-500" title={finding.evidence.scriptUrl}>
            {shortUrl(finding.evidence.scriptUrl)}
          </span>
        )}
      </div>

      <div className="mt-2 flex items-center gap-3">
        <button onClick={() => setOpen((o) => !o)} className="text-[11px] font-medium text-brand hover:underline">
          {open ? 'Hide fix' : 'View fix'}
        </button>
        <button onClick={() => copy('md')} className="text-[10px] text-zinc-500 hover:text-zinc-300">
          {copied === 'md' ? 'Copied!' : 'Copy MD'}
        </button>
        <button onClick={() => copy('json')} className="text-[10px] text-zinc-500 hover:text-zinc-300">
          {copied === 'json' ? 'Copied!' : 'Copy JSON'}
        </button>
      </div>

      {open && (
        <div className="mt-2">
          <RemediationPanel finding={finding} />
        </div>
      )}
    </div>
  );
}
