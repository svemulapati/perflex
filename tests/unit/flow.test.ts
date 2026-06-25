// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import {
  generateSelector,
  redactValueLength,
  describeStep,
  parseFlow,
  serializeFlow,
  FLOW_SCHEMA_VERSION,
  type Flow,
} from '../../src/shared/flow';

afterEach(() => {
  document.body.innerHTML = '';
});

function el(html: string, sel: string): Element {
  document.body.innerHTML = html;
  return document.querySelector(sel)!;
}

describe('generateSelector priority chain', () => {
  it('prefers a unique id', () => {
    expect(generateSelector(el('<button id="pay">Pay</button>', '#pay'))).toBe('#pay');
  });

  it('falls to data-testid when there is no usable id', () => {
    expect(generateSelector(el('<button data-testid="cart">x</button>', 'button'))).toBe('[data-testid="cart"]');
  });

  it('falls to aria-label', () => {
    expect(generateSelector(el('<button aria-label="Add to cart">x</button>', 'button'))).toBe(
      'button[aria-label="Add to cart"]'
    );
  });

  it('falls to a unique class chain', () => {
    expect(generateSelector(el('<a class="nav primary">x</a>', 'a'))).toBe('a.nav.primary');
  });

  it('falls to an nth-of-type path anchored at the nearest id', () => {
    const node = el('<div id="root"><span>a</span><span>b</span></div>', '#root span:nth-of-type(2)');
    expect(generateSelector(node)).toBe('#root > span:nth-of-type(2)');
  });

  it('skips a non-unique id and uses a different strategy', () => {
    document.body.innerHTML = '<div id="dup" data-testid="first"></div><div id="dup"></div>';
    const first = document.querySelector('[data-testid="first"]')!;
    expect(generateSelector(first)).toBe('[data-testid="first"]');
  });
});

describe('helpers', () => {
  it('redactValueLength keeps only the length', () => {
    expect(redactValueLength('password123')).toBe(11);
  });

  it('describeStep produces readable guidance', () => {
    expect(describeStep({ action: 'click', selector: '#x', label: 'Add to cart', timestamp: 0 })).toBe('Click "Add to cart"');
    expect(describeStep({ action: 'type', selector: '#email', valueLength: 8, timestamp: 0 })).toContain('8 characters');
  });
});

describe('serialize / parse', () => {
  const flow: Flow = {
    id: 'flow-1', name: 'Checkout', createdAt: 123, url: 'https://shop.com/cart',
    steps: [{ action: 'click', selector: '#pay', timestamp: 0 }], schemaVersion: FLOW_SCHEMA_VERSION,
  };

  it('round-trips through serialize → parse', () => {
    expect(parseFlow(serializeFlow(flow))).toEqual(flow);
  });

  it('rejects a malformed flow file', () => {
    expect(() => parseFlow('{"nope":true}')).toThrow(/valid Perflex flow/);
  });

  it('drops malformed steps but keeps valid ones', () => {
    const json = JSON.stringify({ name: 'x', steps: [{ action: 'click', selector: '#a', timestamp: 1 }, { bogus: true }] });
    expect(parseFlow(json).steps).toHaveLength(1);
  });
});
