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

/** Pending export-bundle resolvers, fulfilled when the worker replies. */
let exportResolvers: Array<(b: ExportBundle) => void> = [];

function teardown(): void {
  try {
    port?.disconnect();
  } catch {
    /* ignore */
  }
  worker?.terminate();
  port = null;
  worker = null;
}

let port: chrome.runtime.Port | null = null;
let worker: Worker | null = null;

export const useSessionStore = create<SessionState>((set, get) => ({
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

    // Connect to the background event stream for this tab.
    port = chrome.runtime.connect({ name: 'perflex-panel' });
    port.onMessage.addListener((msg: Record<string, unknown>) => {
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
    });
    port.onDisconnect.addListener(() => set({ connected: false }));
    port.postMessage({ type: 'subscribe', tabId });

    set({ connected: true });
  },

  async reconnect() {
    set({ snapshot: null, connected: false });
    await get().connect();
  },

  clear() {
    port?.postMessage({ type: 'clear' });
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
}));
