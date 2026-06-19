import type { AnalysisInput, NetworkEvent, PerformanceFinding } from '../types';
import { makeFinding } from './base';

const KB = 1024;
const MB = 1024 * KB;
const DEDUP_WINDOW = 30_000;

export function networkMatchers(input: AnalysisInput): PerformanceFinding[] {
  const out: PerformanceFinding[] = [];

  // 22. Redundant fetches (same url+method+body within 30s)
  const byKey = new Map<string, NetworkEvent[]>();
  for (const n of input.network) {
    const key = `${n.method} ${n.url} ${n.requestBodyHash ?? ''}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(n);
  }
  let maxDup = 0;
  let dupKey = '';
  for (const [key, calls] of byKey) {
    const sorted = calls.sort((a, b) => a.startTime - b.startTime);
    let windowCount = 1;
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].startTime - sorted[i - 1].startTime <= DEDUP_WINDOW) windowCount++;
      else windowCount = 1;
      if (windowCount > maxDup) {
        maxDup = windowCount;
        dupKey = key;
      }
    }
  }
  if (maxDup >= 2) {
    out.push(
      makeFinding('redundant-fetch', maxDup >= 3 ? 'critical' : 'warning', {
        confidence: 0.8,
        description: `The same request was issued ${maxDup} times within 30s: ${dupKey.slice(0, 80)}.`,
        impact: { frequency: maxDup, totalDuration: 0 },
      })
    );
  }

  // 23. Uncached API responses (identical response bodies repeated)
  const byUrlBody = new Map<string, Set<number>>();
  for (const n of input.network) {
    if (n.responseBodyHash === undefined) continue;
    if (!byUrlBody.has(n.url)) byUrlBody.set(n.url, new Set());
    byUrlBody.get(n.url)!.add(n.responseBodyHash);
  }
  const uncached = [...byUrlBody.entries()].filter(([url, hashes]) => {
    const calls = input.network.filter((n) => n.url === url && n.responseBodyHash !== undefined);
    return calls.length > 1 && hashes.size === 1;
  });
  if (uncached.length > 0) {
    out.push(
      makeFinding('uncached-api', 'warning', {
        confidence: 0.65,
        description: `${uncached.length} endpoint(s) returned identical responses across repeated requests — candidates for caching.`,
        evidence: { sampleEntries: uncached.slice(0, 5).map(([url]) => url) },
        impact: { frequency: uncached.length, totalDuration: 0 },
      })
    );
  }

  // 24. Sequential waterfalls (independent requests run serially)
  const reqs = [...input.network].sort((a, b) => a.startTime - b.startTime);
  let serial = 1;
  let maxSerial = 1;
  for (let i = 1; i < reqs.length; i++) {
    if (reqs[i].startTime >= reqs[i - 1].startTime + reqs[i - 1].duration - 10) {
      serial++;
      maxSerial = Math.max(maxSerial, serial);
    } else serial = 1;
  }
  if (maxSerial >= 4) {
    out.push(
      makeFinding('sequential-waterfall', 'warning', {
        confidence: 0.4,
        description: `~${maxSerial} requests appear to run sequentially; independent ones could be parallelized.`,
        impact: { frequency: maxSerial, totalDuration: 0 },
      })
    );
  }

  // 25. Uncompressed payloads (large, transferred ≈ decoded size)
  const uncompressed = input.resources.filter(
    (r) => r.decodedBodySize > 10 * KB && r.encodedBodySize >= r.decodedBodySize * 0.9
  );
  if (uncompressed.length > 0) {
    out.push(
      makeFinding('uncompressed-payload', 'warning', {
        confidence: 0.6,
        description: `${uncompressed.length} large response(s) appear uncompressed (transferred ≈ decoded size).`,
        evidence: { sampleEntries: uncompressed.slice(0, 5).map((r) => ({ url: r.url, decoded: r.decodedBodySize })) },
        impact: { frequency: uncompressed.length, totalDuration: 0 },
      })
    );
  }

  // 26. Oversized payloads (>500KB)
  const oversized = input.resources.filter((r) => r.transferSize > 500 * KB);
  for (const r of oversized) {
    out.push(
      makeFinding('oversized-payload', r.transferSize > 2 * MB ? 'critical' : 'warning', {
        key: r.url,
        confidence: 0.85,
        description: `${shortName(r.url)} is ${(r.transferSize / MB).toFixed(2)}MB — oversized payload.`,
        evidence: { sampleEntries: [r] },
        impact: { frequency: 1, totalDuration: r.duration },
      })
    );
  }

  return out;
}

function shortName(url: string): string {
  try {
    return new URL(url).pathname.split('/').pop() || new URL(url).hostname;
  } catch {
    return url;
  }
}
