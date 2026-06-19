import type { MutationSummary } from '@/shared/types';
import type { CollectorContext } from './context';

/**
 * Observes DOM mutations but never records them individually. Mutations are
 * batched in a microtask and summarized per flush, keeping overhead bounded.
 */
export function setupDomMutationTracker(ctx: CollectorContext): () => void {
  let added = 0;
  let removed = 0;
  let attrs = 0;
  let maxDepth = 0;
  let scheduled = false;

  const depthOf = (node: Node): number => {
    let d = 0;
    let cur: Node | null = node;
    while (cur && d < 64) {
      cur = cur.parentNode;
      d++;
    }
    return d;
  };

  const flush = () => {
    scheduled = false;
    if (!ctx.isEnabled('mutation')) {
      added = removed = attrs = maxDepth = 0;
      return;
    }
    if (added === 0 && removed === 0 && attrs === 0) return;
    const event: MutationSummary = {
      seq: 0,
      kind: 'mutation',
      timestamp: performance.now(),
      addedNodes: added,
      removedNodes: removed,
      attributeChanges: attrs,
      targetDepth: maxDepth,
    };
    ctx.emit(event);
    added = removed = attrs = maxDepth = 0;
  };

  const observer = new MutationObserver((mutations) =>
    ctx.measure(() => {
      for (const m of mutations) {
        if (m.type === 'childList') {
          added += m.addedNodes.length;
          removed += m.removedNodes.length;
        } else if (m.type === 'attributes' || m.type === 'characterData') {
          attrs++;
        }
        maxDepth = Math.max(maxDepth, depthOf(m.target));
      }
      if (!scheduled) {
        scheduled = true;
        queueMicrotask(flush);
      }
    })
  );

  const start = () => {
    try {
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
      });
    } catch {
      /* documentElement not ready — retry on DOMContentLoaded */
      document.addEventListener('DOMContentLoaded', start, { once: true });
    }
  };

  if (document.documentElement) start();
  else document.addEventListener('DOMContentLoaded', start, { once: true });

  return () => observer.disconnect();
}
