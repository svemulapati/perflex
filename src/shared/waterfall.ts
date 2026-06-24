/**
 * Pure helpers for the network waterfall (Feature 6): resource categorization,
 * timing-phase segments, and Service-Worker/cache detection. Kept dependency-
 * free so they're unit-testable without a DOM.
 */
import type { TimelineNetwork } from './types';

export type ResourceType = 'js' | 'css' | 'image' | 'font' | 'xhr' | 'other';

export const RESOURCE_TYPE_LABEL: Record<ResourceType, string> = {
  js: 'JS',
  css: 'CSS',
  image: 'Img',
  font: 'Font',
  xhr: 'XHR',
  other: 'Other',
};

/** Classify a request by its initiator type, falling back to the URL extension. */
export function categorizeResource(initiatorType: string, url: string): ResourceType {
  const it = (initiatorType || '').toLowerCase();
  if (it === 'script') return 'js';
  if (it === 'img' || it === 'image') return 'image';
  if (it === 'fetch' || it === 'xmlhttprequest' || it === 'beacon') return 'xhr';
  if (it === 'css') return 'css';
  if (it === 'link') {
    if (/\.(woff2?|ttf|otf|eot)(\?|#|$)/i.test(url)) return 'font';
    return 'css';
  }
  // Fall back to the file extension.
  if (/\.(mjs|js|jsx|ts)(\?|#|$)/i.test(url)) return 'js';
  if (/\.css(\?|#|$)/i.test(url)) return 'css';
  if (/\.(png|jpe?g|gif|webp|avif|svg|ico|bmp)(\?|#|$)/i.test(url)) return 'image';
  if (/\.(woff2?|ttf|otf|eot)(\?|#|$)/i.test(url)) return 'font';
  return 'other';
}

export interface PhaseMeta {
  key: 'dns' | 'tcp' | 'tls' | 'ttfb' | 'download';
  label: string;
  color: string;
}

/** Phase order + colors (spec Feature 6). */
export const PHASE_META: readonly PhaseMeta[] = [
  { key: 'dns', label: 'DNS', color: '#22d3ee' }, // cyan
  { key: 'tcp', label: 'TCP', color: '#fb923c' }, // orange
  { key: 'tls', label: 'TLS', color: '#c084fc' }, // purple
  { key: 'ttfb', label: 'TTFB', color: '#34d399' }, // green
  { key: 'download', label: 'Download', color: '#60a5fa' }, // blue
];

export interface PhaseSegment {
  label: string;
  color: string;
  ms: number;
}

/**
 * Whether a request looks Service-Worker / cache served: no connection phases at
 * all. The waterfall labels these instead of showing five 0ms phases (spec D.1).
 */
export function isCacheServed(e: Pick<TimelineNetwork, 'dns' | 'tcp' | 'tls' | 'ttfb'>): boolean {
  return e.dns === 0 && e.tcp === 0 && e.tls === 0 && e.ttfb === 0;
}

/**
 * Break a request into its non-empty timing phases. If there's no phase data but
 * the request still took time (cache/SW), return one neutral "cached" segment.
 */
export function waterfallSegments(
  e: Pick<TimelineNetwork, 'dns' | 'tcp' | 'tls' | 'ttfb' | 'download' | 'duration'>
): PhaseSegment[] {
  const segs: PhaseSegment[] = PHASE_META.map((p) => ({
    label: p.label,
    color: p.color,
    ms: Math.max(0, e[p.key]),
  })).filter((s) => s.ms > 0.01);

  if (segs.length === 0 && e.duration > 0) {
    return [{ label: 'cached', color: '#52525b', ms: e.duration }];
  }
  return segs;
}

/** Filename (or host) for a URL, without query string. */
export function fileName(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname.split('/').filter(Boolean).pop() || u.hostname;
  } catch {
    return (url.split('?')[0].split('#')[0].split('/').pop() || url) as string;
  }
}

/** Same-origin as the page → first-party. */
export function isFirstParty(url: string, pageUrl: string): boolean {
  try {
    return new URL(url).origin === new URL(pageUrl).origin;
  } catch {
    return false;
  }
}
