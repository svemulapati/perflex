import type { ExportBundle, InteractionSession } from '../types';

/**
 * OpenTelemetry OTLP/JSON trace export. Each interaction session becomes one
 * trace; events within it become child spans. Compatible with Jaeger, Tempo,
 * Datadog, etc. Unix-nano timestamps are emitted as strings to avoid float
 * precision loss.
 */
export function toOTLP(bundle: ExportBundle, generatedAt = Date.now()): string {
  const { snapshot } = bundle;
  const anchor = generatedAt - snapshot.updatedAt;
  const toNanos = (perfTs: number): string =>
    (BigInt(Math.max(0, Math.round(anchor + perfTs))) * 1_000_000n).toString();

  const attr = (key: string, value: string | number) => ({
    key,
    value: typeof value === 'number' ? { intValue: Math.round(value) } : { stringValue: value },
  });

  const spansFor = (it: InteractionSession) => {
    const traceId = hex(16);
    const rootId = hex(8);
    const spans: unknown[] = [
      {
        traceId,
        spanId: rootId,
        name: `${it.trigger.type} ${it.trigger.target}`,
        kind: 1, // INTERNAL
        startTimeUnixNano: toNanos(it.trigger.timestamp),
        endTimeUnixNano: toNanos(it.trigger.timestamp + it.duration),
        attributes: [
          attr('perflex.health', it.health),
          attr('perflex.blocking_ms', it.metrics.totalBlockingTime),
          attr('perflex.inp_ms', it.metrics.interactionToNextPaint),
        ],
      },
    ];

    for (const lt of it.longTasks) {
      spans.push({
        traceId,
        spanId: hex(8),
        parentSpanId: rootId,
        name: 'long-task',
        kind: 1,
        startTimeUnixNano: toNanos(lt.startTime),
        endTimeUnixNano: toNanos(lt.startTime + lt.duration),
        attributes: [attr('perflex.duration_ms', lt.duration)],
      });
    }
    for (const n of it.networkCalls) {
      spans.push({
        traceId,
        spanId: hex(8),
        parentSpanId: rootId,
        name: `${n.method} ${safePath(n.url)}`,
        kind: 3, // CLIENT
        startTimeUnixNano: toNanos(n.startTime),
        endTimeUnixNano: toNanos(n.startTime + n.duration),
        attributes: [
          attr('http.request.method', n.method),
          attr('url.full', n.url),
          ...(n.responseStatus ? [attr('http.response.status_code', n.responseStatus)] : []),
        ],
      });
    }
    return spans;
  };

  const otlp = {
    resourceSpans: [
      {
        resource: {
          attributes: [
            attr('service.name', 'perflex-browser'),
            attr('telemetry.sdk.name', 'perflex'),
            attr('telemetry.sdk.language', 'webjs'),
            attr('browser.platform', 'web'),
            attr('url.full', snapshot.url),
          ],
        },
        scopeSpans: [
          {
            scope: { name: 'perflex', version: '1.0.0' },
            spans: snapshot.interactions.flatMap(spansFor),
          },
        ],
      },
    ],
  };
  return JSON.stringify(otlp, null, 2);
}

function hex(bytes: number): string {
  let s = '';
  for (let i = 0; i < bytes * 2; i++) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}

function safePath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}
