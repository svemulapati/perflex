import { useEffect, useState } from 'react';
import { useSettingsStore } from '../stores/settings-store';
import { useSessionStore } from '../stores/session-store';
import { toJSON, toHAR, toOTLP, buildReportHTML, buildSharePayload, encodeSession, buildPermalink } from '@/shared/export';
import { downloadFile, openReport, timestampedName, buildShareableHTML, copyToClipboard } from '../export-actions';

export function Settings() {
  const settings = useSettingsStore();
  const clear = useSessionStore((s) => s.clear);
  const reconnect = useSessionStore((s) => s.reconnect);
  const requestExport = useSessionStore((s) => s.requestExport);

  const [apiKey, setApiKey] = useState('');
  const [domains, setDomains] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [shareMsg, setShareMsg] = useState<string | null>(null);

  const runExport = async (format: 'json' | 'har' | 'otel' | 'pdf') => {
    setExporting(format);
    try {
      const bundle = await requestExport();
      if (!bundle) return;
      if (format === 'json') downloadFile(timestampedName('session', 'json'), toJSON(bundle), 'application/json');
      else if (format === 'har') downloadFile(timestampedName('session', 'har'), toHAR(bundle), 'application/json');
      else if (format === 'otel') downloadFile(timestampedName('traces', 'otlp.json'), toOTLP(bundle), 'application/json');
      else if (format === 'pdf') openReport(buildReportHTML(bundle));
    } finally {
      setExporting(null);
    }
  };

  const copyPermalink = async () => {
    setExporting('permalink');
    setShareMsg(null);
    try {
      const bundle = await requestExport();
      if (!bundle) return;
      const encoded = await encodeSession(buildSharePayload(bundle));
      const link = buildPermalink(encoded, settings.viewerBaseUrl);
      await copyToClipboard(link);
      const kb = (link.length / 1024).toFixed(1);
      setShareMsg(
        link.length > 30_000
          ? `Permalink copied (${kb} KB) — quite long; the shareable HTML may be easier to send.`
          : `Permalink copied to clipboard (${kb} KB).`
      );
    } finally {
      setExporting(null);
    }
  };

  const downloadShareHtml = async () => {
    setExporting('share-html');
    setShareMsg(null);
    try {
      const bundle = await requestExport();
      if (!bundle) return;
      const html = await buildShareableHTML(buildSharePayload(bundle));
      downloadFile(timestampedName('shared', 'html'), html, 'text/html');
      setShareMsg('Self-contained HTML downloaded — open it in any browser, no extension needed.');
    } finally {
      setExporting(null);
    }
  };

  useEffect(() => {
    if (settings.loaded) {
      setApiKey(settings.anthropicApiKey);
      setDomains(settings.firstPartyDomains.join('\n'));
    }
  }, [settings.loaded, settings.anthropicApiKey, settings.firstPartyDomains]);

  const flash = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const saveAi = async () => {
    await settings.update({ anthropicApiKey: apiKey.trim() });
    flash();
  };

  const saveDomains = async () => {
    const list = domains
      .split('\n')
      .map((d) => d.trim())
      .filter(Boolean);
    await settings.update({ firstPartyDomains: list });
    flash();
    await reconnect();
  };

  return (
    <div className="contain-content flex flex-col gap-5 p-3 text-zinc-200">
      {/* AI remediation */}
      <Section title="AI Remediation (Claude)">
        <p className="text-[11px] text-zinc-400">
          Opt-in. When set, the "AI Analysis" button on each finding generates a contextual fix. Only a
          sanitized summary is sent (filename, function, metrics) — never URLs with query strings, request
          bodies, or page content.
        </p>
        <label className="mt-1 flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.aiEnabled}
            onChange={(e) => settings.update({ aiEnabled: e.target.checked })}
          />
          <span className="text-[11px]">Enable AI remediation</span>
        </label>
        <div className="flex gap-1">
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-ant-…"
            className="flex-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-[11px] outline-none focus:border-brand"
          />
          <button onClick={() => setShowKey((s) => !s)} className="rounded bg-zinc-800 px-2 text-[11px]">
            {showKey ? 'Hide' : 'Show'}
          </button>
        </div>
        <label className="flex items-center gap-2 text-[11px]">
          Model
          <select
            value={settings.aiModel}
            onChange={(e) => settings.update({ aiModel: e.target.value })}
            className="rounded bg-zinc-800 px-2 py-0.5 outline-none"
          >
            <option value="claude-sonnet-4-6">claude-sonnet-4-6</option>
            <option value="claude-opus-4-8">claude-opus-4-8</option>
            <option value="claude-haiku-4-5-20251001">claude-haiku-4-5</option>
          </select>
        </label>
        <div className="flex items-center gap-2">
          <button onClick={saveAi} className="rounded bg-brand px-2 py-1 text-[11px] font-semibold text-white">
            Save key
          </button>
          <span className="text-[10px] text-zinc-500">
            {settings.anthropicApiKey ? '✓ Key configured' : 'No key set'}
          </span>
        </div>
      </Section>

      {/* Phase 2 opt-in modules */}
      <Section title="Experimental Modules">
        <p className="text-[11px] text-zinc-400">
          Extra collectors, off by default because each adds a little main-thread overhead. Enable only
          what you need.
        </p>
        {(
          [
            ['websocketMonitor', 'WebSocket monitoring'],
            ['workerMonitor', 'Web Worker profiling'],
            ['flowRecorder', 'User flow recording'],
            ['heatmap', 'Performance heatmap overlay'],
            ['replay', 'Performance replay capture'],
          ] as const
        ).map(([flag, label]) => (
          <label key={flag} className="flex items-center gap-2 text-[11px]">
            <input
              type="checkbox"
              checked={settings.featureFlags[flag]}
              onChange={(e) => settings.update({ featureFlags: { [flag]: e.target.checked } })}
            />
            <span>{label}</span>
          </label>
        ))}
      </Section>

      {/* Classification */}
      <Section title="First-Party Domains">
        <p className="text-[11px] text-zinc-400">
          Extra origins to treat as first-party for script classification (one per line). Applied on save.
        </p>
        <textarea
          value={domains}
          onChange={(e) => setDomains(e.target.value)}
          rows={3}
          placeholder="https://cdn.mysite.com"
          className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-[11px] outline-none focus:border-brand"
        />
        <button onClick={saveDomains} className="self-start rounded bg-zinc-800 px-2 py-1 text-[11px]">
          Save & re-analyze
        </button>
      </Section>

      {/* Data */}
      <Section title="Session Data">
        <p className="text-[11px] text-zinc-400">
          Captured data lives only in this session and is cleared automatically on page navigation.
        </p>
        <button onClick={clear} className="self-start rounded bg-zinc-800 px-2 py-1 text-[11px]">
          Clear current session
        </button>
      </Section>

      <Section title="Share">
        <p className="text-[11px] text-zinc-400">
          Create a shareable, read-only snapshot of this session. The data is encoded entirely
          client-side — a permalink keeps it in the URL fragment (never uploaded), and the HTML file
          works fully offline.
        </p>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={copyPermalink}
            disabled={exporting !== null}
            className="rounded bg-brand px-2 py-1 text-[11px] font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {exporting === 'permalink' ? 'Encoding…' : 'Copy permalink'}
          </button>
          <button
            onClick={downloadShareHtml}
            disabled={exporting !== null}
            className="rounded bg-zinc-800 px-2 py-1 text-[11px] hover:bg-zinc-700 disabled:opacity-50"
          >
            {exporting === 'share-html' ? 'Building…' : 'Download shareable HTML'}
          </button>
        </div>
        <label className="flex flex-col gap-1 text-[11px] text-zinc-400">
          Viewer URL (for permalinks)
          <input
            value={settings.viewerBaseUrl}
            onChange={(e) => settings.update({ viewerBaseUrl: e.target.value })}
            className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-[11px] outline-none focus:border-brand"
          />
        </label>
        {shareMsg && <div className="text-[10px] text-severity-success">{shareMsg}</div>}
      </Section>

      <Section title="Export">
        <p className="text-[11px] text-zinc-400">Export the current session for sharing or further analysis.</p>
        <div className="flex flex-wrap gap-1.5">
          {([
            ['json', 'JSON'],
            ['har', 'HAR'],
            ['otel', 'OpenTelemetry'],
            ['pdf', 'PDF Report'],
          ] as const).map(([fmt, label]) => (
            <button
              key={fmt}
              onClick={() => runExport(fmt)}
              disabled={exporting !== null}
              className="rounded bg-zinc-800 px-2 py-1 text-[11px] hover:bg-zinc-700 disabled:opacity-50"
            >
              {exporting === fmt ? 'Exporting…' : label}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-zinc-500">
          The PDF report opens in a new tab — use Cmd/Ctrl+P → "Save as PDF".
        </p>
      </Section>

      {saved && <div className="text-[11px] text-severity-success">Saved.</div>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{title}</h3>
      {children}
    </section>
  );
}
