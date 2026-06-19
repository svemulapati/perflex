import type { DetectedFramework, FrameworkEvent } from '@/shared/types';
import type { CollectorContext } from './context';

/**
 * Detects which UI/meta-frameworks the page uses by probing well-known globals
 * and DOM markers, and — where reliably possible — whether a *development*
 * build is shipped (a very common, high-impact production mistake).
 *
 * Runs in the MAIN world (only it can see the page's globals). All probing is
 * wrapped in try/catch so it can never disturb the page.
 */
function parseMajor(version?: string): number | undefined {
  if (!version) return undefined;
  const m = version.match(/(\d+)/);
  return m ? Number(m[1]) : undefined;
}

interface Win {
  __REACT_DEVTOOLS_GLOBAL_HOOK__?: { renderers?: Map<number, { version?: string; bundleType?: number }> };
  React?: { version?: string };
  __VUE__?: unknown;
  Vue?: { version?: string };
  __VUE_DEVTOOLS_GLOBAL_HOOK__?: unknown;
  ng?: unknown;
  __NEXT_DATA__?: unknown;
  __NUXT__?: unknown;
  preact?: unknown;
  jQuery?: { fn?: { jquery?: string } };
}

function detect(): DetectedFramework[] {
  const w = window as unknown as Win;
  const found: DetectedFramework[] = [];
  const add = (f: DetectedFramework) => {
    if (!found.some((x) => x.name === f.name)) found.push({ ...f, major: parseMajor(f.version) });
  };

  // ---- React (+ dev build via the DevTools renderer bundleType) ----
  try {
    const hook = w.__REACT_DEVTOOLS_GLOBAL_HOOK__;
    let reactPresent = !!w.React;
    let version = w.React?.version;
    let devBuild = false;
    if (hook?.renderers && hook.renderers.size > 0) {
      reactPresent = true;
      for (const r of hook.renderers.values()) {
        version = version || r.version;
        if (r.bundleType === 1) devBuild = true; // 1 = development, 0 = production
      }
    }
    // Fallback presence check: React fiber keys on mounted nodes.
    if (!reactPresent) {
      const root = document.querySelector('#root, #app, [data-reactroot], body');
      if (root && Object.keys(root).some((k) => k.startsWith('__reactFiber$') || k.startsWith('__reactContainer$'))) {
        reactPresent = true;
      }
    }
    if (reactPresent) add({ name: 'React', version, devBuild });
  } catch {
    /* ignore */
  }

  // ---- Vue ----
  try {
    const vuePresent =
      !!w.__VUE__ ||
      !!w.Vue ||
      !!w.__VUE_DEVTOOLS_GLOBAL_HOOK__ ||
      !!document.querySelector('[data-v-app]') ||
      !!document.querySelector('[data-server-rendered]');
    if (vuePresent) add({ name: 'Vue', version: w.Vue?.version });
  } catch {
    /* ignore */
  }

  // ---- Angular ----
  try {
    const ngEl = document.querySelector('[ng-version]');
    if (ngEl || w.ng) add({ name: 'Angular', version: ngEl?.getAttribute('ng-version') ?? undefined });
  } catch {
    /* ignore */
  }

  // ---- Meta-frameworks & others ----
  try {
    if (w.__NEXT_DATA__) add({ name: 'Next.js', meta: true });
    if (w.__NUXT__) add({ name: 'Nuxt', meta: true });
    if (w.preact) add({ name: 'Preact' });
    if (w.jQuery?.fn?.jquery) add({ name: 'jQuery', version: w.jQuery.fn.jquery });
  } catch {
    /* ignore */
  }

  return found;
}

export function setupFrameworkDetector(ctx: CollectorContext): () => void {
  const emit = () =>
    ctx.measure(() => {
      const frameworks = detect();
      const event: FrameworkEvent = {
        seq: 0,
        kind: 'framework',
        timestamp: performance.now(),
        frameworks,
      };
      ctx.emit(event);
    });

  // Frameworks bootstrap after initial scripts run — sample a couple of times.
  const t1 = window.setTimeout(emit, 1500);
  const t2 = window.setTimeout(emit, 5000);

  return () => {
    clearTimeout(t1);
    clearTimeout(t2);
  };
}
