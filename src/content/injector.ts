/**
 * Isolated-world content script. The MAIN-world collector cannot reach chrome.*,
 * so this bridge listens for its window.postMessage events and relays them to
 * the background service worker, which routes to the side panel.
 */
import type { CollectorEvent, RuntimeMessage } from '@/shared/types';

const PERFLEX_MESSAGE_SOURCE = 'perflex-collector';

// NOTE: The MAIN-world collector is injected by the background service worker
// via chrome.scripting.executeScript({ world: 'MAIN' }), NOT by a <script> tag
// here. Browser-performed injection bypasses the page's Content-Security-Policy,
// which a chrome-extension:// <script src> does not (Chrome exempts it, Arc and
// other Chromium forks do not). This file is purely the isolated-world bridge.

interface CollectorMessage {
  source: typeof PERFLEX_MESSAGE_SOURCE;
  kind: 'events' | 'meta';
  events?: CollectorEvent[];
  throttleLevel?: string;
  fps?: number;
  frameHealth?: number;
}

let pending: CollectorEvent[] = [];
let flushScheduled = false;

function flushNow(): void {
  flushScheduled = false;
  if (pending.length === 0) return;
  const events = pending;
  pending = [];
  const msg: RuntimeMessage = { type: 'perflex:events', events };
  try {
    chrome.runtime.sendMessage(msg).catch(() => {});
  } catch {
    /* extension context invalidated (e.g. reload) — ignore */
  }
}

function scheduleFlush(): void {
  if (flushScheduled) return;
  flushScheduled = true;
  // Coalesce relays to the worker to keep messaging cheap.
  setTimeout(flushNow, 150);
}

window.addEventListener('message', (e: MessageEvent) => {
  if (e.source !== window) return;
  const data = e.data as CollectorMessage | undefined;
  if (!data || data.source !== PERFLEX_MESSAGE_SOURCE) return;

  if (data.kind === 'events' && data.events) {
    pending.push(...data.events);
    // Relay user-input events immediately — a navigating click can tear the
    // page down before the 150ms coalescing window elapses.
    if (data.events.some((ev) => ev.kind === 'interaction')) flushNow();
    else scheduleFlush();
  } else if (data.kind === 'meta') {
    // Forward live meta immediately (fps/throttle) — small and time-sensitive.
    try {
      chrome.runtime
        .sendMessage({ type: 'perflex:meta', ...data } as unknown as RuntimeMessage)
        .catch(() => {});
    } catch {
      /* ignore */
    }
  }
});

// Relay overlay-toggle commands from the extension down into the page.
chrome.runtime.onMessage.addListener((message: RuntimeMessage) => {
  if (message.type === 'perflex:toggle-overlay') {
    window.postMessage({ source: 'perflex-control', action: 'toggle-overlay' }, '*');
  }
});
