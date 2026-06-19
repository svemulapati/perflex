import { useState } from 'react';
import type { PerformanceFinding, RemediationPlan } from '@/shared/types';
import { generateRemediation } from '@/shared/ai-client';
import { useSettingsStore } from '../stores/settings-store';
import { CodeDiff } from './CodeDiff';

const RISK_STYLE: Record<RemediationPlan['riskLevel'], string> = {
  safe: 'bg-emerald-500/15 text-emerald-300',
  verify: 'bg-amber-500/15 text-amber-300',
  review: 'bg-rose-500/15 text-rose-300',
};

export function RemediationPanel({ finding }: { finding: PerformanceFinding }) {
  const apiKey = useSettingsStore((s) => s.anthropicApiKey);
  const aiEnabled = useSettingsStore((s) => s.aiEnabled);
  const aiModel = useSettingsStore((s) => s.aiModel);
  const [copied, setCopied] = useState(false);
  const [aiPlan, setAiPlan] = useState<RemediationPlan | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const plan = aiPlan ?? finding.remediation;
  if (!plan) return <div className="text-[11px] text-zinc-500">No remediation available.</div>;

  const aiAvailable = aiEnabled && apiKey.length > 0;
  const runAi = async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      setAiPlan(await generateRemediation(finding, { apiKey, model: aiModel }));
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'AI request failed');
    } finally {
      setAiLoading(false);
    }
  };

  const copyFix = async () => {
    const text = plan.codeExample?.after ?? plan.summary;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="flex flex-col gap-2 border-t border-zinc-800 pt-2 text-[11px]">
      <div className="flex items-center gap-2">
        <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase ${RISK_STYLE[plan.riskLevel]}`}>
          {plan.riskLevel}
        </span>
        <span className="font-semibold text-zinc-200">{plan.summary}</span>
        {plan.source === 'ai' && (
          <span className="rounded bg-brand/20 px-1 text-[9px] font-semibold text-brand">AI</span>
        )}
      </div>

      <p className="text-zinc-400">{plan.detailed}</p>

      {plan.codeExample && (
        <CodeDiff before={plan.codeExample.before} after={plan.codeExample.after} language={plan.codeExample.language} />
      )}

      <div className="grid grid-cols-1 gap-1">
        <Row label="Risk" value={plan.riskExplanation} />
        <Row label="Est. impact" value={plan.estimatedImpact} />
        <Row label="Business safety" value={plan.businessSafetyNote} />
      </div>

      {plan.validationSteps.length > 0 && (
        <div>
          <div className="text-[9px] font-semibold uppercase tracking-wide text-zinc-500">Validate</div>
          <ol className="ml-4 list-decimal text-zinc-400">
            {plan.validationSteps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button onClick={copyFix} className="rounded bg-zinc-800 px-2 py-1 text-[10px] text-zinc-200 hover:bg-zinc-700">
          {copied ? 'Copied!' : 'Copy Fix'}
        </button>
        <button
          onClick={runAi}
          disabled={!aiAvailable || aiLoading}
          title={aiAvailable ? 'Generate a contextual fix with Claude' : 'Add a Claude API key in Settings to enable'}
          className={`rounded px-2 py-1 text-[10px] ${
            aiAvailable
              ? 'bg-brand text-white hover:bg-indigo-500'
              : 'cursor-not-allowed bg-zinc-900 text-zinc-600'
          }`}
        >
          {aiLoading ? 'Analyzing…' : aiPlan ? 'Regenerate (AI)' : 'AI Analysis'}
        </button>
        {aiPlan && (
          <button
            onClick={() => setAiPlan(null)}
            className="rounded bg-zinc-800 px-2 py-1 text-[10px] text-zinc-300 hover:bg-zinc-700"
          >
            Show template
          </button>
        )}
      </div>

      {aiError && <div className="text-[10px] text-severity-critical">{aiError}</div>}

      {plan.relatedResources.length > 0 && (
        <div className="flex flex-wrap gap-2 text-[10px]">
          {plan.relatedResources.map((res) => (
            <a key={res.url} href={res.url} target="_blank" rel="noreferrer" className="text-brand hover:underline">
              {res.title} ↗
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="shrink-0 text-zinc-500">{label}:</span>
      <span className="text-zinc-300">{value}</span>
    </div>
  );
}
