import { scoreBand } from '@/shared/lighthouse-scoring';

const BAND_COLOR: Record<ReturnType<typeof scoreBand>, string> = {
  fail: '#EF4444', // 0–49
  average: '#F59E0B', // 50–89
  pass: '#10B981', // 90–100
};

interface LighthouseGaugeProps {
  /** 0–100, or null when not enough data yet. */
  score: number | null;
  size?: number;
}

/** Circular Lighthouse-estimate gauge, colored by Lighthouse's score bands. */
export function LighthouseGauge({ score, size = 72 }: LighthouseGaugeProps) {
  const radius = size / 2 - 5;
  const circumference = 2 * Math.PI * radius;
  const pct = score ?? 0;
  const offset = circumference * (1 - pct / 100);
  const color = score === null ? '#52525b' : BAND_COLOR[scoreBand(score)];

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#27272a" strokeWidth={5} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={5}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.4s ease, stroke 0.4s ease' }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-lg font-bold" style={{ color }}>
          {score === null ? '–' : score}
        </span>
        <span className="text-[8px] font-semibold uppercase tracking-wide text-zinc-500">Lighthouse</span>
      </div>
    </div>
  );
}
