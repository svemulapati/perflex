import type { ReflowEvent } from '@/shared/types';
import { fingerprintStack } from '@/shared/hash';
import type { CollectorContext } from './context';

/**
 * Detects forced synchronous layout ("layout thrashing"): reading a geometry
 * property after a style write, within the same synchronous block.
 *
 * We intercept the layout-triggering getters on HTMLElement.prototype and the
 * common methods (getBoundingClientRect, getComputedStyle). A module-level
 * "dirty" flag is set on any style write and cleared each microtask; reading a
 * geometry property while dirty is a forced reflow.
 */

const LAYOUT_READ_PROPS = [
  'offsetTop',
  'offsetLeft',
  'offsetWidth',
  'offsetHeight',
  'offsetParent',
  'clientTop',
  'clientLeft',
  'clientWidth',
  'clientHeight',
  'scrollTop',
  'scrollLeft',
  'scrollWidth',
  'scrollHeight',
] as const;

export function setupLayoutThrashDetector(ctx: CollectorContext): () => void {
  let dirty = false;
  let lastWrite: string | undefined;
  let microtaskQueued = false;

  const markClean = () => {
    dirty = false;
    lastWrite = undefined;
    microtaskQueued = false;
  };

  const markDirty = (what: string) => {
    try {
      lastWrite = what;
      dirty = true;
      if (!microtaskQueued) {
        microtaskQueued = true;
        queueMicrotask(markClean);
      }
    } catch {
      /* never disturb the host page */
    }
  };

  // Bookkeeping that must NEVER throw into the page's call stack — any error
  // here is swallowed so the wrapped builtin behaves exactly like the original.
  const onRead = (property: string) => {
    try {
      if (!dirty) return;
      if (!ctx.isEnabled('reflow')) return;
      const event: ReflowEvent = {
        seq: 0,
        kind: 'reflow',
        timestamp: performance.now(),
        fingerprint: fingerprintStack(new Error().stack),
        property,
        precedingWrite: lastWrite,
      };
      ctx.emit(event);
    } catch {
      /* never disturb the host page */
    }
  };

  const restorers: Array<() => void> = [];

  // Intercept geometry getters.
  for (const prop of LAYOUT_READ_PROPS) {
    const proto = HTMLElement.prototype as unknown as object;
    const descriptor =
      Object.getOwnPropertyDescriptor(proto, prop) ??
      Object.getOwnPropertyDescriptor(Element.prototype, prop);
    if (!descriptor?.get) continue;
    const originalGet = descriptor.get;
    const target = Object.getOwnPropertyDescriptor(proto, prop) ? proto : Element.prototype;
    try {
      Object.defineProperty(target, prop, {
        ...descriptor,
        get(this: Element) {
          onRead(prop);
          return originalGet.call(this);
        },
      });
      restorers.push(() => Object.defineProperty(target, prop, descriptor));
    } catch {
      /* some props may be non-configurable */
    }
  }

  // Intercept geometry methods.
  const origGetBCR = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (this: Element) {
    onRead('getBoundingClientRect');
    return origGetBCR.call(this);
  };
  restorers.push(() => {
    Element.prototype.getBoundingClientRect = origGetBCR;
  });

  const origGCS = window.getComputedStyle;
  window.getComputedStyle = function (...args: Parameters<typeof getComputedStyle>) {
    onRead('getComputedStyle');
    // Always invoke on `window`. Sites frequently call bare `getComputedStyle(el)`,
    // where `this` is undefined under strict mode — applying that would throw
    // "Illegal invocation" inside the page's own code.
    return origGCS.apply(window, args);
  } as typeof getComputedStyle;
  restorers.push(() => {
    window.getComputedStyle = origGCS;
  });

  // Detect writes: setting element.style.* and className / style attribute.
  const styleDesc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'style');
  // CSSStyleDeclaration.setProperty covers el.style.foo = ... in most engines via setProperty? No —
  // direct property assignment goes through named setters. We hook setProperty + className/setAttribute.
  const origSetProperty = CSSStyleDeclaration.prototype.setProperty;
  CSSStyleDeclaration.prototype.setProperty = function (
    this: CSSStyleDeclaration,
    ...args: Parameters<typeof origSetProperty>
  ) {
    markDirty(`style.${args[0]}`);
    return origSetProperty.apply(this, args);
  };
  restorers.push(() => {
    CSSStyleDeclaration.prototype.setProperty = origSetProperty;
  });

  // cssText assignment.
  const cssTextDesc = Object.getOwnPropertyDescriptor(CSSStyleDeclaration.prototype, 'cssText');
  if (cssTextDesc?.set) {
    const origSet = cssTextDesc.set;
    Object.defineProperty(CSSStyleDeclaration.prototype, 'cssText', {
      ...cssTextDesc,
      set(this: CSSStyleDeclaration, v: string) {
        markDirty('style.cssText');
        origSet.call(this, v);
      },
    });
    restorers.push(() =>
      Object.defineProperty(CSSStyleDeclaration.prototype, 'cssText', cssTextDesc)
    );
  }

  // className setter.
  const classNameDesc = Object.getOwnPropertyDescriptor(Element.prototype, 'className');
  if (classNameDesc?.set) {
    const origSet = classNameDesc.set;
    Object.defineProperty(Element.prototype, 'className', {
      ...classNameDesc,
      set(this: Element, v: string) {
        markDirty('className');
        origSet.call(this, v);
      },
    });
    restorers.push(() => Object.defineProperty(Element.prototype, 'className', classNameDesc));
  }

  // setAttribute('style'|'class', ...)
  const origSetAttribute = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (this: Element, name: string, value: string) {
    if (name === 'style' || name === 'class') markDirty(`setAttribute(${name})`);
    return origSetAttribute.call(this, name, value);
  };
  restorers.push(() => {
    Element.prototype.setAttribute = origSetAttribute;
  });

  void styleDesc; // reserved for future direct-style-prop hooking

  return () => {
    for (const restore of restorers) {
      try {
        restore();
      } catch {
        /* ignore */
      }
    }
  };
}
