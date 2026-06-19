import type { CoreWebVitals, DetectedFramework, ExportBundle, PerformanceFinding } from '../types';

/**
 * Shareable session permalinks — privacy-preserving and backend-free.
 *
 * The session is compacted, gzip-compressed and base64url-encoded into the URL
 * *fragment* (`#s=…`), which browsers never send to a server. A static viewer
 * page decodes and renders it client-side. The same encoded payload can also be
 * inlined into a self-contained HTML file for fully offline sharing.
 */

export const SHARE_VERSION = 1;

export interface ShareScript {
  url: string;
  classification: string;
  category?: string;
  mainThreadTime: number;
  longTaskCount: number;
  transferSize: number;
}

export interface SharePayload {
  v: number;
  url: string;
  generatedAt: number;
  healthScore: number;
  vitals: CoreWebVitals;
  totalBlockingTime: number;
  heapSize: number;
  fps: number;
  frameworks: DetectedFramework[];
  scripts: ShareScript[];
  findings: PerformanceFinding[];
  interactionCount: number;
}

/** Build a compact, share-sized payload (drops heavy raw event arrays). */
export function buildSharePayload(bundle: ExportBundle, generatedAt = Date.now()): SharePayload {
  const s = bundle.snapshot;
  return {
    v: SHARE_VERSION,
    url: s.url,
    generatedAt,
    healthScore: s.healthScore,
    vitals: s.vitals,
    totalBlockingTime: s.totalBlockingTime,
    heapSize: s.heapSize,
    fps: s.fps,
    frameworks: s.frameworks,
    scripts: s.scripts.slice(0, 25).map((p) => ({
      url: p.url,
      classification: p.classification,
      category: p.category,
      mainThreadTime: p.metrics.totalMainThreadTime,
      longTaskCount: p.metrics.longTaskCount,
      transferSize: p.metrics.totalTransferSize,
    })),
    findings: s.findings,
    interactionCount: s.interactions.length,
  };
}

/* ---- base64url <-> bytes ---- */

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const hasCompression = typeof CompressionStream !== 'undefined';

async function gzip(input: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream('gzip');
  const writer = cs.writable.getWriter();
  void writer.write(input as unknown as BufferSource);
  void writer.close();
  return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}

async function gunzip(input: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('gzip');
  const writer = ds.writable.getWriter();
  void writer.write(input as unknown as BufferSource);
  void writer.close();
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}

/**
 * Encode a payload to a URL-safe string. Prefix `g` = gzipped, `r` = raw
 * (fallback when CompressionStream is unavailable).
 */
export async function encodeSession(payload: SharePayload): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(payload));
  if (hasCompression) {
    return 'g' + bytesToBase64Url(await gzip(json));
  }
  return 'r' + bytesToBase64Url(json);
}

export async function decodeSession(encoded: string): Promise<SharePayload> {
  const tag = encoded[0];
  const bytes = base64UrlToBytes(encoded.slice(1));
  const json =
    tag === 'g' ? new TextDecoder().decode(await gunzip(bytes)) : new TextDecoder().decode(bytes);
  return JSON.parse(json) as SharePayload;
}

/** `https://host/path/#s=<encoded>` — the fragment is never sent to the server. */
export function buildPermalink(encoded: string, viewerBaseUrl: string): string {
  const base = viewerBaseUrl.split('#')[0].replace(/\/?$/, '/');
  return `${base}#s=${encoded}`;
}
