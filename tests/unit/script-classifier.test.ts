import { describe, expect, it } from 'vitest';
import { classifyScript } from '../../src/shared/script-classifier';

const ORIGIN = 'https://example.com';

describe('classifyScript', () => {
  it('marks same-origin scripts as first-party', () => {
    const c = classifyScript('https://example.com/app.js', ORIGIN);
    expect(c.classification).toBe('first-party');
    expect(c.origin).toBe(ORIGIN);
  });

  it('honors the first-party allowlist', () => {
    const c = classifyScript('https://cdn.example.com/app.js', ORIGIN, ['https://cdn.example.com']);
    expect(c.classification).toBe('first-party');
  });

  it('identifies known third-party scripts with a category', () => {
    const c = classifyScript('https://www.googletagmanager.com/gtm.js?id=GTM-X', ORIGIN);
    expect(c.classification).toBe('third-party-known');
    expect(c.category).toBe('tag-manager');
    expect(c.thirdPartyName).toBe('Google Tag Manager');
  });

  it('falls back to third-party-unknown for unrecognized origins', () => {
    const c = classifyScript('https://random-cdn.io/widget.js', ORIGIN);
    expect(c.classification).toBe('third-party-unknown');
  });

  it('treats inline markers as inline', () => {
    const c = classifyScript('inline:script-1', ORIGIN);
    expect(c.classification).toBe('inline');
  });
});
