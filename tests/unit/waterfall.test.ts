import { describe, expect, it } from 'vitest';
import {
  categorizeResource,
  waterfallSegments,
  isCacheServed,
  fileName,
  isFirstParty,
} from '../../src/shared/waterfall';

describe('categorizeResource', () => {
  it('uses initiator type first', () => {
    expect(categorizeResource('script', 'https://x.com/a')).toBe('js');
    expect(categorizeResource('img', 'https://x.com/a')).toBe('image');
    expect(categorizeResource('fetch', 'https://x.com/api')).toBe('xhr');
    expect(categorizeResource('xmlhttprequest', 'https://x.com/api')).toBe('xhr');
  });

  it('distinguishes fonts from css for link initiators', () => {
    expect(categorizeResource('link', 'https://x.com/font.woff2')).toBe('font');
    expect(categorizeResource('link', 'https://x.com/style.css')).toBe('css');
  });

  it('falls back to the URL extension when initiator is vague', () => {
    expect(categorizeResource('other', 'https://x.com/app.mjs?v=2')).toBe('js');
    expect(categorizeResource('', 'https://x.com/logo.svg')).toBe('image');
    expect(categorizeResource('other', 'https://x.com/data')).toBe('other');
  });
});

describe('waterfallSegments', () => {
  it('returns only non-empty phases in order', () => {
    const segs = waterfallSegments({ dns: 5, tcp: 0, tls: 0, ttfb: 30, download: 12, duration: 47 });
    expect(segs.map((s) => s.label)).toEqual(['DNS', 'TTFB', 'Download']);
  });

  it('represents a cache/SW-served request as one neutral segment', () => {
    const segs = waterfallSegments({ dns: 0, tcp: 0, tls: 0, ttfb: 0, download: 0, duration: 3 });
    expect(segs).toHaveLength(1);
    expect(segs[0].label).toBe('cached');
  });
});

describe('isCacheServed', () => {
  it('is true only when every connection phase is zero', () => {
    expect(isCacheServed({ dns: 0, tcp: 0, tls: 0, ttfb: 0 })).toBe(true);
    expect(isCacheServed({ dns: 0, tcp: 0, tls: 0, ttfb: 5 })).toBe(false);
  });
});

describe('url helpers', () => {
  it('fileName strips path + query', () => {
    expect(fileName('https://cdn.x.com/a/b/app.min.js?v=9')).toBe('app.min.js');
    expect(fileName('https://cdn.x.com/')).toBe('cdn.x.com');
  });

  it('isFirstParty compares origins', () => {
    expect(isFirstParty('https://site.com/a.js', 'https://site.com/page')).toBe(true);
    expect(isFirstParty('https://cdn.other.com/a.js', 'https://site.com/page')).toBe(false);
  });
});
