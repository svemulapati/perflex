import { useMemo, useState } from 'react';
import { useSessionStore } from '../stores/session-store';
import { bytes, ms } from '../format';
import {
  applyRemoval,
  groupByVendor,
  removalSavings,
  vendorRecommendations,
  type VendorImpact,
} from '@/shared/third-party-impact';
import { estimateSpeedIndex, scorePerformance, type LighthouseMetrics } from '@/shared/lighthouse-scoring';

const VENDOR_COLORS = ['#6366F1', '#F59E0B', '#10B981', '#EF4444', '#06B6D4', '#A855F7', '#EC4899'];
const FIRST_PARTY_COLOR = '#3f3f46';

function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return `hsl(${h} 45% 42%)`;
}

/** Donut of main-thread time: first-party vs each third-party vendor. */
function Donut({ segments }: { segments: { value: number; color: string }[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = 38;
  const circ = 2 * Math.PI * r;
  let acc = 0;
  return (
    <svg width={92} height={92} viewBox="0 0 100 100" aria-hidden>
      {segments
        .filter((s) => s.value > 0)
        .map((s, i) => {
          const frac = s.value / total;
          const dash = `${(frac * circ).toFixed(1)} ${circ.toFixed(1)}`;
          const off = (-acc * circ).toFixed(1);
          acc += frac;
          return (
            <circle key={i} cx={50} cy={50} r={r} fill="none" stroke={s.color} strokeWidth={16} strokeDasharray={dash} strokeDashoffset={off} transform="rotate(-90 50 50)" />
          );
        })}
    </svg>
  );
}

export function ThirdParties() {
  const snapshot = useSessionStore((s) => s.snapshot);
  const [removed, setRemoved] = useState<Set<string>>(new Set());

  const vendors = useMemo(() => groupByVendor(snapshot?.scripts ?? []), [snapshot]);

  const firstPartyMt = useMemo(
    () => (snapshot?.scripts ?? []).filter((s) => !s.classification.startsWith('third-party')).reduce((a, s) => a + s.metrics.totalMainThreadTime, 0),
    [snapshot]
  );

  if (!snapshot) return <div className="p-3 text-[11px] text-zinc-500">Waiting for data…</div>;
  if (vendors.length === 0) return <div className="p-3 text-[11px] text-zinc-500">No third-party scripts detected on this page.</div>;

  const v = snapshot.vitals;
  const metrics: LighthouseMetrics = {
    fcp: v.fcp,
    si: estimateSpeedIndex(v.fcp, snapshot.totalBlockingTime),
    lcp: v.lcp,
    tbt: snapshot.totalBlockingTime,
    cls: v.cls,
  };
  const baseScore = scorePerformance(metrics).score;

  const removedVendors = vendors.filter((x) => removed.has(x.vendor));
  const saved = removalSavings(removedVendors);
  const projectedScore = scorePerformance(applyRemoval(metrics, removedVendors)).score;
  const scoreDelta = baseScore != null && projectedScore != null ? projectedScore - baseScore : 0;

  const thirdPartyMt = vendors.reduce((a, x) => a + x.mainThreadTime, 0);
  const totalMt = firstPartyMt + thirdPartyMt;
  const maxVendorMt = vendors[0]?.mainThreadTime || 1;

  const donutSegments = [
    { value: firstPartyMt, color: FIRST_PARTY_COLOR },
    ...vendors.slice(0, 6).map((x, i) => ({ value: x.mainThreadTime, color: VENDOR_COLORS[i % VENDOR_COLORS.length] })),
  ];

  const toggle = (vendor: string) =>
    setRemoved((prev) => {
      const next = new Set(prev);
      next.has(vendor) ? next.delete(vendor) : next.add(vendor);
      return next;
    });

  return (
    <div className="contain-content flex flex-col gap-3 p-3">
      <div className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
        <Donut segments={donutSegments} />
        <div className="min-w-0 text-[11px]">
          <div className="text-zinc-200">
            <span className="font-semibold">{vendors.length}</span> third parties cost{' '}
            <span className="font-mono text-amber-300">{ms(thirdPartyMt)}</span> of main-thread time
          </div>
          <div className="mt-0.5 text-zinc-500">
            {totalMt > 0 ? Math.round((thirdPartyMt / totalMt) * 100) : 0}% of all main-thread work · {bytes(vendors.reduce((a, x) => a + x.transferSize, 0))} transferred
          </div>
        </div>
      </div>

      {removedVendors.length > 0 && (
        <div className="rounded-lg border border-brand/40 bg-brand/10 p-2.5 text-[11px]">
          <div className="font-semibold text-zinc-100">
            Removing {removedVendors.map((x) => x.vendor).join(', ')} would save:
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-zinc-300">
            <span>~{ms(saved.mainThreadTime)} main-thread</span>
            <span>{bytes(saved.transferSize)} transfer</span>
            <span>{saved.requests} request{saved.requests === 1 ? '' : 's'}</span>
            {saved.layoutShift > 0.001 && <span>−{saved.layoutShift.toFixed(3)} CLS</span>}
            {scoreDelta > 0 && <span className="font-semibold text-severity-success">Lighthouse +{scoreDelta}</span>}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {vendors.map((vendor, i) => (
          <VendorCard
            key={vendor.vendor}
            vendor={vendor}
            all={vendors}
            barColor={VENDOR_COLORS[i % VENDOR_COLORS.length]}
            barPct={(vendor.mainThreadTime / maxVendorMt) * 100}
            removed={removed.has(vendor.vendor)}
            onToggle={() => toggle(vendor.vendor)}
          />
        ))}
      </div>
    </div>
  );
}

const CATEGORY_BADGE: Record<string, string> = {
  analytics: 'bg-blue-500/20 text-blue-300',
  marketing: 'bg-rose-500/20 text-rose-300',
  'tag-manager': 'bg-amber-500/20 text-amber-300',
  payments: 'bg-emerald-500/20 text-emerald-300',
  support: 'bg-cyan-500/20 text-cyan-300',
  'ab-testing': 'bg-purple-500/20 text-purple-300',
  social: 'bg-pink-500/20 text-pink-300',
  cdn: 'bg-zinc-600/30 text-zinc-300',
};

function VendorCard({ vendor, all, barColor, barPct, removed, onToggle }: { vendor: VendorImpact; all: VendorImpact[]; barColor: string; barPct: number; removed: boolean; onToggle: () => void }) {
  const recs = vendorRecommendations(vendor, all);
  return (
    <div className={`rounded-lg border bg-zinc-900/40 p-2.5 ${removed ? 'border-severity-critical/50 opacity-60' : 'border-zinc-800'}`}>
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[12px] font-bold text-white" style={{ background: avatarColor(vendor.vendor) }}>
          {vendor.vendor.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[12px] font-semibold text-zinc-100">{vendor.vendor}</span>
            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[8px] font-semibold uppercase ${CATEGORY_BADGE[vendor.category] ?? 'bg-zinc-700/40 text-zinc-300'}`}>{vendor.category}</span>
          </div>
          <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-zinc-800">
            <div className="h-1 rounded-full" style={{ width: `${barPct.toFixed(0)}%`, background: barColor }} />
          </div>
        </div>
        <label className="flex shrink-0 cursor-pointer items-center gap-1 text-[10px] text-zinc-400">
          <input type="checkbox" checked={removed} onChange={onToggle} />
          Remove
        </label>
      </div>

      <div className="mt-2 grid grid-cols-4 gap-1 text-center">
        <Metric label="Main-thread" value={ms(vendor.mainThreadTime)} accent />
        <Metric label="Transfer" value={bytes(vendor.transferSize)} />
        <Metric label="Requests" value={String(vendor.requestCount)} />
        <Metric label="Long tasks" value={String(vendor.longTaskCount)} />
      </div>

      <ul className="mt-2 flex flex-col gap-0.5">
        {recs.map((r, i) => (
          <li key={i} className="flex gap-1 text-[10px] text-zinc-400">
            <span className="text-brand">→</span>
            <span>{r}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded bg-zinc-950/60 py-1">
      <div className={`font-mono text-[11px] ${accent ? 'text-amber-300' : 'text-zinc-200'}`}>{value}</div>
      <div className="text-[8px] uppercase tracking-wide text-zinc-600">{label}</div>
    </div>
  );
}
