import { useEffect, useState } from 'react';
import { HealthScore } from '../panel/components/HealthScore';

interface PopupMeta {
  fps: number;
  throttleLevel: string;
  health: number;
}

/**
 * Lightweight quick-glance popup. It connects to the background event stream
 * just long enough to read live meta + the latest snapshot health score.
 */
export function Popup() {
  const [meta, setMeta] = useState<PopupMeta>({ fps: 60, throttleLevel: 'none', health: 100 });

  useEffect(() => {
    let port: chrome.runtime.Port | null = null;
    (async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;
      port = chrome.runtime.connect({ name: 'perflex-panel' });
      port.onMessage.addListener((msg: Record<string, unknown>) => {
        if (msg.type === 'meta') {
          setMeta((m) => ({
            ...m,
            fps: (msg.fps as number) ?? m.fps,
            throttleLevel: (msg.throttleLevel as string) ?? m.throttleLevel,
          }));
        }
      });
      port.postMessage({ type: 'subscribe', tabId: tab.id });
    })();
    return () => port?.disconnect();
  }, []);

  const openPanel = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    // Preferred path: Chrome's native side panel.
    if (tab?.windowId !== undefined && chrome.sidePanel?.open) {
      try {
        await chrome.sidePanel.open({ windowId: tab.windowId });
        window.close();
        return;
      } catch {
        /* fall through to the window fallback (e.g. Arc lacks sidePanel) */
      }
    }
    // Fallback for browsers without sidePanel support (Arc, etc.): open the
    // dashboard in a standalone popup window, passing the tab to profile.
    if (tab?.id !== undefined) {
      const url = chrome.runtime.getURL(`src/panel/index.html?tabId=${tab.id}`);
      await chrome.windows.create({ url, type: 'popup', width: 480, height: 840 });
      window.close();
    }
  };

  return (
    <div className="flex flex-col gap-3 bg-zinc-950 p-3 text-zinc-100">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <div className="flex h-5 w-5 items-center justify-center rounded bg-brand text-xs font-bold text-white">
            P
          </div>
          <span className="text-sm font-bold">Perflex</span>
        </div>
        {meta.throttleLevel !== 'none' && (
          <span className="rounded bg-severity-warning/20 px-1.5 py-0.5 text-[9px] font-semibold text-severity-warning">
            THROTTLED
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        <HealthScore score={meta.health} size={72} />
        <div className="flex flex-col gap-1 text-xs">
          <div className="flex justify-between gap-3">
            <span className="text-zinc-500">FPS</span>
            <span className="font-mono">{meta.fps}</span>
          </div>
        </div>
      </div>

      <button
        onClick={openPanel}
        className="rounded bg-brand px-2 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
      >
        Open Dashboard
      </button>
    </div>
  );
}
