/**
 * Context assembly for the AI Performance Coach (Feature 5). Distills the live
 * session into a compact, privacy-safe package for Claude — URLs anonymized,
 * findings reduced to their shape, no page content.
 */
import type { SessionSnapshot } from './types';

export interface CoachContext {
  url: string;
  healthScore: number;
  vitals: { lcp: number | null; inp: number | null; cls: number };
  totalBlockingTime: number;
  frameworks: { name: string; version?: string; devBuild: boolean }[];
  topScripts: { file: string; mainThreadTime: number; classification: string }[];
  findings: { pattern: string; severity: string; description: string; impact: string }[];
  interactionCount: number;
  heapSizeMB: number;
  thirdPartyPercentage: number;
}

/** Replace the domain with site.com, keep the path, blank out query values. */
export function anonymizeUrl(url: string): string {
  try {
    const u = new URL(url);
    const params = [...u.searchParams.keys()];
    const q = params.length ? '?' + params.map((k) => `${k}=…`).join('&') : '';
    return `https://site.com${u.pathname}${q}`;
  } catch {
    return 'site.com';
  }
}

function fileOf(url: string): string {
  if (!url || url === '(inline)' || url === 'unknown') return url || 'unknown';
  try {
    const u = new URL(url);
    return u.pathname.split('/').filter(Boolean).pop() || u.hostname;
  } catch {
    return url.split('?')[0].split('/').pop() || url;
  }
}

export function buildCoachContext(snapshot: SessionSnapshot): CoachContext {
  const totalMt = snapshot.scripts.reduce((s, p) => s + p.metrics.totalMainThreadTime, 0);
  const thirdMt = snapshot.scripts
    .filter((p) => p.classification.startsWith('third-party'))
    .reduce((s, p) => s + p.metrics.totalMainThreadTime, 0);

  return {
    url: anonymizeUrl(snapshot.url),
    healthScore: snapshot.healthScore,
    vitals: { lcp: snapshot.vitals.lcp, inp: snapshot.vitals.inp, cls: Math.round(snapshot.vitals.cls * 1000) / 1000 },
    totalBlockingTime: Math.round(snapshot.totalBlockingTime),
    frameworks: snapshot.frameworks.map((f) => ({ name: f.name, version: f.version, devBuild: !!f.devBuild })),
    topScripts: snapshot.scripts.slice(0, 10).map((p) => ({
      file: fileOf(p.url),
      mainThreadTime: Math.round(p.metrics.totalMainThreadTime),
      classification: p.classification,
    })),
    findings: snapshot.findings.map((f) => ({
      pattern: f.patternName,
      severity: f.severity,
      description: f.description,
      impact: `${f.impact.frequency}× · ${Math.round(f.impact.totalDuration)}ms${f.impact.coreWebVitalAffected ? ` · ${f.impact.coreWebVitalAffected}` : ''}`,
    })),
    interactionCount: snapshot.interactions.length,
    heapSizeMB: Math.round((snapshot.heapSize / 1_048_576) * 10) / 10,
    thirdPartyPercentage: totalMt > 0 ? Math.round((thirdMt / totalMt) * 100) : 0,
  };
}

export const COACH_SYSTEM_PROMPT = `You are Perflex AI Coach, an expert web performance engineer embedded in a browser profiling tool.
You have access to real-time performance data from the user's current browsing session.

RULES:
- Be specific and actionable. Reference exact script names, metrics, and findings from the data.
- Prioritize fixes by impact. Always explain WHY something is slow, not just WHAT.
- Use the data to back up every claim. Don't make generic statements.
- Keep responses concise — 3-5 sentences for simple questions, more for complex analysis.
- When suggesting code changes, provide before/after examples.
- If the user asks about something not visible in the data, say so honestly.
- Format responses with markdown for readability.`;

/** Full system prompt = rules + the current session data. */
export function buildSystemPrompt(context: CoachContext): string {
  return `${COACH_SYSTEM_PROMPT}\n\nCURRENT SESSION DATA:\n${JSON.stringify(context)}`;
}
