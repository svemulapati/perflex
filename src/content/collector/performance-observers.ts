import type {
  CollectorEvent,
  FirstInputEvent,
  InteractionTimingEvent,
  LCPEvent,
  LayoutShiftEvent,
  LoAFScript,
  LongAnimationFrameEvent,
  LongTaskEvent,
  NavigationEvent,
  PaintEvent,
  ResourceEvent,
} from '@/shared/types';
import type { CollectorContext } from './context';

/** Feature-detect a PerformanceObserver entry type before registering. */
function supportsEntryType(type: string): boolean {
  const supported = (PerformanceObserver as unknown as { supportedEntryTypes?: string[] })
    .supportedEntryTypes;
  return Array.isArray(supported) ? supported.includes(type) : false;
}

function observe(
  type: string,
  cb: (entries: PerformanceEntryList) => void,
  extra?: PerformanceObserverInit
): PerformanceObserver | null {
  if (!supportsEntryType(type)) return null;
  try {
    const obs = new PerformanceObserver((list) => cb(list.getEntries()));
    obs.observe({ type, buffered: true, ...extra });
    return obs;
  } catch {
    return null;
  }
}

export function setupPerformanceObservers(ctx: CollectorContext): () => void {
  const observers: PerformanceObserver[] = [];
  const add = (o: PerformanceObserver | null) => {
    if (o) observers.push(o);
  };

  // resource — network timing, filtered for scripts downstream.
  add(
    observe('resource', (entries) =>
      ctx.measure(() => {
        if (!ctx.isEnabled('resource')) return;
        for (const e of entries) {
          const r = e as PerformanceResourceTiming;
          const event: ResourceEvent = {
            seq: 0,
            kind: 'resource',
            timestamp: r.startTime,
            url: r.name,
            initiatorType: r.initiatorType,
            startTime: r.startTime,
            duration: r.duration,
            transferSize: r.transferSize,
            encodedBodySize: r.encodedBodySize,
            decodedBodySize: r.decodedBodySize,
            renderBlockingStatus: (r as unknown as { renderBlockingStatus?: string })
              .renderBlockingStatus,
            dns: r.domainLookupEnd - r.domainLookupStart,
            tcp: r.connectEnd - r.connectStart,
            tls: r.secureConnectionStart > 0 ? r.connectEnd - r.secureConnectionStart : 0,
            ttfb: r.responseStart - r.requestStart,
            download: r.responseEnd - r.responseStart,
            responseStatus: (r as unknown as { responseStatus?: number }).responseStatus,
          };
          ctx.emit(event);
        }
      })
    )
  );

  // longtask — primary signal for main-thread jank.
  add(
    observe('longtask', (entries) =>
      ctx.measure(() => {
        for (const e of entries) {
          const t = e as PerformanceEntry & {
            attribution?: Array<{
              containerType?: string;
              containerSrc?: string;
              containerId?: string;
              containerName?: string;
            }>;
          };
          const event: LongTaskEvent = {
            seq: 0,
            kind: 'longtask',
            timestamp: t.startTime,
            startTime: t.startTime,
            duration: t.duration,
            attribution: (t.attribution ?? []).map((a) => ({
              containerType: a.containerType,
              containerSrc: a.containerSrc,
              containerId: a.containerId,
              containerName: a.containerName,
            })),
          };
          ctx.emit(event);
        }
      })
    )
  );

  // long-animation-frame — richer, function-level attribution when available.
  add(
    observe('long-animation-frame', (entries) =>
      ctx.measure(() => {
        if (!ctx.isEnabled('loaf')) return;
        for (const e of entries) {
          const loaf = e as PerformanceEntry & {
            blockingDuration?: number;
            scripts?: Array<{
              sourceURL?: string;
              name?: string;
              sourceFunctionName?: string;
              sourceCharPosition?: number;
              duration: number;
              invoker?: string;
              invokerType?: string;
            }>;
            styleAndLayoutDuration?: number;
          };
          const scripts: LoAFScript[] = (loaf.scripts ?? []).map((s) => ({
            sourceURL: s.sourceURL ?? s.name ?? '',
            sourceFunctionName: s.sourceFunctionName ?? '(anonymous)',
            sourceCharPosition: s.sourceCharPosition ?? -1,
            duration: s.duration,
            invoker: s.invoker,
            invokerType: s.invokerType,
          }));
          const scriptDuration = scripts.reduce((sum, s) => sum + s.duration, 0);
          const event: LongAnimationFrameEvent = {
            seq: 0,
            kind: 'long-animation-frame',
            timestamp: loaf.startTime,
            startTime: loaf.startTime,
            duration: loaf.duration,
            blockingDuration: loaf.blockingDuration ?? 0,
            scriptDuration,
            styleAndLayoutDuration: loaf.styleAndLayoutDuration ?? 0,
            scripts,
          };
          ctx.emit(event);
        }
      })
    )
  );

  // event — Interaction to Next Paint inputs.
  add(
    observe(
      'event',
      (entries) =>
        ctx.measure(() => {
          if (!ctx.isEnabled('event')) return;
          for (const e of entries) {
            const ev = e as PerformanceEventTiming & { interactionId?: number };
            if (!ev.interactionId) continue; // only events tied to an interaction
            const event: InteractionTimingEvent = {
              seq: 0,
              kind: 'event',
              timestamp: ev.startTime,
              name: ev.name,
              startTime: ev.startTime,
              duration: ev.duration,
              processingStart: ev.processingStart,
              processingEnd: ev.processingEnd,
              interactionId: ev.interactionId,
            };
            ctx.emit(event);
          }
        }),
      { durationThreshold: 16 } as PerformanceObserverInit
    )
  );

  // largest-contentful-paint
  add(
    observe('largest-contentful-paint', (entries) =>
      ctx.measure(() => {
        const last = entries[entries.length - 1] as
          | (PerformanceEntry & {
              renderTime?: number;
              loadTime?: number;
              size?: number;
              url?: string;
              element?: Element;
            })
          | undefined;
        if (!last) return;
        const event: LCPEvent = {
          seq: 0,
          kind: 'lcp',
          timestamp: last.startTime,
          renderTime: last.renderTime ?? 0,
          loadTime: last.loadTime ?? 0,
          size: last.size ?? 0,
          elementTag: last.element?.tagName?.toLowerCase(),
          url: last.url,
        };
        ctx.emit(event);
      })
    )
  );

  // layout-shift — CLS with source attribution.
  add(
    observe('layout-shift', (entries) =>
      ctx.measure(() => {
        if (!ctx.isEnabled('layout-shift')) return;
        for (const e of entries) {
          const ls = e as PerformanceEntry & {
            value?: number;
            hadRecentInput?: boolean;
            lastInputTime?: number;
            sources?: Array<{ node?: Node }>;
          };
          const event: LayoutShiftEvent = {
            seq: 0,
            kind: 'layout-shift',
            timestamp: ls.startTime,
            value: ls.value ?? 0,
            hadRecentInput: ls.hadRecentInput ?? false,
            lastInputTime: ls.lastInputTime ?? 0,
            sources: (ls.sources ?? []).map((s) => {
              const el = s.node as Element | undefined;
              return {
                nodeName: el?.nodeName?.toLowerCase(),
                nodeDescription: el?.id
                  ? `#${el.id}`
                  : el?.className && typeof el.className === 'string'
                    ? `.${el.className.split(' ')[0]}`
                    : undefined,
              };
            }),
          };
          ctx.emit(event);
        }
      })
    )
  );

  // first-input
  add(
    observe('first-input', (entries) =>
      ctx.measure(() => {
        const fi = entries[0] as PerformanceEventTiming | undefined;
        if (!fi) return;
        const event: FirstInputEvent = {
          seq: 0,
          kind: 'first-input',
          timestamp: fi.startTime,
          name: fi.name,
          startTime: fi.startTime,
          processingStart: fi.processingStart,
          duration: fi.duration,
        };
        ctx.emit(event);
      })
    )
  );

  // paint — FP / FCP
  add(
    observe('paint', (entries) =>
      ctx.measure(() => {
        for (const e of entries) {
          const event: PaintEvent = {
            seq: 0,
            kind: 'paint',
            timestamp: e.startTime,
            name: e.name as PaintEvent['name'],
            startTime: e.startTime,
          };
          ctx.emit(event);
        }
      })
    )
  );

  // navigation — full load waterfall
  add(
    observe('navigation', (entries) =>
      ctx.measure(() => {
        const nav = entries[0] as PerformanceNavigationTiming | undefined;
        if (!nav) return;
        const event: NavigationEvent = {
          seq: 0,
          kind: 'navigation',
          timestamp: nav.startTime,
          domContentLoaded: nav.domContentLoadedEventEnd,
          loadEventEnd: nav.loadEventEnd,
          responseEnd: nav.responseEnd,
          type: nav.type,
        };
        ctx.emit(event);
      })
    )
  );

  return () => {
    for (const o of observers) {
      try {
        o.disconnect();
      } catch {
        /* ignore */
      }
    }
  };
}

export type { CollectorEvent };
