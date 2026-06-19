/**
 * Correlator core — pure, testable event-fusion + attribution engine.
 *
 * It ingests batches of CollectorEvents (stateful, across the whole session)
 * and produces a SessionSnapshot: per-script profiles, function hotspots,
 * Core Web Vitals, a composite health score, assembled interaction sessions
 * (with causal chains), and compact timeline lane data.
 */
import type {
  AnalysisInput,
  CausalStep,
  CollectorEvent,
  CoreWebVitals,
  DetectedFramework,
  DomQueryEvent,
  ExportBundle,
  FunctionProfile,
  InteractionSession,
  InteractionTrigger,
  JsonParseEvent,
  NetworkEvent,
  PerformanceFinding,
  ReflowEvent,
  ResourceEvent,
  RuntimeStatsEvent,
  ScriptProfile,
  SessionSnapshot,
  TimelineData,
} from '@/shared/types';
import { analyze } from '@/shared/anti-patterns';
import {
  CWV_THRESHOLDS,
  HEALTH_WEIGHTS,
  INTERACTION_QUIET_WINDOW,
  LONG_TASK_THRESHOLD,
  TIME_SERIES_BUCKET,
} from '@/shared/constants';
import { classifyScript } from '@/shared/script-classifier';

interface ScriptAccumulator {
  url: string;
  mainThreadTime: number;
  longTaskCount: number;
  longTaskDurations: number[];
  networkRequestCount: number;
  networkTime: number;
  transferSize: number;
  forcedReflowCount: number;
  layoutShiftContribution: number;
  estimatedCompileTime: number;
  frameDropsAttributed: number;
  interactions: Set<string>;
  buckets: Map<number, number>;
  functions: Map<string, FunctionProfile>;
}

/** Per-lane caps so a long session can't grow timeline arrays without bound. */
const TIMELINE_CAP = 3000;
/** Per-session embedded-array cap (for the detail panel). */
const SESSION_EVENT_CAP = 60;
const COMPLETED_SESSION_CAP = 200;

function normalizeUrl(url: string): string {
  if (!url) return '(inline)';
  try {
    const u = new URL(url);
    return u.origin + u.pathname;
  } catch {
    return url;
  }
}

function fileLabel(url: string): string {
  if (!url || url === 'unknown') return 'unknown';
  try {
    const u = new URL(url);
    return u.pathname.split('/').filter(Boolean).pop() || u.hostname;
  } catch {
    return url;
  }
}

function cappedPush<T>(arr: T[], item: T, cap: number): void {
  arr.push(item);
  if (arr.length > cap) arr.shift();
}

function newSession(trigger: InteractionTrigger): InteractionSession {
  return {
    id: `int-${trigger.timestamp.toFixed(0)}`,
    trigger,
    duration: 0,
    inProgress: true,
    health: 100,
    networkCalls: [],
    longTasks: [],
    domMutations: [],
    layoutShifts: [],
    forcedReflows: [],
    frameBudgetViolations: [],
    causalChain: [],
    metrics: {
      totalBlockingTime: 0,
      totalNetworkTime: 0,
      totalDOMMutations: 0,
      cumulativeLayoutShift: 0,
      interactionToNextPaint: 0,
    },
  };
}

export class Correlator {
  private scripts = new Map<string, ScriptAccumulator>();
  private sessionStart = Infinity;
  private lastTimestamp = 0;

  private vitals: CoreWebVitals = {
    lcp: null,
    inp: null,
    cls: 0,
    fcp: null,
    fp: null,
    ttfb: null,
  };
  private totalBlockingTime = 0;
  private heapSamples: { t: number; used: number }[] = [];
  private frameDrops = 0;
  private frameCount = 0;
  private networkRequestCount = 0;
  private interactionDurations: number[] = [];

  // Interaction-session assembly.
  private openSession: InteractionSession | null = null;
  private sessionLastActivity = 0;
  private completedSessions: InteractionSession[] = [];

  // Raw signal retained for the analyzer (capped).
  private resources: ResourceEvent[] = [];
  private networks: NetworkEvent[] = [];
  private reflowEvents: ReflowEvent[] = [];
  private jsonParses: JsonParseEvent[] = [];
  private domQueries: DomQueryEvent[] = [];
  private timerMaxActive = 0;
  private rafCount = 0;
  private rafLongCount = 0;
  private syncXhrCount = 0;
  private latestRuntime: RuntimeStatsEvent | null = null;
  private frameworks: DetectedFramework[] = [];

  // Timeline lanes.
  private tlLongTasks: TimelineData['longTasks'] = [];
  private tlNetwork: TimelineData['network'] = [];
  private tlShifts: TimelineData['layoutShifts'] = [];
  private tlFrames: TimelineData['frames'] = [];
  private tlMemory: TimelineData['memory'] = [];

  private fps = 60;
  private frameHealth = 100;

  private pageOrigin: string;
  private allowlist: string[];

  constructor(pageOrigin = '', allowlist: string[] = []) {
    this.pageOrigin = pageOrigin;
    this.allowlist = allowlist;
  }

  setMeta(fps: number, frameHealth: number): void {
    this.fps = fps;
    this.frameHealth = frameHealth;
  }

  private get currentInteractionId(): string | null {
    return this.openSession?.id ?? null;
  }

  private acc(url: string): ScriptAccumulator {
    const key = normalizeUrl(url);
    let a = this.scripts.get(key);
    if (!a) {
      a = {
        url: key,
        mainThreadTime: 0,
        longTaskCount: 0,
        longTaskDurations: [],
        networkRequestCount: 0,
        networkTime: 0,
        transferSize: 0,
        forcedReflowCount: 0,
        layoutShiftContribution: 0,
        estimatedCompileTime: 0,
        frameDropsAttributed: 0,
        interactions: new Set(),
        buckets: new Map(),
        functions: new Map(),
      };
      this.scripts.set(key, a);
    }
    return a;
  }

  private bucketOf(timestamp: number): number {
    if (this.sessionStart === Infinity) return 0;
    return Math.floor((timestamp - this.sessionStart) / TIME_SERIES_BUCKET);
  }

  ingest(events: CollectorEvent[]): void {
    for (const event of events) {
      if (event.timestamp < this.sessionStart) this.sessionStart = event.timestamp;
      if (event.timestamp > this.lastTimestamp) this.lastTimestamp = event.timestamp;

      // Close a stale session before routing the next (non-trigger) event.
      if (
        this.openSession &&
        event.kind !== 'interaction' &&
        event.timestamp - this.sessionLastActivity > INTERACTION_QUIET_WINDOW
      ) {
        this.closeSession();
      }

      this.handle(event);
    }
  }

  // ---- interaction-session lifecycle ----

  private closeSession(): void {
    const s = this.openSession;
    if (!s) return;
    s.inProgress = false;
    s.duration = Math.max(0, this.sessionLastActivity - s.trigger.timestamp);
    s.causalChain = this.buildCausalChain(s);
    s.health = this.sessionHealth(s);
    cappedPush(this.completedSessions, s, COMPLETED_SESSION_CAP);
    this.openSession = null;
  }

  private buildCausalChain(s: InteractionSession): CausalStep[] {
    const t0 = s.trigger.timestamp;
    const steps: CausalStep[] = [
      { kind: 'trigger', label: `${s.trigger.type} → ${s.trigger.target}`, offset: 0 },
    ];
    for (const lt of s.longTasks)
      steps.push({ kind: 'longtask', label: 'Long task', offset: lt.startTime - t0, duration: lt.duration });
    for (const n of s.networkCalls)
      steps.push({
        kind: 'network',
        label: `${n.method} ${fileLabel(n.url)}`,
        offset: n.startTime - t0,
        duration: n.duration,
        detail: n.responseStatus ? String(n.responseStatus) : undefined,
      });
    for (const m of s.domMutations)
      steps.push({
        kind: 'mutation',
        label: `DOM ±${m.addedNodes + m.removedNodes} nodes`,
        offset: m.timestamp - t0,
      });
    for (const r of s.forcedReflows)
      steps.push({ kind: 'reflow', label: `Forced reflow (${r.property})`, offset: r.timestamp - t0 });
    for (const ls of s.layoutShifts)
      steps.push({ kind: 'layout-shift', label: `Layout shift ${ls.value.toFixed(3)}`, offset: ls.timestamp - t0 });

    return steps.sort((a, b) => a.offset - b.offset).slice(0, 24);
  }

  private sessionHealth(s: InteractionSession): number {
    const { totalBlockingTime, cumulativeLayoutShift, interactionToNextPaint } = s.metrics;
    const score =
      100 - totalBlockingTime * 0.5 - interactionToNextPaint * 0.15 - cumulativeLayoutShift * 200;
    return Math.round(Math.max(0, Math.min(100, score)));
  }

  /** Route an event into the open interaction session (if any). */
  private addToSession(event: CollectorEvent): void {
    const s = this.openSession;
    if (!s) return;
    // Any non-memory event keeps the session "alive".
    this.sessionLastActivity = Math.max(this.sessionLastActivity, event.timestamp);
    switch (event.kind) {
      case 'network':
        cappedPush(s.networkCalls, event, SESSION_EVENT_CAP);
        s.metrics.totalNetworkTime += event.duration;
        break;
      case 'longtask':
        cappedPush(s.longTasks, event, SESSION_EVENT_CAP);
        s.metrics.totalBlockingTime += Math.max(0, event.duration - LONG_TASK_THRESHOLD);
        break;
      case 'mutation':
        cappedPush(s.domMutations, event, SESSION_EVENT_CAP);
        s.metrics.totalDOMMutations += event.addedNodes + event.removedNodes + event.attributeChanges;
        break;
      case 'layout-shift':
        if (!event.hadRecentInput) {
          cappedPush(s.layoutShifts, event, SESSION_EVENT_CAP);
          s.metrics.cumulativeLayoutShift += event.value;
        }
        break;
      case 'reflow':
        cappedPush(s.forcedReflows, event, SESSION_EVENT_CAP);
        break;
      case 'frame':
        cappedPush(s.frameBudgetViolations, event, SESSION_EVENT_CAP);
        break;
      case 'event':
        s.metrics.interactionToNextPaint = Math.max(s.metrics.interactionToNextPaint, event.duration);
        break;
    }
  }

  private handle(event: CollectorEvent): void {
    // Feed the open interaction session first (except triggers, handled below).
    if (event.kind !== 'interaction' && event.kind !== 'memory') this.addToSession(event);

    switch (event.kind) {
      case 'interaction': {
        // A new user input opens a fresh session; close any prior one.
        this.closeSession();
        this.openSession = newSession({
          type: event.inputType,
          target: event.target,
          timestamp: event.timestamp,
        });
        this.sessionLastActivity = event.timestamp;
        break;
      }

      case 'long-animation-frame': {
        for (const scr of event.scripts) {
          const a = this.acc(scr.sourceURL);
          a.mainThreadTime += scr.duration;
          const bucket = this.bucketOf(event.timestamp);
          a.buckets.set(bucket, (a.buckets.get(bucket) ?? 0) + scr.duration);
          if (this.currentInteractionId) a.interactions.add(this.currentInteractionId);

          const fnKey = `${scr.sourceFunctionName}@${scr.sourceCharPosition}`;
          let fn = a.functions.get(fnKey);
          if (!fn) {
            fn = {
              functionName: scr.sourceFunctionName,
              scriptUrl: a.url,
              charPosition: scr.sourceCharPosition,
              invocationCount: 0,
              totalDuration: 0,
              averageDuration: 0,
              maxDuration: 0,
              calledDuring: [],
            };
            a.functions.set(fnKey, fn);
          }
          fn.invocationCount++;
          fn.totalDuration += scr.duration;
          fn.maxDuration = Math.max(fn.maxDuration, scr.duration);
          fn.averageDuration = fn.totalDuration / fn.invocationCount;
        }
        if (event.blockingDuration > 0) this.totalBlockingTime += event.blockingDuration;
        break;
      }

      case 'longtask': {
        this.totalBlockingTime += Math.max(0, event.duration - LONG_TASK_THRESHOLD);
        const src = event.attribution.find((a) => a.containerSrc)?.containerSrc ?? 'unknown';
        const a = this.acc(src);
        a.longTaskCount++;
        a.longTaskDurations.push(event.duration);
        a.mainThreadTime += event.duration;
        const bucket = this.bucketOf(event.timestamp);
        a.buckets.set(bucket, (a.buckets.get(bucket) ?? 0) + event.duration);
        if (this.currentInteractionId) a.interactions.add(this.currentInteractionId);
        cappedPush(this.tlLongTasks, { start: event.startTime, duration: event.duration, scriptUrl: normalizeUrl(src) }, TIMELINE_CAP);
        break;
      }

      case 'resource': {
        if (event.initiatorType === 'script') {
          const a = this.acc(event.url);
          a.networkRequestCount++;
          a.networkTime += event.duration;
          a.transferSize += event.transferSize;
          a.estimatedCompileTime += event.decodedBodySize / 10_240;
        }
        this.networkRequestCount++;
        if (this.vitals.ttfb === null && event.ttfb > 0) this.vitals.ttfb = event.ttfb;
        cappedPush(this.resources, event, TIMELINE_CAP);
        cappedPush(
          this.tlNetwork,
          {
            start: event.startTime,
            duration: event.duration,
            url: event.url,
            initiatorType: event.initiatorType,
            status: event.responseStatus,
          },
          TIMELINE_CAP
        );
        break;
      }

      case 'lcp': {
        this.vitals.lcp = event.renderTime || event.loadTime || this.vitals.lcp;
        break;
      }

      case 'paint': {
        if (event.name === 'first-paint') this.vitals.fp = event.startTime;
        else this.vitals.fcp = event.startTime;
        break;
      }

      case 'layout-shift': {
        if (!event.hadRecentInput) {
          this.vitals.cls += event.value;
          cappedPush(this.tlShifts, { time: event.timestamp, value: event.value }, TIMELINE_CAP);
        }
        break;
      }

      case 'event': {
        // Bounded: this is sorted on every snapshot, so it must not grow with
        // session length. The most recent samples are what INP cares about.
        this.interactionDurations.push(event.duration);
        if (this.interactionDurations.length > 1000) this.interactionDurations.shift();
        break;
      }

      case 'navigation': {
        if (this.vitals.ttfb === null) this.vitals.ttfb = event.responseEnd;
        break;
      }

      case 'memory': {
        this.heapSamples.push({ t: event.timestamp, used: event.usedJSHeapSize });
        if (this.heapSamples.length > 500) this.heapSamples.shift();
        cappedPush(this.tlMemory, { time: event.timestamp, used: event.usedJSHeapSize }, TIMELINE_CAP);
        break;
      }

      case 'frame': {
        this.frameDrops++;
        this.frameCount++;
        cappedPush(
          this.tlFrames,
          { time: event.timestamp, overrun: event.overrun, frameDuration: event.frameDuration },
          TIMELINE_CAP
        );
        break;
      }

      case 'reflow': {
        this.acc('unknown').forcedReflowCount++;
        cappedPush(this.reflowEvents, event, TIMELINE_CAP);
        break;
      }

      case 'network': {
        cappedPush(this.networks, event, TIMELINE_CAP);
        if (!event.async) this.syncXhrCount++;
        break;
      }

      case 'timer': {
        this.timerMaxActive = Math.max(this.timerMaxActive, event.activeCount);
        if (event.api === 'requestAnimationFrame') {
          this.rafCount++;
          if (event.callbackDuration > 5) this.rafLongCount++;
        }
        break;
      }

      case 'json-parse': {
        cappedPush(this.jsonParses, event, TIMELINE_CAP);
        break;
      }

      case 'dom-query': {
        cappedPush(this.domQueries, event, TIMELINE_CAP);
        break;
      }

      case 'runtime-stats': {
        this.latestRuntime = event;
        break;
      }

      case 'framework': {
        // Keep the richest detection seen (later scans pick up late-booting apps).
        if (event.frameworks.length >= this.frameworks.length) this.frameworks = event.frameworks;
        break;
      }
    }
  }

  private currentInp(): number | null {
    if (this.interactionDurations.length === 0) return null;
    const sorted = [...this.interactionDurations].sort((x, y) => x - y);
    const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.98));
    return sorted[idx];
  }

  private memoryGrowthRate(): number {
    if (this.heapSamples.length < 2) return 0;
    const first = this.heapSamples[0];
    const last = this.heapSamples[this.heapSamples.length - 1];
    const minutes = (last.t - first.t) / 60_000;
    if (minutes <= 0) return 0;
    return (last.used - first.used) / minutes;
  }

  private buildProfiles(): ScriptProfile[] {
    const maxBucket = this.bucketOf(this.lastTimestamp);
    const profiles: ScriptProfile[] = [];
    for (const a of this.scripts.values()) {
      const c = classifyScript(a.url, this.pageOrigin, this.allowlist);
      const timeSeries: number[] = [];
      for (let i = 0; i <= maxBucket; i++) timeSeries.push(a.buckets.get(i) ?? 0);
      const hotFunctions = [...a.functions.values()]
        .sort((x, y) => y.totalDuration - x.totalDuration)
        .slice(0, 10);
      profiles.push({
        url: a.url,
        origin: c.origin,
        classification: c.classification,
        category: c.category,
        metrics: {
          totalMainThreadTime: round(a.mainThreadTime),
          longTaskCount: a.longTaskCount,
          averageLongTaskDuration: a.longTaskDurations.length
            ? round(a.longTaskDurations.reduce((s, d) => s + d, 0) / a.longTaskDurations.length)
            : 0,
          maxLongTaskDuration: a.longTaskDurations.length ? round(Math.max(...a.longTaskDurations)) : 0,
          networkRequestCount: a.networkRequestCount,
          totalNetworkTime: round(a.networkTime),
          totalTransferSize: a.transferSize,
          forcedReflowCount: a.forcedReflowCount,
          layoutShiftContribution: round(a.layoutShiftContribution),
          memoryGrowthRate: 0,
          estimatedCompileTime: round(a.estimatedCompileTime),
          frameDropsAttributed: a.frameDropsAttributed,
        },
        hotFunctions,
        interactions: [...a.interactions],
        timeSeries,
      });
    }
    return profiles.sort((x, y) => y.metrics.totalMainThreadTime - x.metrics.totalMainThreadTime);
  }

  private buildInteractions(): InteractionSession[] {
    const all = [...this.completedSessions];
    if (this.openSession) {
      // Snapshot the in-progress session without mutating engine state.
      const live: InteractionSession = {
        ...this.openSession,
        duration: Math.max(0, this.lastTimestamp - this.openSession.trigger.timestamp),
        causalChain: this.buildCausalChain(this.openSession),
        health: this.sessionHealth(this.openSession),
      };
      all.push(live);
    }
    return all.sort((a, b) => b.trigger.timestamp - a.trigger.timestamp);
  }

  private buildTimeline(interactions: InteractionSession[]): TimelineData {
    return {
      start: this.sessionStart === Infinity ? 0 : this.sessionStart,
      end: this.lastTimestamp,
      longTasks: this.tlLongTasks,
      network: this.tlNetwork,
      layoutShifts: this.tlShifts,
      frames: this.tlFrames,
      memory: this.tlMemory,
      interactions: interactions.map((s) => ({
        id: s.id,
        start: s.trigger.timestamp,
        duration: s.duration,
        type: s.trigger.type,
        target: s.trigger.target,
        health: s.health,
        inProgress: s.inProgress,
      })),
    };
  }

  private healthScore(): number {
    const inp = this.currentInp();
    const longTaskTotal = [...this.scripts.values()].reduce((s, a) => s + a.longTaskCount, 0);

    const longTaskScore = clamp(100 - longTaskTotal * 3, 0, 100);
    const inpScore = inp === null ? 100 : scoreByThreshold(inp, CWV_THRESHOLDS.inp.good, CWV_THRESHOLDS.inp.poor);
    const clsScore = scoreByThreshold(this.vitals.cls, CWV_THRESHOLDS.cls.good, CWV_THRESHOLDS.cls.poor);
    const growth = this.memoryGrowthRate();
    const memoryScore = clamp(100 - (growth / (1024 * 1024)) * 20, 0, 100);
    const totalTransfer = [...this.scripts.values()].reduce((s, a) => s + a.transferSize, 0);
    const networkScore = clamp(100 - (totalTransfer / (1024 * 1024)) * 10, 0, 100);
    const frameScore = this.frameHealth;

    const score =
      longTaskScore * HEALTH_WEIGHTS.longTask +
      inpScore * HEALTH_WEIGHTS.inp +
      clsScore * HEALTH_WEIGHTS.cls +
      memoryScore * HEALTH_WEIGHTS.memory +
      networkScore * HEALTH_WEIGHTS.network +
      frameScore * HEALTH_WEIGHTS.frameDrop;
    return Math.round(clamp(score, 0, 100));
  }

  private buildAnalysisInput(
    scripts: ScriptProfile[],
    interactions: InteractionSession[],
    timeline: TimelineData
  ): AnalysisInput {
    return {
      pageOrigin: this.pageOrigin,
      allowlist: this.allowlist,
      durationMs: this.sessionStart === Infinity ? 0 : this.lastTimestamp - this.sessionStart,
      fcp: this.vitals.fcp,
      vitals: { ...this.vitals, inp: this.currentInp() },
      scripts,
      interactions,
      timeline,
      resources: this.resources,
      network: this.networks,
      reflows: this.reflowEvents,
      timers: { maxActive: this.timerMaxActive, rafCount: this.rafCount, rafLongCount: this.rafLongCount },
      jsonParses: this.jsonParses,
      domQueries: this.domQueries,
      runtime: this.latestRuntime,
      frameworks: this.frameworks,
      memory: {
        growthRatePerMin: this.memoryGrowthRate(),
        sampleCount: this.heapSamples.length,
        spanMs:
          this.heapSamples.length >= 2
            ? this.heapSamples[this.heapSamples.length - 1].t - this.heapSamples[0].t
            : 0,
      },
    };
  }

  snapshot(tabId: number, url: string): SessionSnapshot {
    const latestHeap = this.heapSamples[this.heapSamples.length - 1]?.used ?? 0;
    const interactions = this.buildInteractions();
    const scripts = this.buildProfiles();
    const timeline = this.buildTimeline(interactions);
    let findings: PerformanceFinding[] = [];
    try {
      findings = analyze(this.buildAnalysisInput(scripts, interactions, timeline));
    } catch {
      /* analyzer must never break the snapshot */
    }
    return {
      tabId,
      url,
      startedAt: this.sessionStart === Infinity ? 0 : this.sessionStart,
      updatedAt: this.lastTimestamp,
      healthScore: this.healthScore(),
      vitals: { ...this.vitals, inp: this.currentInp() },
      totalBlockingTime: round(this.totalBlockingTime),
      heapSize: latestHeap,
      frameDropRate: this.frameCount > 0 ? this.frameDrops / this.frameCount : 0,
      networkRequestCount: this.networkRequestCount,
      scripts,
      findings,
      interactions,
      timeline,
      frameworks: this.frameworks,
      fps: this.fps,
    };
  }

  /** On-demand rich payload for exports (includes raw resource/network detail). */
  exportBundle(tabId: number, url: string): ExportBundle {
    return {
      snapshot: this.snapshot(tabId, url),
      resources: this.resources,
      network: this.networks,
    };
  }

  reset(): void {
    this.scripts.clear();
    this.sessionStart = Infinity;
    this.lastTimestamp = 0;
    this.vitals = { lcp: null, inp: null, cls: 0, fcp: null, fp: null, ttfb: null };
    this.totalBlockingTime = 0;
    this.heapSamples = [];
    this.frameDrops = 0;
    this.frameCount = 0;
    this.networkRequestCount = 0;
    this.interactionDurations = [];
    this.openSession = null;
    this.sessionLastActivity = 0;
    this.completedSessions = [];
    this.tlLongTasks = [];
    this.tlNetwork = [];
    this.tlShifts = [];
    this.tlFrames = [];
    this.tlMemory = [];
    this.resources = [];
    this.networks = [];
    this.reflowEvents = [];
    this.jsonParses = [];
    this.domQueries = [];
    this.timerMaxActive = 0;
    this.rafCount = 0;
    this.rafLongCount = 0;
    this.syncXhrCount = 0;
    this.latestRuntime = null;
    this.frameworks = [];
  }
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
function scoreByThreshold(value: number, good: number, poor: number): number {
  if (value <= good) return 100;
  if (value >= poor) return 0;
  return Math.round(100 * (1 - (value - good) / (poor - good)));
}
