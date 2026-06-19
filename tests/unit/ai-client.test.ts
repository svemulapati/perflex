import { describe, expect, it } from 'vitest';
import { buildPrompt, sanitizeFinding, toRemediation } from '../../src/shared/ai-client';
import type { PerformanceFinding } from '../../src/shared/types';

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
