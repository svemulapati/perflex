import { describe, expect, it, vi } from 'vitest';
import {
  buildPrompt,
  friendlyApiError,
  postToClaude,
  sanitizeFinding,
  toRemediation,
} from '../../src/shared/ai-client';
import type { PerformanceFinding } from '../../src/shared/types';

/** Minimal Response stand-in (jsdom has no global Response in node env). */
function fakeResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  } as Response;
}

const okBody = { content: [{ text: 'hello' }] };
const noSleep = async () => {};

const finding: PerformanceFinding = {
  id: 'x',
  patternId: 'layout-thrashing',
  patternName: 'Layout Thrashing',
  category: 'execution',
  severity: 'critical',
  confidence: 0.8,
  description: 'Interleaved reads/writes',
  evidence: {
    scriptUrl: 'https://example.com/app/bundle.js?token=SECRET123&user=alice',
    functionName: 'render',
    charPosition: 42,
    sampleEntries: [{ secret: 'do-not-send' }],
  },
  impact: { frequency: 8, totalDuration: 120, affectedInteractions: [], estimatedUserImpact: 'high', coreWebVitalAffected: 'INP' },
};

describe('sanitizeFinding', () => {
  it('reduces the script URL to a bare filename (no query string / tokens)', () => {
    const s = sanitizeFinding(finding);
    expect(s.filename).toBe('bundle.js');
    expect(JSON.stringify(s)).not.toContain('SECRET123');
    expect(JSON.stringify(s)).not.toContain('alice');
  });

  it('does not carry raw evidence sampleEntries', () => {
    const s = sanitizeFinding(finding);
    expect(JSON.stringify(s)).not.toContain('do-not-send');
  });
});

describe('buildPrompt', () => {
  it('includes the pattern, filename, and impact but not the full URL', () => {
    const prompt = buildPrompt(sanitizeFinding(finding));
    expect(prompt).toContain('Layout Thrashing');
    expect(prompt).toContain('bundle.js');
    expect(prompt).toContain('120ms');
    expect(prompt).not.toContain('SECRET123');
  });
});

describe('toRemediation', () => {
  it('maps a valid AI JSON object into a RemediationPlan', () => {
    const plan = toRemediation(
      {
        rootCause: 'Reads after writes force layout. Batch them.',
        before: 'a',
        after: 'b',
        language: 'javascript',
        risk: 'safe',
        riskExplanation: 'no change',
        estimatedImpact: '50ms',
        validation: ['check'],
        businessSafety: 'safe',
      },
      'fallback'
    );
    expect(plan.source).toBe('ai');
    expect(plan.riskLevel).toBe('safe');
    expect(plan.codeExample?.after).toBe('b');
    expect(plan.validationSteps).toEqual(['check']);
  });

  it('defaults risk to verify for unknown values', () => {
    const plan = toRemediation({ rootCause: 'x', risk: 'nonsense' }, 'fallback');
    expect(plan.riskLevel).toBe('verify');
  });
});

describe('friendlyApiError', () => {
  it('never leaks raw detail and covers the key statuses', () => {
    expect(friendlyApiError(401)).toMatch(/key/i);
    expect(friendlyApiError(429)).toMatch(/rate/i);
    expect(friendlyApiError(503)).toMatch(/unavailable/i);
    expect(friendlyApiError(418)).toMatch(/unexpected/i);
  });
});

describe('postToClaude retry/backoff', () => {
  const opts = (fetchImpl: typeof fetch) => ({
    apiKey: 'k',
    model: 'm',
    fetchImpl,
    sleepImpl: noSleep,
    retryDelaysMs: [0, 0],
  });

  it('returns concatenated text on first success', async () => {
    const f = vi.fn(async () => fakeResponse(200, okBody)) as unknown as typeof fetch;
    expect(await postToClaude({}, opts(f))).toBe('hello');
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('retries on 503 then succeeds', async () => {
    let n = 0;
    const f = vi.fn(async () => {
      n++;
      return n < 3 ? fakeResponse(503, 'down') : fakeResponse(200, okBody);
    }) as unknown as typeof fetch;
    expect(await postToClaude({}, opts(f))).toBe('hello');
    expect(f).toHaveBeenCalledTimes(3);
  });

  it('fails fast on 401 without retrying', async () => {
    const f = vi.fn(async () => fakeResponse(401, 'bad key')) as unknown as typeof fetch;
    await expect(postToClaude({}, opts(f))).rejects.toThrow(/key/i);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('retries network errors then throws a friendly message', async () => {
    const f = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    await expect(postToClaude({}, opts(f))).rejects.toThrow(/network/i);
    expect(f).toHaveBeenCalledTimes(3); // initial + 2 retries
  });
});
