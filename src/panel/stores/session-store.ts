import { create } from 'zustand';
import type { ExportBundle, SessionSnapshot } from '@/shared/types';
import { useSettingsStore } from './settings-store';

interface Meta {
  fps: number;
  frameHealth: number;
  throttleLevel: string;
}

interface SessionState {
  connected: boolean;
  recording: boolean;
  tabId: number | null;
  url: string;
  snapshot: SessionSnapshot | null;
  meta: Meta;
  connect: () => Promise<void>;
  reconnect: () => Promise<void>;
  clear: () => void;
  toggleRecording: () => void;
  requestExport: () => Promise<ExportBundle | null>;
}

let port: chrome.runtime.Port | null = null;
let worker: Worker | null = null;
let exportResolvers: Array<(b: ExportBundle) => void> = [];
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let activeTabId: number | null = null;

function clearTimers(): void {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (pingTimer) clearInterval(pingTimer);
  reconnectTimer = null;
  pingTimer = null;
}

function teardown(): void {
  clearTimers();
  const old = port;
  port = null; // null FIRST so the stale onDisconnect handler ignores itself
  try {
    old?.disconnect();
  } catch {
    /* ignore */
  }
  worker?.terminate();
  worker = null;
}

export const useSessionStore = create<SessionState>((set, get) => {
  function handlePortMessage(msg: Record<string, unknown>): void {
    if (!get().recording && msg.type === 'events') return;
    if (msg.type === 'events') {
      worker?.postMessage({ type: 'events', events: msg.events });
    } else if (msg.type === 'meta') {
      set({
        meta: {
          fps: (msg.fps as number) ?? 60,
          frameHealth: (msg.frameHealth as number) ?? 100,
          throttleLevel: (msg.throttleLevel as string) ?? 'none',
        },
      });
      worker?.postMessage({ type: 'meta', fps: msg.fps, frameHealth: msg.frameHealth });
    } else if (msg.type === 'reset') {
      worker?.postMessage({ type: 'reset' });
    }
  }

  /** (Re)establish the background Port and subscribe to the tab's event stream. */
  function establishPort(tabId: number): void {
    const thisPort = chrome.runtime.connect({ name: 'perflex-panel' });
    port = thisPort;

    thisPort.onMessage.addListener(handlePortMessage);
    thisPort.onDisconnect.addListener(() => {
      // Ignore if this is a stale port we already replaced or closed.
      if (port !== thisPort) return;
      port = null;
      if (pingTimer) clearInterval(pingTimer);
      pingTimer = null;
      set({ connected: false });
      scheduleReconnect();
    });

    thisPort.postMessage({ type: 'subscribe', tabId });

    // Keepalive: a periodic message over the port resets the service worker's
    // idle timer, preventing the disconnect/reconnect churn while the panel is open.
    if (pingTimer) clearInterval(pingTimer);
    pingTimer = setInterval(() => {
      try {
        port?.postMessage({ type: 'ping' });
      } catch {
        /* port closing — onDisconnect will handle reconnect */
      }
    }, 20_000);

    set({ connected: true });
  }

  /**
   * The service worker was suspended (MV3 lifecycle). Reconnect, resetting the
   * correlator so the background's replayed buffer rebuilds state without
   * double-counting.
   */
  function scheduleReconnect(): void {
    if (reconnectTimer || activeTabId === null) return;
    const tabId = activeTabId;
    reconnectTimer = setTimeout(async () => {
      reconnectTimer = null;
      try {
        await chrome.tabs.get(tabId); // bail if the tab is gone
      } catch {
        return;
      }
      if (!worker || port) return; // worker gone, or already reconnected
      worker.postMessage({ type: 'reset' });
      establishPort(tabId);
    }, 800);
  }

  return {
    connected: false,
    recording: true,
    tabId: null,
    url: '',
    snapshot: null,
    meta: { fps: 60, frameHealth: 100, throttleLevel: 'none' },

    async connect() {
      // When opened as a standalone window (Arc fallback), the target tab is
      // passed as ?tabId=. Otherwise profile the active tab in the side panel.
      const param = new URLSearchParams(location.search).get('tabId');
      let tab: chrome.tabs.Tab | undefined;
      if (param) {
        try {
          tab = await chrome.tabs.get(Number(param));
        } catch {
          /* tab closed — fall back to active tab below */
        }
      }
      if (!tab) {
        [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      }
      if (!tab?.id) return;
      const tabId = tab.id;
      const url = tab.url ?? '';
      let pageOrigin = '';
      try {
        pageOrigin = new URL(url).origin;
      } catch {
        /* chrome:// etc. */
      }
      set({ tabId, url });
      activeTabId = tabId;

      // Tear down any prior worker/port (reconnect path).
      teardown();

      // Spin up the correlator worker.
      const allowlist = useSettingsStore.getState().firstPartyDomains;
      worker = new Worker(new URL('../../workers/correlator.worker.ts', import.meta.url), {
        type: 'module',
      });
      worker.onmessage = (
        e: MessageEvent<
          { type: 'snapshot'; snapshot: SessionSnapshot } | { type: 'export'; bundle: ExportBundle }
        >
      ) => {
        if (e.data.type === 'snapshot') set({ snapshot: e.data.snapshot });
        else if (e.data.type === 'export') {
          const bundle = e.data.bundle;
          const resolvers = exportResolvers;
          exportResolvers = [];
          resolvers.forEach((r) => r(bundle));
        }
      };
      worker.postMessage({ type: 'init', tabId, url, pageOrigin, allowlist });

      establishPort(tabId);
    },

    async reconnect() {
      set({ snapshot: null, connected: false });
      await get().connect();
    },

    clear() {
      try {
        port?.postMessage({ type: 'clear' });
      } catch {
        /* ignore */
      }
      worker?.postMessage({ type: 'reset' });
      set({ snapshot: null });
    },

    toggleRecording() {
      set({ recording: !get().recording });
    },

    requestExport() {
      if (!worker) return Promise.resolve(null);
      return new Promise<ExportBundle | null>((resolve) => {
        exportResolvers.push(resolve);
        worker!.postMessage({ type: 'export' });
        // Safety timeout so the UI never hangs on a dead worker.
        setTimeout(() => resolve(null), 4000);
      });
    },
  };
});
