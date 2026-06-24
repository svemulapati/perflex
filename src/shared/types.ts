/**
 * Perflex — shared type contracts.
 *
 * These types are the wire format between the Collector (content/MAIN world),
 * the Correlator/Analyzer (web workers) and the Reporter (React UI).
 * Keep them serialization-friendly (no class instances, no functions).
 */

export type ScriptClassification =
  | 'first-party'
  | 'third-party-known'
  | 'third-party-unknown'
  | 'inline';

export type ThirdPartyCategory =
  | 'analytics'
  | 'marketing'
  | 'payments'
  | 'support'
  | 'ab-testing'
  | 'tag-manager'
  | 'cdn'
  | 'social'
  | 'other';

export type EventKind =
  | 'resource'
  | 'longtask'
  | 'long-animation-frame'
  | 'event'
  | 'lcp'
  | 'layout-shift'
  | 'first-input'
  | 'paint'
  | 'navigation'
  | 'element'
  | 'network'
  | 'reflow'
  | 'mutation'
  | 'frame'
  | 'memory'
  | 'timer'
  | 'interaction'
  | 'json-parse'
  | 'dom-query'
  | 'runtime-stats'
  | 'framework';

/** Base shape every captured event shares. */
export interface BaseEvent {
  /** Monotonic sequence id assigned by the collector. */
  seq: number;
  kind: EventKind;
  /** performance.now() relative timestamp (ms). */
  timestamp: number;
  /** Stack fingerprint (FNV-1a, 32-bit) of the originating call site, if known. */
  fingerprint?: number;
}

export interface ResourceEvent extends BaseEvent {
  kind: 'resource';
  url: string;
  initiatorType: string;
  startTime: number;
  duration: number;
  transferSize: number;
  encodedBodySize: number;
  decodedBodySize: number;
  renderBlockingStatus?: string;
  dns: number;
  tcp: number;
  tls: number;
  ttfb: number;
  download: number;
  responseStatus?: number;
}

export interface LongTaskEvent extends BaseEvent {
  kind: 'longtask';
  startTime: number;
  duration: number;
  attribution: Array<{
    containerType?: string;
    containerSrc?: string;
    containerId?: string;
    containerName?: string;
  }>;
}

export interface LoAFScript {
  sourceURL: string;
  sourceFunctionName: string;
  sourceCharPosition: number;
  duration: number;
  invoker?: string;
  invokerType?: string;
}

export interface LongAnimationFrameEvent extends BaseEvent {
  kind: 'long-animation-frame';
  startTime: number;
  duration: number;
  blockingDuration: number;
  scriptDuration: number;
  styleAndLayoutDuration: number;
  scripts: LoAFScript[];
}

export interface InteractionTimingEvent extends BaseEvent {
  kind: 'event';
  name: string;
  startTime: number;
  duration: number;
  processingStart: number;
  processingEnd: number;
  interactionId?: number;
}

export interface LCPEvent extends BaseEvent {
  kind: 'lcp';
  renderTime: number;
  loadTime: number;
  size: number;
  elementTag?: string;
  url?: string;
}

export interface LayoutShiftEvent extends BaseEvent {
  kind: 'layout-shift';
  value: number;
  hadRecentInput: boolean;
  lastInputTime: number;
  sources: Array<{ nodeName?: string; nodeDescription?: string }>;
}

export interface FirstInputEvent extends BaseEvent {
  kind: 'first-input';
  name: string;
  startTime: number;
  processingStart: number;
  duration: number;
}

export interface PaintEvent extends BaseEvent {
  kind: 'paint';
  name: 'first-paint' | 'first-contentful-paint';
  startTime: number;
}

export interface NavigationEvent extends BaseEvent {
  kind: 'navigation';
  domContentLoaded: number;
  loadEventEnd: number;
  responseEnd: number;
  type: string;
}

export interface NetworkEvent extends BaseEvent {
  kind: 'network';
  url: string;
  method: string;
  api: 'fetch' | 'xhr';
  async: boolean;
  requestBodySize: number;
  responseStatus?: number;
  responseBodySize?: number;
  responseBodyHash?: number;
  requestBodyHash?: number;
  duration: number;
  startTime: number;
  contentEncoding?: string;
}

export interface ReflowEvent extends BaseEvent {
  kind: 'reflow';
  property: string;
  precedingWrite?: string;
}

export interface MutationSummary extends BaseEvent {
  kind: 'mutation';
  addedNodes: number;
  removedNodes: number;
  attributeChanges: number;
  targetDepth: number;
}

export interface FrameEvent extends BaseEvent {
  kind: 'frame';
  frameDuration: number;
  overrun: number;
}

export interface MemoryEvent extends BaseEvent {
  kind: 'memory';
  usedJSHeapSize: number;
  totalJSHeapSize?: number;
}

export interface TimerEvent extends BaseEvent {
  kind: 'timer';
  api: 'setTimeout' | 'setInterval' | 'requestAnimationFrame' | 'requestIdleCallback';
  callbackDuration: number;
  requestedDelay?: number;
  actualDelay?: number;
  activeCount: number;
}

export interface InteractionTriggerEvent extends BaseEvent {
  kind: 'interaction';
  /** Generated session id this trigger opens. */
  interactionId: string;
  inputType: string;
  target: string;
}

export interface JsonParseEvent extends BaseEvent {
  kind: 'json-parse';
  size: number;
  duration: number;
}

export interface DomQueryEvent extends BaseEvent {
  kind: 'dom-query';
  selector: string;
  complexity: number;
  duration: number;
  resultCount: number;
}

export interface DetectedFramework {
  name: string;
  version?: string;
  major?: number;
  /** True when a non-production (development) build is detected. */
  devBuild?: boolean;
  /** A meta-framework (Next/Nuxt) rather than a UI library. */
  meta?: boolean;
}

export interface FrameworkEvent extends BaseEvent {
  kind: 'framework';
  frameworks: DetectedFramework[];
}

/** Periodic snapshot of page-wide runtime stats (sampled, low frequency). */
export interface RuntimeStatsEvent extends BaseEvent {
  kind: 'runtime-stats';
  consolePerSec: number;
  domElementCount: number;
  domMaxDepth: number;
  longestSiblingRun: number;
  willChangeCount: number;
  syncXhrCount: number;
  hiFreqScrollPerSec: number;
  hiFreqMovePerSec: number;
  documentWriteCount: number;
  documentWriteBytes: number;
}

export type CollectorEvent =
  | ResourceEvent
  | LongTaskEvent
  | LongAnimationFrameEvent
  | InteractionTimingEvent
  | LCPEvent
  | LayoutShiftEvent
  | FirstInputEvent
  | PaintEvent
  | NavigationEvent
  | NetworkEvent
  | ReflowEvent
  | MutationSummary
  | FrameEvent
  | MemoryEvent
  | TimerEvent
  | InteractionTriggerEvent
  | JsonParseEvent
  | DomQueryEvent
  | RuntimeStatsEvent
  | FrameworkEvent;

/** Trigger that opened an interaction session. */
export interface InteractionTrigger {
  type: string;
  target: string;
  timestamp: number;
}

/** One inferred causal step within an interaction (click → task → fetch → …). */
export interface CausalStep {
  kind: 'trigger' | 'longtask' | 'network' | 'mutation' | 'layout-shift' | 'reflow' | 'paint';
  label: string;
  /** ms relative to the interaction trigger. */
  offset: number;
  duration?: number;
  detail?: string;
}

export interface InteractionSession {
  id: string;
  trigger: InteractionTrigger;
  duration: number;
  inProgress: boolean;
  /** Composite 0-100 responsiveness score for this interaction. */
  health: number;
  networkCalls: NetworkEvent[];
  longTasks: LongTaskEvent[];
  domMutations: MutationSummary[];
  layoutShifts: LayoutShiftEvent[];
  forcedReflows: ReflowEvent[];
  frameBudgetViolations: FrameEvent[];
  causalChain: CausalStep[];
  metrics: {
    totalBlockingTime: number;
    totalNetworkTime: number;
    totalDOMMutations: number;
    cumulativeLayoutShift: number;
    interactionToNextPaint: number;
  };
}

/* ---- Compact timeline lane data (cheap to render & transfer) ---- */

export interface TimelineTask {
  start: number;
  duration: number;
  scriptUrl: string;
}
export interface TimelineNetwork {
  start: number;
  duration: number;
  url: string;
  initiatorType: string;
  status?: number;
  // Timing-phase breakdown + size for the network waterfall (Feature 6).
  dns: number;
  tcp: number;
  tls: number;
  ttfb: number;
  download: number;
  transferSize: number;
  renderBlocking?: boolean;
}
export interface TimelineShift {
  time: number;
  value: number;
}
export interface TimelineFrame {
  time: number;
  overrun: number;
  frameDuration: number;
}
export interface TimelineMemory {
  time: number;
  used: number;
}
export interface TimelineInteraction {
  id: string;
  start: number;
  duration: number;
  type: string;
  target: string;
  health: number;
  inProgress: boolean;
}
export interface TimelineData {
  start: number;
  end: number;
  longTasks: TimelineTask[];
  network: TimelineNetwork[];
  layoutShifts: TimelineShift[];
  frames: TimelineFrame[];
  memory: TimelineMemory[];
  interactions: TimelineInteraction[];
}

export interface FunctionProfile {
  functionName: string;
  scriptUrl: string;
  charPosition: number;
  invocationCount: number;
  totalDuration: number;
  averageDuration: number;
  maxDuration: number;
  calledDuring: string[];
}

export interface ScriptMetrics {
  totalMainThreadTime: number;
  longTaskCount: number;
  averageLongTaskDuration: number;
  maxLongTaskDuration: number;
  networkRequestCount: number;
  totalNetworkTime: number;
  totalTransferSize: number;
  forcedReflowCount: number;
  layoutShiftContribution: number;
  memoryGrowthRate: number;
  estimatedCompileTime: number;
  frameDropsAttributed: number;
}

export interface ScriptProfile {
  url: string;
  origin: string;
  classification: ScriptClassification;
  category?: ThirdPartyCategory;
  metrics: ScriptMetrics;
  hotFunctions: FunctionProfile[];
  interactions: string[];
  /** Main-thread time per 5s bucket, for sparkline rendering. */
  timeSeries: number[];
}

export type FindingCategory =
  | 'loading'
  | 'execution'
  | 'rendering'
  | 'network'
  | 'third-party'
  | 'framework';

export type Severity = 'critical' | 'warning' | 'info';

export interface RemediationPlan {
  summary: string;
  detailed: string;
  codeExample?: {
    before: string;
    after: string;
    language: string;
  };
  riskLevel: 'safe' | 'verify' | 'review';
  riskExplanation: string;
  estimatedImpact: string;
  validationSteps: string[];
  businessSafetyNote: string;
  relatedResources: { title: string; url: string }[];
  source?: 'template' | 'ai';
}

export interface PerformanceFinding {
  id: string;
  patternId: string;
  patternName: string;
  category: FindingCategory;
  severity: Severity;
  confidence: number;
  description: string;
  evidence: {
    scriptUrl?: string;
    functionName?: string;
    lineNumber?: number;
    charPosition?: number;
    stackFingerprint?: number;
    sampleEntries: unknown[];
  };
  impact: {
    frequency: number;
    totalDuration: number;
    affectedInteractions: string[];
    estimatedUserImpact: 'high' | 'medium' | 'low';
    coreWebVitalAffected?: 'LCP' | 'INP' | 'CLS';
  };
  remediation?: RemediationPlan;
}

export interface CoreWebVitals {
  lcp: number | null;
  inp: number | null;
  cls: number;
  fcp: number | null;
  fp: number | null;
  ttfb: number | null;
}

export interface SessionSnapshot {
  tabId: number;
  url: string;
  startedAt: number;
  updatedAt: number;
  healthScore: number;
  vitals: CoreWebVitals;
  totalBlockingTime: number;
  heapSize: number;
  frameDropRate: number;
  networkRequestCount: number;
  scripts: ScriptProfile[];
  findings: PerformanceFinding[];
  interactions: InteractionSession[];
  timeline: TimelineData;
  frameworks: DetectedFramework[];
  fps: number;
}

/** Rich, on-demand payload for exports (heavier than a live snapshot). */
export interface ExportBundle {
  snapshot: SessionSnapshot;
  resources: ResourceEvent[];
  network: NetworkEvent[];
}

/** Everything the analyzer's anti-pattern matchers operate on. */
export interface AnalysisInput {
  pageOrigin: string;
  allowlist: string[];
  durationMs: number;
  fcp: number | null;
  vitals: CoreWebVitals;
  scripts: ScriptProfile[];
  interactions: InteractionSession[];
  timeline: TimelineData;
  resources: ResourceEvent[];
  network: NetworkEvent[];
  reflows: ReflowEvent[];
  timers: { maxActive: number; rafCount: number; rafLongCount: number };
  jsonParses: JsonParseEvent[];
  domQueries: DomQueryEvent[];
  runtime: RuntimeStatsEvent | null;
  frameworks: DetectedFramework[];
  memory: { growthRatePerMin: number; sampleCount: number; spanMs: number };
}

/* ---- Messaging envelopes ---- */

export type CollectorToWorker = {
  type: 'events';
  events: CollectorEvent[];
};

export type WorkerToPanel = {
  type: 'snapshot';
  snapshot: SessionSnapshot;
};

/** Messages between content-script bridge and background/panel. */
export type RuntimeMessage =
  | { type: 'perflex:events'; tabId?: number; events: CollectorEvent[] }
  | { type: 'perflex:snapshot'; tabId: number; snapshot: SessionSnapshot }
  | { type: 'perflex:request-snapshot'; tabId: number }
  | { type: 'perflex:set-recording'; recording: boolean }
  | { type: 'perflex:toggle-overlay' };
