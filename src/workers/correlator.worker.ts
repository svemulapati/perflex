/// <reference lib="webworker" />
/**
 * Correlator worker shell. Owns a Correlator instance, ingests event batches,
 * and posts back a fresh SessionSnapshot (throttled to ~4Hz so the UI stays
 * smooth even under heavy event volume).
 */
import type { CollectorEvent } from '@/shared/types';
import { Correlator } from './correlator-core';

type InMessage =
  | { type: 'init'; tabId: number; url: string; pageOrigin: string; allowlist: string[] }
  | { type: 'events'; events: CollectorEvent[] }
  | { type: 'meta'; fps: number; frameHealth: number }
  | { type: 'reset' }
  | { type: 'flush' }
  | { type: 'export' };

let correlator = new Correlator();
let tabId = -1;
let url = '';
let dirty = false;
let snapshotTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSnapshot(): void {
  if (snapshotTimer !== null) return;
  snapshotTimer = setTimeout(() => {
    snapshotTimer = null;
    if (!dirty) return;
    dirty = false;
    postSnapshot();
  }, 250);
}

function postSnapshot(): void {
  const snapshot = correlator.snapshot(tabId, url);
  (self as DedicatedWorkerGlobalScope).postMessage({ type: 'snapshot', snapshot });
}

self.onmessage = (e: MessageEvent<InMessage>) => {
  const msg = e.data;
  switch (msg.type) {
    case 'init':
      tabId = msg.tabId;
      url = msg.url;
      correlator = new Correlator(msg.pageOrigin, msg.allowlist);
      dirty = true;
      scheduleSnapshot();
      break;
    case 'events':
      correlator.ingest(msg.events);
      dirty = true;
      scheduleSnapshot();
      break;
    case 'meta':
      correlator.setMeta(msg.fps, msg.frameHealth);
      dirty = true;
      scheduleSnapshot();
      break;
    case 'reset':
      correlator.reset();
      dirty = true;
      postSnapshot();
      break;
    case 'flush':
      postSnapshot();
      break;
    case 'export':
      (self as DedicatedWorkerGlobalScope).postMessage({
        type: 'export',
        bundle: correlator.exportBundle(tabId, url),
      });
      break;
  }
};
