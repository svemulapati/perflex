interface MetricBadgeProps {
  label: string;
  value: string;
  status?: 'good' | 'warn' | 'poor' | 'neutral';
  sub?: string;
}

const STATUS_COLORS: Record<string, string> = {
  good: 'text-severity-success border-severity-success/30 bg-severity-success/10',
  warn: 'text-severity-warning border-severity-warning/30 bg-severity-warning/10',
  poor: 'text-severity-critical border-severity-critical/30 bg-severity-critical/10',
  neutral: 'text-zinc-300 border-zinc-700 bg-zinc-800/40',
};

export function MetricBadge({ label, value, status = 'neutral', sub }: MetricBadgeProps) {
  return (
    <div className={`rounded-md border px-2.5 py-1.5 ${STATUS_COLORS[status]}`}>
      <div className="text-[10px] uppercase tracking-wide opacity-70">{label}</div>
      <div className="font-mono text-sm font-semibold leading-tight">{value}</div>
      {sub && <div className="text-[10px] opacity-60">{sub}</div>}
    </div>
  );
}
