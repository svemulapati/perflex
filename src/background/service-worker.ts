/**
 * Background service worker. Buffers collector events per tab and streams them
 * to any connected side panel. Correlation/analysis runs in the panel's worker
 * (service workers can't spawn DOM Workers), so this layer is pure routing +
 * a bounded per-tab ring buffer so a freshly-opened panel gets recent history.
 */
import type { CollectorEvent } from '@/shared/types';

const MAX_BUFFER = 20_000;

interface TabState {
  events: CollectorEvent[];
  fps: number;
  frameHealth: number;
  throttleLevel: string;
}

const tabs = new Map<number, TabState>();
const panelPorts = new Map<number, chrome.runtime.Port>();

function getTab(tabId: number): TabState {
  let state = tabs.get(tabId);
  if (!state) {
    state = { events: [], fps: 60, frameHealth: 100, throttleLevel: 'none' };
    tabs.set(tabId, state);
  }
  return state;
}

// The toolbar action shows the popup (default_popup), which then opens the
// dashboard — as a native side panel in Chrome, or a standalone window where
// the sidePanel API is unavailable (e.g. Arc). We intentionally do NOT set
// openPanelOnActionClick: with a default_popup it's redundant in Chrome and
// can interfere with the popup opening in some Chromium forks.

const COLLECTOR_FILE = 'perflex-collector.js';

/**
 * Inject the MAIN-world collector via the scripting API. Browser-performed
 * injection bypasses the page's CSP (unlike a chrome-extension:// <script src>,
 * which Arc/other forks refuse to load). Safe to call repeatedly — the collector
 * guards against double-injection.
 */
async function injectCollector(tabId: number): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      files: [COLLECTOR_FILE],
      injectImmediately: true,
    });
  } catch {
    /* restricted page (chrome://, web store, PDF viewer, …) — skip silently */
  }
}

function isInjectable(url: string | undefined): boolean {
  return !!url && (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('file://'));
}

// On every top-frame navigation: reset the (now-stale) buffer and re-inject the
// collector into the fresh document.
chrome.webNavigation?.onCommitted?.addListener((details) => {
  if (details.frameId !== 0) return;
  tabs.delete(details.tabId);
  panelPorts.get(details.tabId)?.postMessage({ type: 'reset' });
  if (isInjectable(details.url)) void injectCollector(details.tabId);
});

// Inject into already-open tabs when the extension is installed/updated/reloaded,
// so the user doesn't have to manually refresh every tab.
chrome.runtime.onInstalled.addListener(async () => {
  const allTabs = await chrome.tabs.query({});
  for (const t of allTabs) {
    if (t.id !== undefined && isInjectable(t.url)) void injectCollector(t.id);
  }
});

chrome.runtime.onMessage.addListener((message: Record<string, unknown>, sender) => {
  const tabId = sender.tab?.id;
  if (tabId === undefined) return;

  if (message.type === 'perflex:events') {
    const state = getTab(tabId);
    const incoming = (message.events as CollectorEvent[]) ?? [];
    state.events.push(...incoming);
    if (state.events.length > MAX_BUFFER) {
      state.events.splice(0, state.events.length - MAX_BUFFER);
    }
    const port = panelPorts.get(tabId);
    port?.postMessage({ type: 'events', events: incoming });
  } else if (message.type === 'perflex:meta') {
    const state = getTab(tabId);
    if (typeof message.fps === 'number') state.fps = message.fps;
    if (typeof message.frameHealth === 'number') state.frameHealth = message.frameHealth;
    if (typeof message.throttleLevel === 'string') state.throttleLevel = message.throttleLevel;
    const port = panelPorts.get(tabId);
    port?.postMessage({
      type: 'meta',
      fps: state.fps,
      frameHealth: state.frameHealth,
      throttleLevel: state.throttleLevel,
    });
    // Reflect throttling in the action badge.
    if (message.throttleLevel && message.throttleLevel !== 'none') {
      chrome.action?.setBadgeText({ tabId, text: '⚠' }).catch(() => {});
      chrome.action?.setBadgeBackgroundColor({ tabId, color: '#F59E0B' }).catch(() => {});
    } else {
      chrome.action?.setBadgeText({ tabId, text: '' }).catch(() => {});
    }
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabs.delete(tabId);
  panelPorts.delete(tabId);
});

// Side panel connects here and declares which tab it is profiling.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'perflex-panel') return;

  let boundTab: number | undefined;
  port.onMessage.addListener((msg: Record<string, unknown>) => {
    if (msg.type === 'subscribe' && typeof msg.tabId === 'number') {
      boundTab = msg.tabId;
      panelPorts.set(boundTab, port);
      const state = getTab(boundTab);
      // Replay buffered history so the panel has full context.
      port.postMessage({ type: 'events', events: state.events });
      port.postMessage({
        type: 'meta',
        fps: state.fps,
        frameHealth: state.frameHealth,
        throttleLevel: state.throttleLevel,
      });
    } else if (msg.type === 'clear' && boundTab !== undefined) {
      tabs.delete(boundTab);
      port.postMessage({ type: 'reset' });
    }
  });

  port.onDisconnect.addListener(() => {
    if (boundTab !== undefined && panelPorts.get(boundTab) === port) {
      panelPorts.delete(boundTab);
    }
  });
});

// Keyboard command → tell the active tab's content script to toggle the overlay.
chrome.commands?.onCommand.addListener(async (command) => {
  if (command === 'toggle-overlay') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { type: 'perflex:toggle-overlay' }).catch(() => {});
    }
  }
});
