import { useEffect, useMemo, useRef, useState } from 'react';
import { scaleLinear } from 'd3-scale';
import { select } from 'd3-selection';
import { zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3-zoom';
import type { TimelineData } from '@/shared/types';
import { scoreColor } from '../format';
import { ms } from '../format';

interface Props {
  timeline: TimelineData;
  selectedInteraction: string | null;
  onSelectInteraction: (id: string | null) => void;
}

interface Lane {
  key: string;
  label: string;
  height: number;
}

const LANES: Lane[] = [
  { key: 'interactions', label: 'Interactions', height: 28 },
  { key: 'longtasks', label: 'Long Tasks', height: 24 },
  { key: 'network', label: 'Network', height: 40 },
  { key: 'shifts', label: 'Layout Shifts', height: 18 },
  { key: 'frames', label: 'Frame Drops', height: 18 },
  { key: 'memory', label: 'JS Heap', height: 30 },
];

const LABEL_W = 84;
const PAD = 8;
const AXIS_H = 18;

function taskColor(duration: number): string {
  if (duration >= 250) return '#EF4444';
  if (duration >= 100) return '#F59E0B';
  return '#10B981';
}

function netColor(initiatorType: string): string {
  if (initiatorType === 'script') return '#6366F1';
  if (initiatorType === 'css' || initiatorType === 'link') return '#8B5CF6';
  if (initiatorType === 'img') return '#14B8A6';
  if (initiatorType === 'fetch' || initiatorType === 'xmlhttprequest') return '#F59E0B';
  return '#6B7280';
}

export function SessionTimeline({ timeline, selectedInteraction, onSelectInteraction }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [width, setWidth] = useState(360);
  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity);
  const [hover, setHover] = useState<{ x: number; y: number; text: string } | null>(null);

  // Responsive width.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(Math.max(280, Math.floor(w)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const plotW = width - LABEL_W - PAD;
  const totalH = LANES.reduce((s, l) => s + l.height + 6, 0) + AXIS_H;

  const { start, end } = timeline;
  const span = Math.max(1, end - start);

  const baseX = useMemo(
    () => scaleLinear().domain([start, start + span]).range([0, plotW]),
    [start, span, plotW]
  );
  const zx = useMemo(() => transform.rescaleX(baseX), [transform, baseX]);

  // Attach d3-zoom (x-axis pan/zoom).
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const z = zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 200])
      .translateExtent([
        [0, 0],
        [plotW, totalH],
      ])
      .extent([
        [0, 0],
        [plotW, totalH],
      ])
      .on('zoom', (e) => setTransform(e.transform));
    zoomRef.current = z;
    const sel = select(svg);
    sel.call(z);
    return () => {
      sel.on('.zoom', null);
    };
  }, [plotW, totalH]);

  const resetZoom = () => {
    const svg = svgRef.current;
    if (svg && zoomRef.current) {
      zoomRef.current.transform(select(svg), zoomIdentity);
    }
    setTransform(zoomIdentity);
  };

  const laneY: Record<string, number> = {};
  {
    let y = 0;
    for (const l of LANES) {
      laneY[l.key] = y;
      y += l.height + 6;
    }
  }

  const maxHeap = Math.max(1, ...timeline.memory.map((m) => m.used));
  const clampX = (x: number) => Math.max(0, Math.min(plotW, x));
  const visible = (s: number, dur = 0) => zx(s + dur) >= 0 && zx(s) <= plotW;

  const showTip = (e: React.MouseEvent, text: string) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    setHover({ x: e.clientX - rect.left, y: e.clientY - rect.top, text });
  };

  const memoryPath = useMemo(() => {
    const lane = LANES.find((l) => l.key === 'memory')!;
    const y0 = laneY.memory;
    if (timeline.memory.length < 2) return '';
    return timeline.memory
      .map((m, i) => {
        const x = clampX(zx(m.time));
        const y = y0 + lane.height - (m.used / maxHeap) * lane.height;
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeline.memory, zx, maxHeap, plotW]);

  const hasData =
    timeline.interactions.length +
      timeline.longTasks.length +
      timeline.network.length +
      timeline.frames.length >
    0;

  return (
    <div ref={wrapRef} className="relative w-full">
      <div className="mb-1 flex items-center justify-between text-[10px] text-zinc-500">
        <span>Scroll to zoom · drag to pan</span>
        <button onClick={resetZoom} className="rounded bg-zinc-800 px-1.5 py-0.5 hover:text-zinc-200">
          Reset zoom
        </button>
      </div>

      {!hasData ? (
        <div className="py-8 text-center text-sm text-zinc-500">
          No timeline activity captured yet. Interact with the page.
        </div>
      ) : (
        <svg ref={svgRef} width={width} height={totalH} className="touch-none select-none">
          {/* Lane labels + backgrounds */}
          {LANES.map((l) => (
            <g key={l.key} transform={`translate(0,${laneY[l.key]})`}>
              <text x={0} y={l.height / 2 + 3} className="fill-zinc-500 text-[9px]">
                {l.label}
              </text>
              <rect x={LABEL_W} y={0} width={plotW} height={l.height} className="fill-zinc-900/50" rx={2} />
            </g>
          ))}

          {/* Plot content, translated past the label gutter and clipped */}
          <g transform={`translate(${LABEL_W},0)`}>
            <defs>
              <clipPath id="plot-clip">
                <rect x={0} y={0} width={plotW} height={totalH} />
              </clipPath>
            </defs>
            <g clipPath="url(#plot-clip)">
              {/* Interactions */}
              {timeline.interactions.map(
                (it) =>
                  visible(it.start, it.duration) && (
                    <rect
                      key={it.id}
                      x={clampX(zx(it.start))}
                      y={laneY.interactions + 3}
                      width={Math.max(2, clampX(zx(it.start + it.duration)) - clampX(zx(it.start)))}
                      height={LANES[0].height - 6}
                      rx={2}
                      fill={scoreColor(it.health)}
                      fillOpacity={selectedInteraction === it.id ? 0.95 : 0.55}
                      stroke={selectedInteraction === it.id ? '#fff' : 'none'}
                      strokeWidth={1}
                      className="cursor-pointer"
                      onClick={() => onSelectInteraction(selectedInteraction === it.id ? null : it.id)}
                      onMouseMove={(e) =>
                        showTip(e, `${it.type} · ${it.target} · ${ms(it.duration)}${it.inProgress ? ' (live)' : ''}`)
                      }
                      onMouseLeave={() => setHover(null)}
                    />
                  )
              )}

              {/* Long tasks */}
              {timeline.longTasks.map(
                (t, i) =>
                  visible(t.start, t.duration) && (
                    <rect
                      key={i}
                      x={clampX(zx(t.start))}
                      y={laneY.longtasks + 3}
                      width={Math.max(1.5, clampX(zx(t.start + t.duration)) - clampX(zx(t.start)))}
                      height={LANES[1].height - 6}
                      fill={taskColor(t.duration)}
                      fillOpacity={0.8}
                      onMouseMove={(e) => showTip(e, `Long task ${ms(t.duration)} · ${t.scriptUrl}`)}
                      onMouseLeave={() => setHover(null)}
                    />
                  )
              )}

              {/* Network waterfall */}
              {timeline.network.map(
                (n, i) =>
                  visible(n.start, n.duration) && (
                    <rect
                      key={i}
                      x={clampX(zx(n.start))}
                      y={laneY.network + 2 + (i % 4) * 9}
                      width={Math.max(1.5, clampX(zx(n.start + n.duration)) - clampX(zx(n.start)))}
                      height={7}
                      rx={1}
                      fill={netColor(n.initiatorType)}
                      fillOpacity={0.8}
                      onMouseMove={(e) => showTip(e, `${n.initiatorType} ${ms(n.duration)}${n.status ? ` · ${n.status}` : ''}`)}
                      onMouseLeave={() => setHover(null)}
                    />
                  )
              )}

              {/* Layout shifts */}
              {timeline.layoutShifts.map(
                (s, i) =>
                  visible(s.time) && (
                    <rect
                      key={i}
                      x={clampX(zx(s.time))}
                      y={laneY.shifts + LANES[3].height - Math.min(LANES[3].height, s.value * 60)}
                      width={2}
                      height={Math.min(LANES[3].height, s.value * 60)}
                      fill="#F59E0B"
                      onMouseMove={(e) => showTip(e, `Layout shift ${s.value.toFixed(3)}`)}
                      onMouseLeave={() => setHover(null)}
                    />
                  )
              )}

              {/* Frame drops */}
              {timeline.frames.map(
                (f, i) =>
                  visible(f.time) && (
                    <rect
                      key={i}
                      x={clampX(zx(f.time))}
                      y={laneY.frames + 2}
                      width={2}
                      height={LANES[4].height - 4}
                      fill="#EF4444"
                      fillOpacity={Math.min(1, 0.3 + f.overrun / 100)}
                      onMouseMove={(e) => showTip(e, `Frame ${ms(f.frameDuration)} (overrun ${ms(f.overrun)})`)}
                      onMouseLeave={() => setHover(null)}
                    />
                  )
              )}

              {/* Memory line */}
              {memoryPath && <path d={memoryPath} fill="none" stroke="#3B82F6" strokeWidth={1.5} />}
            </g>

            {/* Time axis */}
            <g transform={`translate(0,${totalH - AXIS_H + 4})`}>
              {zx.ticks(6).map((t, i) => (
                <text key={i} x={clampX(zx(t))} y={8} textAnchor="middle" className="fill-zinc-500 text-[8px]">
                  {ms(t - start)}
                </text>
              ))}
            </g>
          </g>
        </svg>
      )}

      {hover && (
        <div
          className="pointer-events-none absolute z-10 max-w-[240px] truncate rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-100 shadow-lg"
          style={{ left: Math.min(hover.x + 8, width - 120), top: hover.y + 10 }}
        >
          {hover.text}
        </div>
      )}
    </div>
  );
}
