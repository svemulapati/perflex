import { describe, expect, it } from 'vitest';
import { RingBuffer } from '../../src/shared/ring-buffer';

describe('RingBuffer', () => {
  it('preserves insertion order until full', () => {
    const rb = new RingBuffer<number>(5);
    rb.push(1);
    rb.push(2);
    rb.push(3);
    expect(rb.toArray()).toEqual([1, 2, 3]);
    expect(rb.size).toBe(3);
    expect(rb.isFull).toBe(false);
  });

  it('overwrites oldest entries once full', () => {
    const rb = new RingBuffer<number>(3);
    [1, 2, 3, 4, 5].forEach((n) => rb.push(n));
    expect(rb.isFull).toBe(true);
    expect(rb.toArray()).toEqual([3, 4, 5]);
  });

  it('drains and resets', () => {
    const rb = new RingBuffer<number>(3);
    rb.push(7);
    rb.push(8);
    expect(rb.drain()).toEqual([7, 8]);
    expect(rb.size).toBe(0);
    expect(rb.toArray()).toEqual([]);
  });

  it('rejects invalid capacity', () => {
    expect(() => new RingBuffer<number>(0)).toThrow();
  });
});
