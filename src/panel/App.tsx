import { useEffect, useState } from 'react';
import { useSessionStore } from './stores/session-store';
import { useSettingsStore } from './stores/settings-store';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Overview } from './views/Overview';
import { Scripts } from './views/Scripts';
import { Timeline } from './views/Timeline';
import { Findings } from './views/Findings';
import { Settings } from './views/Settings';
import { shortUrl } from './format';

type Tab = 'overview' | 'scripts' | 'timeline' | 'findings' | 'settings';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'scripts', label: 'Scripts' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'findings', label: 'Findings' },
  { id: 'settings', label: 'Settings' },
];

export function App() {
  const [tab, setTab] = useState<Tab>('overview');
  const connect = useSessionStore((s) => s.connect);
  const clear = useSessionStore((s) => s.clear);
  const toggleRecording = useSessionStore((s) => s.toggleRecording);
  const recording = useSessionStore((s) => s.recording);
  const connected = useSessionStore((s) => s.connected);
  const meta = useSessionStore((s) => s.meta);
  const url = useSessionStore((s) => s.url);
  const loadSettings = useSettingsStore((s) => s.load);

  useEffect(() => {
    // Load persisted settings before connecting so the first-party allowlist
    // is applied to the initial correlator session.
    void (async () => {
      await loadSettings();
      await connect();
    })();
  }, [connect, loadSettings]);

  return (
    <div className="flex h-full flex-col bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded bg-brand text-sm font-bold text-white">
            P
          </div>
          <div>
            <div className="text-sm font-bold leading-none">Perflex</div>
            <div className="max-w-[180px] truncate text-[10px] text-zinc-500" title={url}>
              {url ? shortUrl(url) : 'no tab'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {meta.throttleLevel !== 'none' && (
            <span className="rounded bg-severity-warning/20 px-1.5 py-0.5 text-[9px] font-semibold text-severity-warning">
              THROTTLED
            </span>
          )}
          <button
            onClick={toggleRecording}
            title={recording ? 'Pause recording' : 'Resume recording'}
            className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] ${
              recording ? 'bg-severity-critical/20 text-severity-critical' : 'bg-zinc-800 text-zinc-400'
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${recording ? 'animate-pulse bg-severity-critical' : 'bg-zinc-500'}`} />
            {recording ? 'REC' : 'Paused'}
          </button>
          <button
            onClick={clear}
            className="rounded bg-zinc-800 px-2 py-1 text-[11px] text-zinc-400 hover:text-zinc-200"
          >
            Clear
          </button>
        </div>
      </header>

      {/* Tab nav */}
      <nav className="flex border-b border-zinc-800 text-xs">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 px-2 py-2 ${
              tab === t.id
                ? 'border-b-2 border-brand font-semibold text-zinc-100'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* Body */}
      <main className="flex-1 overflow-y-auto">
        {!connected && (
          <div className="px-3 py-2 text-[11px] text-zinc-500">Connecting to page…</div>
        )}
        <ErrorBoundary label={tab}>
          {tab === 'overview' && <Overview />}
          {tab === 'scripts' && <Scripts />}
          {tab === 'timeline' && <Timeline />}
          {tab === 'findings' && <Findings />}
          {tab === 'settings' && <Settings />}
        </ErrorBoundary>
      </main>
    </div>
  );
}
