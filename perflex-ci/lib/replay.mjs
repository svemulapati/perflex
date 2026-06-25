/**
 * Playwright driver: replays a recorded Perflex flow in a headless browser and
 * collects Core Web Vitals per page. Web-Vitals observers are installed before
 * any page script runs (addInitScript), so they capture LCP/CLS/TBT/FCP for
 * every document the flow visits.
 */
const METRICS_INIT = `(() => {
  if (window.__pflxInstalled) return;
  window.__pflxInstalled = true;
  window.__pflx = { lcp: 0, cls: 0, tbt: 0, fcp: 0 };
  const obs = (type, cb) => {
    try { new PerformanceObserver((l) => l.getEntries().forEach(cb)).observe({ type, buffered: true }); }
    catch (e) { /* unsupported entry type */ }
  };
  obs('largest-contentful-paint', (e) => { window.__pflx.lcp = e.renderTime || e.loadTime || e.startTime; });
  obs('layout-shift', (e) => { if (!e.hadRecentInput) window.__pflx.cls += e.value; });
  obs('longtask', (e) => { window.__pflx.tbt += Math.max(0, e.duration - 50); });
  obs('paint', (e) => { if (e.name === 'first-contentful-paint') window.__pflx.fcp = e.startTime; });
})();`;

function firstUrl(flow, override) {
  if (override) return override;
  if (flow.url) return flow.url;
  const nav = flow.steps.find((s) => s.action === 'navigate' && s.url);
  return nav ? nav.url : 'about:blank';
}

/** Replay a flow; returns { perPage, pages, finalUrl }. */
export async function replayFlow(flow, opts = {}) {
  const pageTimeout = opts.timeout ?? 30000;
  const stepTimeout = opts.stepTimeout ?? 8000;
  const log = opts.log || (() => {});

  // Lazy-load Playwright so the CLI can show usage / fail gracefully when it
  // isn't installed yet.
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    throw new Error('Playwright is not installed. Run: npm i playwright && npx playwright install chromium');
  }

  const browser = await chromium.launch({ headless: opts.headless !== false });
  const byUrl = new Map(); // last metrics read per URL (most-accumulated wins)
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.addInitScript(METRICS_INIT);

    const settle = async () => {
      await page.waitForLoadState('load').catch(() => {});
      await page.waitForTimeout(opts.settleMs ?? 600); // let LCP/CLS observers flush
    };
    const snapshot = async () => {
      try {
        const m = await page.evaluate(() => window.__pflx);
        if (m) byUrl.set(page.url(), m);
      } catch {
        /* page navigating — skip this read */
      }
    };

    log(`→ goto ${firstUrl(flow, opts.url)}`);
    await page.goto(firstUrl(flow, opts.url), { waitUntil: 'load', timeout: pageTimeout }).catch(() => {});
    await settle();
    await snapshot();

    for (const step of flow.steps) {
      try {
        if (step.action === 'click') {
          log(`• click ${step.selector}`);
          await page.click(step.selector, { timeout: stepTimeout }).catch(() => {});
        } else if (step.action === 'type') {
          log(`• type ${step.selector}`);
          await page.fill(step.selector, 'x'.repeat(step.valueLength || 4), { timeout: stepTimeout }).catch(() => {});
        } else if (step.action === 'scroll') {
          await page.evaluate((y) => window.scrollTo(0, y), step.scrollPosition?.y || 0).catch(() => {});
        } else if (step.action === 'navigate') {
          if (step.url && page.url() !== step.url) {
            log(`→ goto ${step.url}`);
            await page.goto(step.url, { waitUntil: 'load', timeout: pageTimeout }).catch(() => {});
          }
        }
        await settle();
        await snapshot();
      } catch {
        /* a flaky step shouldn't abort the whole run */
      }
    }

    return { perPage: [...byUrl.values()], pages: byUrl.size, finalUrl: page.url() };
  } finally {
    await browser.close();
  }
}
