/**
 * Third-party impact analysis (Feature 9): group third-party scripts by vendor,
 * aggregate their performance tax, generate recommendations, and model the
 * effect of removing one or more vendors. Pure and unit-testable.
 */
import type { ScriptProfile } from './types';
import type { LighthouseMetrics } from './lighthouse-scoring';
import { matchThirdParty } from './third-party-db';

export interface VendorImpact {
  vendor: string;
  category: string;
  scriptCount: number;
  mainThreadTime: number;
  transferSize: number;
  requestCount: number;
  layoutShiftContribution: number;
  longTaskCount: number;
  scripts: string[];
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Group third-party scripts by vendor (known DB name, else hostname). */
export function groupByVendor(scripts: ScriptProfile[]): VendorImpact[] {
  const map = new Map<string, VendorImpact>();
  for (const s of scripts) {
    if (!s.classification.startsWith('third-party')) continue;
    const entry = matchThirdParty(s.url);
    const vendor = entry ? entry.name : hostnameOf(s.url);
    const category = entry ? entry.category : s.category || 'unknown';
    let v = map.get(vendor);
    if (!v) {
      v = { vendor, category, scriptCount: 0, mainThreadTime: 0, transferSize: 0, requestCount: 0, layoutShiftContribution: 0, longTaskCount: 0, scripts: [] };
      map.set(vendor, v);
    }
    v.scriptCount++;
    v.mainThreadTime += s.metrics.totalMainThreadTime;
    v.transferSize += s.metrics.totalTransferSize;
    v.requestCount += s.metrics.networkRequestCount;
    v.layoutShiftContribution += s.metrics.layoutShiftContribution;
    v.longTaskCount += s.metrics.longTaskCount;
    v.scripts.push(s.url);
  }
  return [...map.values()].sort((a, b) => b.mainThreadTime - a.mainThreadTime);
}

/** Contextual, prioritized recommendations for one vendor. */
export function vendorRecommendations(v: VendorImpact, all: VendorImpact[]): string[] {
  const recs: string[] = [];
  if (v.layoutShiftContribution > 0.01) {
    recs.push(`Reserve space for the ${v.vendor} widget (explicit width/height) to stop it shifting layout.`);
  }
  if (v.mainThreadTime >= 150) {
    recs.push(`${v.vendor} costs ${Math.round(v.mainThreadTime)}ms of main-thread time — load it behind a facade or defer until after first interaction.`);
  } else if (v.mainThreadTime >= 50) {
    recs.push(`Load ${v.vendor} asynchronously / deferred to keep it off the critical path.`);
  }
  const sameCategory = all.filter((x) => x.category === v.category && x.vendor !== v.vendor);
  if (sameCategory.length > 0 && v.category !== 'cdn' && v.category !== 'unknown') {
    const names = [v.vendor, ...sameCategory.map((x) => x.vendor)].join(', ');
    recs.push(`You have ${sameCategory.length + 1} ${v.category} tools (${names}) — consider consolidating to one.`);
  }
  if (recs.length === 0) recs.push(`${v.vendor}'s footprint looks reasonable.`);
  return recs;
}

/** Combined savings from removing a set of vendors. */
export function removalSavings(vendors: VendorImpact[]): { mainThreadTime: number; transferSize: number; layoutShift: number; requests: number } {
  return {
    mainThreadTime: vendors.reduce((s, v) => s + v.mainThreadTime, 0),
    transferSize: vendors.reduce((s, v) => s + v.transferSize, 0),
    layoutShift: vendors.reduce((s, v) => s + v.layoutShiftContribution, 0),
    requests: vendors.reduce((s, v) => s + v.requestCount, 0),
  };
}

/** Apply a vendor removal to Lighthouse metrics (drops their TBT + CLS share). */
export function applyRemoval(metrics: LighthouseMetrics, vendors: VendorImpact[]): LighthouseMetrics {
  const saved = removalSavings(vendors);
  return {
    ...metrics,
    tbt: metrics.tbt == null ? null : Math.max(0, metrics.tbt - saved.mainThreadTime),
    cls: Math.max(0, (metrics.cls ?? 0) - saved.layoutShift),
  };
}
