import type { PerformanceFinding, RemediationPlan } from './types';

const API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

export interface SanitizedFinding {
  pattern: string;
  category: string;
  filename: string;
  functionName?: string;
  lineNumber?: number;
  totalDurationMs: number;
  frequency: number;
  coreWebVital?: string;
  description: string;
}

/** Just the filename — never the full URL (may carry tokens / PII in query). */
function toFilename(url: string | undefined): string {
  if (!url) return 'unknown';
  try {
    const u = new URL(url);
    return u.pathname.split('/').filter(Boolean).pop() || u.hostname;
  } catch {
    return url.split('/').pop()?.split('?')[0] || 'unknown';
  }
}

/**
 * Strip a finding down to a non-identifying summary safe to send to the API.
 * No full URLs, no request/response bodies, no PII — only the shape of the issue.
 */
export function sanitizeFinding(finding: PerformanceFinding): SanitizedFinding {
  return {
    pattern: finding.patternName,
    category: finding.category,
    filename: toFilename(finding.evidence.scriptUrl),
    functionName: finding.evidence.functionName,
    lineNumber: finding.evidence.lineNumber ?? finding.evidence.charPosition,
    totalDurationMs: finding.impact.totalDuration,
    frequency: finding.impact.frequency,
    coreWebVital: finding.impact.coreWebVitalAffected,
    description: finding.description,
  };
}

export function buildPrompt(s: SanitizedFinding): string {
  return `You are a senior web performance engineer. Analyze this performance finding and provide a specific, actionable remediation.

FINDING:
- Pattern: ${s.pattern} (${s.category})
- Script: ${s.filename}${s.lineNumber !== undefined ? ` (around char/line ${s.lineNumber})` : ''}
- Function: ${s.functionName ?? 'n/a'}
- Impact: ${s.totalDurationMs}ms total across ${s.frequency} occurrence(s)${s.coreWebVital ? `, affects ${s.coreWebVital}` : ''}
- Context: ${s.description}

Respond with ONLY a JSON object (no markdown fence) of this exact shape:
{
  "rootCause": "2-3 sentence root-cause analysis",
  "before": "problematic code pattern",
  "after": "fixed code pattern",
  "language": "javascript|html|css|...",
  "risk": "safe|verify|review",
  "riskExplanation": "will this affect UI rendering or business logic?",
  "estimatedImpact": "estimated performance improvement",
  "validation": ["how to validate step 1", "step 2"],
  "businessSafety": "why this is safe for business logic"
}
Be specific and actionable. Do not give generic advice.`;
}

interface AiRaw {
  rootCause?: string;
  before?: string;
  after?: string;
  language?: string;
  risk?: string;
  riskExplanation?: string;
  estimatedImpact?: string;
  validation?: string[];
  businessSafety?: string;
}

function extractJson(text: string): AiRaw {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON in AI response');
  return JSON.parse(text.slice(start, end + 1)) as AiRaw;
}

export function toRemediation(raw: AiRaw, fallbackSummary: string): RemediationPlan {
  const risk = raw.risk === 'safe' || raw.risk === 'review' ? raw.risk : 'verify';
  return {
    source: 'ai',
    summary: raw.rootCause?.split('.')[0] ?? fallbackSummary,
    detailed: raw.rootCause ?? fallbackSummary,
    codeExample:
      raw.before && raw.after
        ? { before: raw.before, after: raw.after, language: raw.language ?? 'javascript' }
        : undefined,
    riskLevel: risk,
    riskExplanation: raw.riskExplanation ?? 'Review the change before shipping.',
    estimatedImpact: raw.estimatedImpact ?? 'Varies',
    validationSteps: Array.isArray(raw.validation) ? raw.validation : [],
    businessSafetyNote: raw.businessSafety ?? 'Verify behavior is unchanged.',
    relatedResources: [],
  };
}

export interface AiOptions {
  apiKey: string;
  model: string;
}

const cache = new Map<string, RemediationPlan>();

function cacheKey(s: SanitizedFinding): string {
  return `${s.pattern}|${s.filename}|${s.functionName ?? ''}`;
}

/** Generate a contextual remediation via the Claude API. Results are cached. */
export async function generateRemediation(
  finding: PerformanceFinding,
  opts: AiOptions
): Promise<RemediationPlan> {
  const sanitized = sanitizeFinding(finding);
  const key = cacheKey(sanitized);
  const cached = cache.get(key);
  if (cached) return cached;

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': opts.apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      // Required to call the API directly from a browser/extension context.
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: 1024,
      messages: [{ role: 'user', content: buildPrompt(sanitized) }],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Claude API error ${res.status}: ${detail.slice(0, 200)}`);
  }

  const data = (await res.json()) as { content?: Array<{ text?: string }> };
  const text = data.content?.map((c) => c.text ?? '').join('') ?? '';
  const plan = toRemediation(extractJson(text), finding.remediation?.summary ?? finding.patternName);
  cache.set(key, plan);
  return plan;
}
