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

/** Default backoff schedule: 2 retries after 1s then 3s (spec B.5). */
const RETRY_DELAYS_MS = [1000, 3000];

/** Map an HTTP status to a user-facing message — never a raw stack or body. */
export function friendlyApiError(status: number): string {
  if (status === 401 || status === 403)
    return 'Your API key was rejected. Check the key in Settings.';
  if (status === 429) return 'The AI service is rate-limiting requests right now. Try again in a moment.';
  if (status === 400) return 'The request was rejected — check your API key and selected model in Settings.';
  if (status >= 500) return 'The AI service is temporarily unavailable. Please try again shortly.';
  return `The AI service returned an unexpected error (${status}).`;
}

export type AiProvider = 'anthropic' | 'google';

/** Which provider + credentials to use for a request. */
export interface ChatConfig {
  provider: AiProvider;
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
}

const NETWORK_ERROR = 'Could not reach the AI service. Check your network connection and try again.';

export interface AiOptions {
  apiKey: string;
  model: string;
  /** Advanced/test hooks — omit in production. */
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<void>;
  retryDelaysMs?: number[];
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * POST to the Claude API with bounded exponential backoff. Retries only on
 * transient failures (network error, 429, 5xx); fails fast on auth/client
 * errors. Always throws a user-friendly Error — never a raw stack.
 */
export async function postToClaude(body: object, opts: AiOptions): Promise<string> {
  const doFetch = opts.fetchImpl ?? fetch;
  const doSleep = opts.sleepImpl ?? defaultSleep;
  const delays = opts.retryDelaysMs ?? RETRY_DELAYS_MS;

  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await doFetch(API_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': opts.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
          // Required to call the API directly from a browser/extension context.
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify(body),
      });
    } catch {
      // Network-level failure (offline, DNS, CORS) — retriable.
      if (attempt >= delays.length)
        throw new Error(NETWORK_ERROR);
      await doSleep(delays[attempt]);
      continue;
    }

    if (res.ok) {
      const data = (await res.json().catch(() => ({}))) as { content?: Array<{ text?: string }> };
      return data.content?.map((c) => c.text ?? '').join('') ?? '';
    }

    const retriable = res.status === 429 || res.status >= 500;
    if (retriable && attempt < delays.length) {
      await doSleep(delays[attempt]);
      continue;
    }
    throw new Error(friendlyApiError(res.status));
  }
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

/** Extract appended text from one SSE `data:` JSON payload (pure, testable). */
export function sseTextDelta(jsonPayload: string): string {
  try {
    const ev = JSON.parse(jsonPayload) as { type?: string; delta?: { type?: string; text?: string } };
    if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') return ev.delta.text ?? '';
  } catch {
    /* keep-alive pings / non-JSON lines */
  }
  return '';
}

export interface StreamOptions {
  apiKey: string;
  model: string;
  system: string;
  messages: ChatTurn[];
  onText: (chunk: string) => void;
  maxTokens?: number;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

/**
 * Stream a Claude chat completion, invoking onText for each token chunk.
 * Resolves with the full text. Throws a user-friendly Error — never a raw stack.
 */
export async function streamClaude(opts: StreamOptions): Promise<string> {
  const doFetch = opts.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await doFetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': opts.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: opts.model,
        max_tokens: opts.maxTokens ?? 1024,
        system: opts.system,
        messages: opts.messages,
        stream: true,
      }),
      signal: opts.signal,
    });
  } catch {
    throw new Error(NETWORK_ERROR);
  }
  if (!res.ok) throw new Error(friendlyApiError(res.status));

  // Fallback if the environment didn't give us a readable stream.
  if (!res.body) {
    const data = (await res.json().catch(() => ({}))) as { content?: Array<{ text?: string }> };
    const text = data.content?.map((c) => c.text ?? '').join('') ?? '';
    if (text) opts.onText(text);
    return text;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line.startsWith('data:')) {
        const chunk = sseTextDelta(line.slice(5).trim());
        if (chunk) {
          full += chunk;
          opts.onText(chunk);
        }
      }
    }
  }
  return full;
}

/* ---------------------------------------------------------------------------
 * Google Gemini (free tier) — same chat surface, different wire format.
 * API key travels in the query string; system prompt via systemInstruction;
 * assistant turns use the "model" role.
 * ------------------------------------------------------------------------- */

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Extract text from one Gemini SSE `data:` JSON payload (pure, testable). */
export function geminiSseText(jsonPayload: string): string {
  try {
    const ev = JSON.parse(jsonPayload) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const parts = ev.candidates?.[0]?.content?.parts;
    if (Array.isArray(parts)) return parts.map((p) => p.text ?? '').join('');
  } catch {
    /* non-JSON line */
  }
  return '';
}

function geminiBody(system: string | undefined, messages: ChatTurn[], maxTokens: number): string {
  return JSON.stringify({
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
    generationConfig: { maxOutputTokens: maxTokens },
  });
}

async function geminiComplete(cfg: ChatConfig, system: string | undefined, messages: ChatTurn[], maxTokens: number): Promise<string> {
  const doFetch = cfg.fetchImpl ?? fetch;
  const url = `${GEMINI_BASE}/${cfg.model}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`;
  let res: Response;
  try {
    res = await doFetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: geminiBody(system, messages, maxTokens) });
  } catch {
    throw new Error(NETWORK_ERROR);
  }
  if (!res.ok) throw new Error(friendlyApiError(res.status));
  const data = (await res.json().catch(() => ({}))) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  return data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
}

async function geminiStream(cfg: ChatConfig, req: ChatRequest): Promise<string> {
  const doFetch = cfg.fetchImpl ?? fetch;
  const url = `${GEMINI_BASE}/${cfg.model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(cfg.apiKey)}`;
  let res: Response;
  try {
    res = await doFetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: geminiBody(req.system, req.messages, req.maxTokens ?? 1024), signal: req.signal });
  } catch {
    throw new Error(NETWORK_ERROR);
  }
  if (!res.ok) throw new Error(friendlyApiError(res.status));
  if (!res.body) {
    const text = await geminiComplete(cfg, req.system, req.messages, req.maxTokens ?? 1024);
    if (text) req.onText(text);
    return text;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line.startsWith('data:')) {
        const chunk = geminiSseText(line.slice(5).trim());
        if (chunk) {
          full += chunk;
          req.onText(chunk);
        }
      }
    }
  }
  return full;
}

/* ---- Provider-agnostic entry points ---- */

export interface ChatRequest {
  system: string;
  messages: ChatTurn[];
  onText: (chunk: string) => void;
  maxTokens?: number;
  signal?: AbortSignal;
}

/** Stream a chat completion from whichever provider the config selects. */
export function streamChat(cfg: ChatConfig, req: ChatRequest): Promise<string> {
  if (cfg.provider === 'google') return geminiStream(cfg, req);
  return streamClaude({ apiKey: cfg.apiKey, model: cfg.model, fetchImpl: cfg.fetchImpl, system: req.system, messages: req.messages, onText: req.onText, maxTokens: req.maxTokens, signal: req.signal });
}

/** Non-streaming chat completion from whichever provider the config selects. */
export function completeChat(cfg: ChatConfig, system: string | undefined, messages: ChatTurn[], maxTokens = 1024): Promise<string> {
  if (cfg.provider === 'google') return geminiComplete(cfg, system, messages, maxTokens);
  return postToClaude(
    { model: cfg.model, max_tokens: maxTokens, ...(system ? { system } : {}), messages },
    { apiKey: cfg.apiKey, model: cfg.model, fetchImpl: cfg.fetchImpl }
  );
}

const cache = new Map<string, RemediationPlan>();

function cacheKey(s: SanitizedFinding): string {
  return `${s.pattern}|${s.filename}|${s.functionName ?? ''}`;
}

/** Generate a contextual remediation via the configured provider. Cached. */
export async function generateRemediation(
  finding: PerformanceFinding,
  cfg: ChatConfig
): Promise<RemediationPlan> {
  const sanitized = sanitizeFinding(finding);
  const key = `${cfg.provider}|${cacheKey(sanitized)}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const text = await completeChat(cfg, undefined, [{ role: 'user', content: buildPrompt(sanitized) }]);

  const plan = toRemediation(extractJson(text), finding.remediation?.summary ?? finding.patternName);
  cache.set(key, plan);
  return plan;
}
