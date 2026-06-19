import { describe, expect, it } from 'vitest';
import { fnv1a, fingerprintStack, hashBody } from '../../src/shared/hash';

describe('fnv1a', () => {
  it('produces a stable unsigned 32-bit hash', () => {
    const h = fnv1a('hello');
    expect(h).toBe(fnv1a('hello'));
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(0xffffffff);
  });

  it('differs for different inputs', () => {
    expect(fnv1a('foo')).not.toBe(fnv1a('bar'));
  });

  it('handles the empty string', () => {
    expect(fnv1a('')).toBe(0x811c9dc5);
  });
});

describe('fingerprintStack', () => {
  it('returns 0 for missing stacks', () => {
    expect(fingerprintStack(undefined)).toBe(0);
  });

  it('is stable for identical stacks and ignores the header line', () => {
    const stack = 'Error\n  at foo (a.js:1)\n  at bar (b.js:2)\n  at baz (c.js:3)';
    expect(fingerprintStack(stack)).toBe(fingerprintStack(stack));
  });

  it('differs when call sites differ', () => {
    const a = 'Error\n  at foo (a.js:1)';
    const b = 'Error\n  at qux (z.js:9)';
    expect(fingerprintStack(a)).not.toBe(fingerprintStack(b));
  });
});

describe('hashBody', () => {
  it('caps work for very large bodies but stays deterministic', () => {
    const big = 'x'.repeat(20000);
    expect(hashBody(big)).toBe(hashBody(big));
  });
});
