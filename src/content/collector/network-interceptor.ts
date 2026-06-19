import type { NetworkEvent } from '@/shared/types';
import { fingerprintStack, hashBody } from '@/shared/hash';
import type { CollectorContext } from './context';

/**
 * Wraps window.fetch and XMLHttpRequest to capture request/response metadata
 * plus a stack fingerprint of the originating call site. All original
 * behavior (return values, this-binding, streams, AbortController) is preserved.
 */
export function setupNetworkInterceptor(ctx: CollectorContext): () => void {
  const originalFetch = window.fetch;
  const XHR = XMLHttpRequest.prototype;
  const originalOpen = XHR.open;
  const originalSend = XHR.send;

  // ---- fetch ----
  const patchedFetch: typeof fetch = function (this: unknown, ...args: Parameters<typeof fetch>) {
    // Bare `fetch(...)` calls have `this === undefined` under strict mode; always
    // invoke the original on `window` so we never throw "Illegal invocation".
    const self = (this ?? window) as typeof globalThis;
    let fingerprint = 0;
    let start = 0;
    let url = '';
    let method = 'GET';
    let requestBodySize = 0;
    try {
      fingerprint = fingerprintStack(new Error().stack);
      start = performance.now();
      const input = args[0];
      const init = args[1];
      url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : (input as Request)?.url ?? '';
      method = (init?.method ?? (input as Request)?.method ?? 'GET').toUpperCase();
      requestBodySize = estimateBodySize(init?.body);
    } catch {
      /* metadata capture must never block the request */
    }

    const promise = originalFetch.apply(self, args);

    promise
      .then((response) => {
        ctx.measure(() => {
          if (!ctx.isEnabled('network')) return;
          const responseBodySize = Number(response.headers.get('content-length')) || undefined;
          const event: NetworkEvent = {
            seq: 0,
            kind: 'network',
            timestamp: start,
            fingerprint,
            url,
            method,
            api: 'fetch',
            async: true,
            requestBodySize,
            responseStatus: response.status,
            responseBodySize,
            duration: performance.now() - start,
            startTime: start,
            contentEncoding: response.headers.get('content-encoding') ?? undefined,
          };
          ctx.emit(event);
        });
      })
      .catch(() => {
        /* network error — request still happened; ignore for now */
      });

    return promise;
  };

  window.fetch = patchedFetch;

  // ---- XMLHttpRequest ----
  interface XHRMeta {
    method: string;
    url: string;
    async: boolean;
    fingerprint: number;
    start: number;
    requestBodySize: number;
  }
  const metaKey = Symbol('perflexXHR');
  type TaggedXHR = XMLHttpRequest & { [metaKey]?: XHRMeta };

  XHR.open = function (
    this: TaggedXHR,
    method: string,
    url: string | URL,
    async: boolean = true,
    ...rest: unknown[]
  ) {
    this[metaKey] = {
      method: method.toUpperCase(),
      url: typeof url === 'string' ? url : url.href,
      async,
      fingerprint: fingerprintStack(new Error().stack),
      start: 0,
      requestBodySize: 0,
    };
    return originalOpen.apply(
      this,
      [method, url, async, ...rest] as Parameters<typeof originalOpen>
    );
  } as typeof XHR.open;

  XHR.send = function (this: TaggedXHR, body?: Document | XMLHttpRequestBodyInit | null) {
    const meta = this[metaKey];
    if (meta) {
      meta.start = performance.now();
      meta.requestBodySize = estimateBodySize(body);
      this.addEventListener('loadend', () => {
        ctx.measure(() => {
          if (!ctx.isEnabled('network')) return;
          let responseBodySize: number | undefined;
          let responseBodyHash: number | undefined;
          try {
            const len = this.getResponseHeader('content-length');
            if (len) responseBodySize = Number(len);
            if (this.responseType === '' || this.responseType === 'text') {
              const text = this.responseText;
              responseBodySize = responseBodySize ?? text.length;
              responseBodyHash = hashBody(text);
            }
          } catch {
            /* opaque/cross-origin — ignore */
          }
          const event: NetworkEvent = {
            seq: 0,
            kind: 'network',
            timestamp: meta.start,
            fingerprint: meta.fingerprint,
            url: meta.url,
            method: meta.method,
            api: 'xhr',
            async: meta.async,
            requestBodySize: meta.requestBodySize,
            responseStatus: this.status,
            responseBodySize,
            responseBodyHash,
            duration: performance.now() - meta.start,
            startTime: meta.start,
            // NOTE: content-encoding is intentionally NOT read here. Browsers
            // strip it from XHR-readable headers (the body is already decoded),
            // and getResponseHeader('content-encoding') logs a noisy
            // "Refused to get unsafe header" warning. Compression is inferred
            // from resource-timing encodedBodySize vs decodedBodySize instead.
          };
          ctx.emit(event);
        });
      });
    }
    return originalSend.apply(this, [body] as Parameters<typeof originalSend>);
  } as typeof XHR.send;

  return () => {
    window.fetch = originalFetch;
    XHR.open = originalOpen;
    XHR.send = originalSend;
  };
}

function estimateBodySize(body: unknown): number {
  if (!body) return 0;
  if (typeof body === 'string') return body.length;
  if (body instanceof Blob) return body.size;
  if (body instanceof ArrayBuffer) return body.byteLength;
  if (ArrayBuffer.isView(body)) return body.byteLength;
  if (body instanceof URLSearchParams) return body.toString().length;
  return 0;
}
