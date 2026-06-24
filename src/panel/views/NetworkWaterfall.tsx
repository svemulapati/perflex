import { useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useSessionStore } from '../stores/session-store';
import { bytes, ms } from '../format';
import type { TimelineNetwork } from '@/shared/types';
import {
  PHASE_META,
  RESOURCE_TYPE_LABEL,
  categorizeResource,
  fileName,
  isCacheServed,
  isFirstParty,
  waterfallSegments,
  type ResourceType,
} from '@/shared/waterfall';

const ROW_HEIGHT = 28;
const TYPES: (ResourceType | 'all')[] = ['all', 'js', 'css', 'image', 'font', 'xhr', 'other'];

export function NetworkWaterfall() {
  const snapshot = useSessionStore((s) => s.snapshot);
  const pageUrl = useSessionStore((s) => s.url);

  const [type, setType] = useState<ResourceType | 'all'>('all');
  const [party, setParty] = useState<'all' | 'first' | 'third'>('all');
  const [search, setSearch] = useState('');
  const [blockingOnly, setBlockingOnly] = useState(false);

  const network = snapshot?.timeline.network ?? [];
  const tlStart = snapshot?.timeline.start ?? 0;
  const span = Math.max(1, (snapshot?.timeline.end ?? 0) - tlStart);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return network
      .filter((n) => {
        if (type !== 'all' && categorizeResource(n.initiatorType, n.url) !== type) return false;
        if (party !== 'all') {
          const first = isFirstParty(n.url, pageUrl);
          if (party === 'first' && !first) return false;
          if (party === 'third' && first) return false;
        }
        if (blockingOnly && !n.renderBlocking) return false;
        if (q && !n.url.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => a.start - b.start);
  }, [network, type, party, search, blockingOnly, pageUrl]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  if (network.length === 0) {
    return (
      <div className="p-3 text-[11px] text-zinc-500">
        No network requests captured yet. Reload the page with the panel open to record the page load.
      </div>
    );
  }

  return (
    <div className="contain-content flex h-full flex-col">
      {/* Filters */}
      <div className="flex flex-col gap-2 border-b border-zinc-800 p-2">
        <div className="flex flex-wrap items-center gap-1">
          {TYPES.map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`rounded px-1.5 py-0.5 text-[10px] ${
                type === t ? 'bg-brand text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {t === 'all' ? 'All' : RESOURCE_TYPE_LABEL[t]}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by URL…"
            className="min-w-0 flex-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-0.5 font-mono text-[10px] outline-none focus:border-brand"
          />
          <select
            value={party}
            onChange={(e) => setParty(e.target.value as 'all' | 'first' | 'third')}
            className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-300 outline-none"
          >
            <option value="all">All parties</option>
            <option value="first">First-party</option>
            <option value="third">Third-party</option>
          </select>
          <button
            onClick={() => setBlockingOnly((b) => !b)}
            className={`rounded px-1.5 py-0.5 text-[10px] ${
              blockingOnly ? 'bg-severity-critical/20 text-severity-critical' : 'bg-zinc-800 text-zinc-400'
            }`}
            title="Render-blocking requests only"
          >
            Blocking
          </button>
        </div>
        <div className="flex items-center justify-between text-[10px] text-zinc-500">
          <span>{rows.length} requests</span>
          <div className="flex gap-2">
            {PHASE_META.map((p) => (
              <span key={p.key} className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm" style={{ background: p.color }} />
                {p.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Virtualized rows */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((vi) => {
            const n = rows[vi.index];
            return (
              <div
                key={vi.key}
                className="absolute left-0 top-0 flex w-full items-center gap-1.5 px-2 hover:bg-zinc-900"
                style={{ height: ROW_HEIGHT, transform: `translateY(${vi.start}px)` }}
              >
                <WaterfallRow n={n} tlStart={tlStart} span={span} pageUrl={pageUrl} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function WaterfallRow({
  n,
  tlStart,
  span,
  pageUrl,
}: {
  n: TimelineNetwork;
  tlStart: number;
  span: number;
  pageUrl: string;
}) {
  const segs = waterfallSegments(n);
  const third = !isFirstParty(n.url, pageUrl);
  const cached = isCacheServed(n);
  let acc = ((n.start - tlStart) / span) * 100;

  return (
    <>
      <span className="shrink-0 rounded bg-zinc-700/50 px-1 text-[8px] font-bold text-zinc-300">
        {RESOURCE_TYPE_LABEL[categorizeResource(n.initiatorType, n.url)]}
      </span>
      <span
        className={`w-[34%] shrink-0 truncate font-mono text-[10px] ${third ? 'text-amber-300/90' : 'text-zinc-200'} ${
          n.renderBlocking ? 'border-l-2 border-l-severity-critical pl-1' : ''
        }`}
        title={n.url}
      >
        {fileName(n.url)}
      </span>
      <span className="w-8 shrink-0 text-right font-mono text-[10px] text-zinc-400">
        {n.status ?? (cached ? 'SW' : '—')}
      </span>
      <span className="w-12 shrink-0 text-right font-mono text-[10px] text-zinc-400">
        {bytes(n.transferSize)}
      </span>
      <span className="w-12 shrink-0 text-right font-mono text-[10px] text-zinc-300">{ms(n.duration)}</span>
      {/* Timing track */}
      <div className="relative h-3 min-w-0 flex-1 rounded-sm bg-zinc-900/60">
        {segs.map((seg, i) => {
          const w = (seg.ms / span) * 100;
          const left = acc;
          acc += w;
          return (
            <div
              key={i}
              className="absolute top-0 h-full rounded-[1px]"
              style={{ left: `${left}%`, width: `${Math.max(w, 0.4)}%`, background: seg.color }}
              title={`${seg.label}: ${ms(seg.ms)}`}
            />
          );
        })}
      </div>
    </>
  );
}
