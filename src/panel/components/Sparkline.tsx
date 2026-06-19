interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
}

/** Minimal SVG sparkline — no dependency, draws a normalized polyline. */
export function Sparkline({ data, width = 80, height = 20, color = '#6366F1' }: SparklineProps) {
  if (data.length === 0) {
    return <svg width={width} height={height} aria-hidden />;
  }
  const max = Math.max(...data, 1);
  const step = data.length > 1 ? width / (data.length - 1) : width;
  const points = data
    .map((v, i) => `${(i * step).toFixed(1)},${(height - (v / max) * height).toFixed(1)}`)
    .join(' ');

  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} />
    </svg>
  );
}
