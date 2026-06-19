import type { InteractionTriggerEvent } from '@/shared/types';
import type { CollectorContext } from './context';

const TRIGGER_EVENTS = ['click', 'keydown', 'touchstart', 'pointerdown', 'submit', 'change'];

let counter = 0;
function nextId(): string {
  return `int-${Date.now().toString(36)}-${(++counter).toString(36)}`;
}

function describeTarget(target: EventTarget | null): string {
  if (!(target instanceof Element)) return 'unknown';
  const tag = target.tagName.toLowerCase();
  if (target.id) return `${tag}#${target.id}`;
  const cls =
    typeof target.className === 'string' && target.className
      ? `.${target.className.trim().split(/\s+/)[0]}`
      : '';
  return `${tag}${cls}`;
}

/**
 * Emits a trigger marker on each user input. The correlator uses these markers
 * to bound interaction sessions (all events until a quiet window). Session
 * assembly itself lives in the worker.
 */
export function setupInteractionTracker(ctx: CollectorContext): () => void {
  const handler = (e: Event) =>
    ctx.measure(() => {
      const event: InteractionTriggerEvent = {
        seq: 0,
        kind: 'interaction',
        timestamp: performance.now(),
        interactionId: nextId(),
        inputType: e.type,
        target: describeTarget(e.target),
      };
      ctx.emit(event);
    });

  for (const type of TRIGGER_EVENTS) {
    window.addEventListener(type, handler, { capture: true, passive: true });
  }

  return () => {
    for (const type of TRIGGER_EVENTS) {
      window.removeEventListener(type, handler, { capture: true });
    }
  };
}
