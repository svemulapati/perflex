/** Tunable defaults for the collector and analyzer. */

export const RING_BUFFER_CAPACITY = 10_000;

/** How long the collector batches events before flushing to the worker (ms). */
export const BATCH_FLUSH_INTERVAL = 100;

/** Main-thread task above this (ms) counts as a "long task". */
export const LONG_TASK_THRESHOLD = 50;

/** 60fps frame budget (ms). */
export const FRAME_BUDGET = 1000 / 60;

/** Memory poll interval (ms). */
export const MEMORY_POLL_INTERVAL = 10_000;

/** Quiet window that ends an interaction session (ms). */
export const INTERACTION_QUIET_WINDOW = 500;

/** Circuit breaker: throttle when our own overhead exceeds this fraction of a frame. */
export const OVERHEAD_THROTTLE_THRESHOLD = 0.02; // 2%
export const OVERHEAD_DISABLE_THRESHOLD = 0.05; // 5%

/** Time-series bucket width for sparklines (ms). */
export const TIME_SERIES_BUCKET = 5_000;

/**
 * Rolling-window cap on per-script sparkline buckets. Without this, timeSeries
 * grows one entry per bucket for the whole session and is rebuilt + shipped in
 * every snapshot (~4Hz), so a long session bloats both memory and per-snapshot
 * CPU. 360 buckets = 30 min of trend, which is plenty for a sparkline.
 */
export const MAX_TIME_SERIES_BUCKETS = 360;

export const SEVERITY_COLORS: Record<string, string> = {
  critical: '#EF4444',
  warning: '#F59E0B',
  info: '#3B82F6',
  success: '#10B981',
  neutral: '#6B7280',
};

/** Health score weights (must sum to 1). */
export const HEALTH_WEIGHTS = {
  longTask: 0.3,
  inp: 0.25,
  cls: 0.15,
  memory: 0.1,
  network: 0.1,
  frameDrop: 0.1,
} as const;

/**
 * Opt-in collector modules (Phase 2). Each adds main-thread overhead, so they
 * stay off until the user enables them — the substrate the WebSocket/Worker/
 * heatmap/replay/flow features check before doing any work. Persisted in
 * settings and (for collector-side modules) passed in at injection time.
 */
export interface CollectorFeatureFlags {
  websocketMonitor: boolean;
  workerMonitor: boolean;
  flowRecorder: boolean;
  heatmap: boolean;
  replay: boolean;
}

export const DEFAULT_FEATURE_FLAGS: CollectorFeatureFlags = {
  websocketMonitor: false,
  workerMonitor: false,
  flowRecorder: false,
  heatmap: false,
  replay: false,
};

/** Core Web Vitals thresholds (good / needs-improvement boundaries). */
export const CWV_THRESHOLDS = {
  lcp: { good: 2500, poor: 4000 },
  inp: { good: 200, poor: 500 },
  cls: { good: 0.1, poor: 0.25 },
  fcp: { good: 1800, poor: 3000 },
} as const;
