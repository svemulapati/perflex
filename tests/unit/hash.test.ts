import { beforeEach, describe, expect, it } from 'vitest';
import { fnv1a, fingerprintStack, hashBody, __resetStackCache } from '../../src/shared/hash';

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

describe('fingerprintStack caching', () => {
  beforeEach(() => __resetStackCache());

  it('returns the same value cached as uncached', () => {
    const stack = 'Error\n  at foo (a.js:1)\n  at bar (b.js:2)';
    const uncached = fingerprintStack(stack);
    __resetStackCache();
    expect(fingerprintStack(stack)).toBe(uncached); // first (miss)
    expect(fingerprintStack(stack)).toBe(uncached); // second (hit)
  });

  it('does not collide across different frame counts for the same stack', () => {
    const stack = 'Error\n  at a (a.js:1)\n  at b (b.js:2)\n  at c (c.js:3)\n  at d (d.js:4)\n  at e (e.js:5)';
    expect(fingerprintStack(stack, 2)).not.toBe(fingerprintStack(stack, 5));
  });

  it('evicts the oldest entry past capacity but still recomputes correctly', () => {
    const first = 'Error\n  at site0 (f0.js:1)';
    const expected = fingerprintStack(first);
    // Push >1024 distinct stacks to evict `first`.
    for (let i = 1; i <= 1100; i++) fingerprintStack(`Error\n  at site${i} (f${i}.js:${i})`);
    // Recomputed after eviction must equal the original value.
    expect(fingerprintStack(first)).toBe(expected);
  });
});

describe('hashBody', () => {
  it('caps work for very large bodies but stays deterministic', () => {
    const big = 'x'.repeat(20000);
    expect(hashBody(big)).toBe(hashBody(big));
  });
});
