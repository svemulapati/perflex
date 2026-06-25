/**
 * User-flow recorder (Feature 4). Lives in the MAIN world so it can read the
 * real DOM for selector generation. It is INERT until the panel sends
 * `flow-record-start`: every listener early-returns when not recording, so the
 * idle cost is a single boolean check. Typed values are never captured — only
 * their length.
 */
import type { CollectorContext } from './context';
import { generateSelector, redactValueLength, type FlowStep } from '@/shared/flow';

export interface FlowRecorder {
  start: () => void;
  /** Re-arm on a freshly-loaded page mid-flow; records the navigation. */
  resume: () => void;
  stop: () => void;
  teardown: () => void;
}

/** A short human label for a step, from aria-label / text / placeholder. */
function labelFor(el: Element): string | undefined {
  const aria = el.getAttribute('aria-label');
  if (aria) return aria.trim().slice(0, 40);
  const text = (el.textContent || '').trim();
  if (text) return text.slice(0, 40);
  const ph = el.getAttribute('placeholder');
  if (ph) return ph.trim().slice(0, 40);
  return undefined;
}

export function setupFlowRecorder(ctx: CollectorContext, emit: (step: FlowStep) => void): FlowRecorder {
  let recording = false;
  let lastScroll = 0;

  const record = (step: Omit<FlowStep, 'timestamp'>) => {
    if (!recording) return;
    emit({ ...step, timestamp: performance.now() });
  };


  const onClick = (e: Event) =>
    ctx.measure(() => {
      if (!recording) return;
      const t = e.target as Element | null;
      if (!t || t.nodeType !== 1) return;
      record({ action: 'click', selector: generateSelector(t), label: labelFor(t) });
    });

  const onInput = (e: Event) =>
    ctx.measure(() => {
      if (!recording) return;
      const t = e.target as (HTMLInputElement | HTMLTextAreaElement) | null;
      if (!t || !('value' in t)) return;
      record({ action: 'type', selector: generateSelector(t), valueLength: redactValueLength(String(t.value ?? '')), label: labelFor(t) });
    });

  const onScroll = () =>
    ctx.measure(() => {
      if (!recording) return;
      const now = performance.now();
      if (now - lastScroll < 400) return; // throttle scroll noise
      lastScroll = now;
      record({ action: 'scroll', selector: 'window', scrollPosition: { x: window.scrollX, y: window.scrollY } });
    });

  const onPopstate = () =>
    ctx.measure(() => {
      if (recording) record({ action: 'navigate', selector: '', url: location.href });
    });

  // Patch history once so SPA pushState navigations are captured (only emits
  // while recording). Restored on teardown.
  const patchHistory = (name: 'pushState' | 'replaceState'): (() => void) => {
    const orig = history[name];
    try {
      history[name] = function (this: History, ...args: unknown[]) {
        const ret = (orig as (...a: unknown[]) => unknown).apply(this, args);
        if (recording) record({ action: 'navigate', selector: '', url: location.href });
        return ret;
      } as History[typeof name];
    } catch {
      /* Trusted Types / frozen history — skip */
    }
    return () => {
      try {
        history[name] = orig;
      } catch {
        /* ignore */
      }
    };
  };

  document.addEventListener('click', onClick, { capture: true, passive: true });
  document.addEventListener('input', onInput, { capture: true, passive: true });
  window.addEventListener('scroll', onScroll, { capture: true, passive: true });
  window.addEventListener('popstate', onPopstate);
  const unpatchPush = patchHistory('pushState');
  const unpatchReplace = patchHistory('replaceState');

  return {
    start() {
      recording = true;
    },
    resume() {
      // Idempotent: retries after a navigation must not emit duplicate steps.
      if (recording) return;
      recording = true;
      record({ action: 'navigate', selector: '', url: location.href });
    },
    stop() {
      recording = false;
    },
    teardown() {
      recording = false;
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('input', onInput, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('popstate', onPopstate);
      unpatchPush();
      unpatchReplace();
    },
  };
}
