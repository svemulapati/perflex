import type { ExportBundle, ResourceEvent } from '../types';

/**
 * HAR 1.2 export, extended with a `_perflex` namespace carrying long-task
 * attributions, interaction sessions, script profiles, and findings.
 */
export function toHAR(bundle: ExportBundle, generatedAt = Date.now()): string {
  const { snapshot, resources } = bundle;
  // Anchor page-relative performance.now() timestamps to wall-clock time.
  const anchor = generatedAt - snapshot.updatedAt;

  const entries = resources.map((r) => entryFor(r, anchor));

  const har = {
    log: {
      version: '1.2',
      creator: { name: 'Perflex', version: '1.0.0' },
      pages: [
        {
          startedDateTime: new Date(anchor + snapshot.startedAt).toISOString(),
          id: 'page_1',
          title: snapshot.url,
          pageTimings: {
            onContentLoad: -1,
            onLoad: -1,
          },
        },
      ],
      entries,
      _perflex: {
        healthScore: snapshot.healthScore,
        vitals: snapshot.vitals,
        scripts: snapshot.scripts,
        interactions: snapshot.interactions,
        findings: snapshot.findings,
        longTasks: snapshot.timeline.longTasks,
      },
    },
  };
  return JSON.stringify(har, null, 2);
}

function entryFor(r: ResourceEvent, anchor: number) {
  return {
    pageref: 'page_1',
    startedDateTime: new Date(anchor + r.startTime).toISOString(),
    time: round(r.duration),
    request: {
      method: 'GET',
      url: r.url,
      httpVersion: 'HTTP/1.1',
      headers: [],
      queryString: [],
      cookies: [],
      headersSize: -1,
      bodySize: 0,
    },
    response: {
      status: r.responseStatus ?? 0,
      statusText: '',
      httpVersion: 'HTTP/1.1',
      headers: [],
      cookies: [],
      content: {
        size: r.decodedBodySize,
        compression: Math.max(0, r.decodedBodySize - r.encodedBodySize),
        mimeType: '',
      },
      redirectURL: '',
      headersSize: -1,
      bodySize: r.transferSize,
    },
    cache: {},
    timings: {
      blocked: -1,
      dns: round(r.dns),
      connect: round(r.tcp),
      ssl: round(r.tls),
      send: 0,
      wait: round(r.ttfb),
      receive: round(r.download),
    },
    _perflex: { initiatorType: r.initiatorType },
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
