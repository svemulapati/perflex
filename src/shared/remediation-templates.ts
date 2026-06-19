import type { RemediationPlan } from './types';

const r = (p: RemediationPlan): RemediationPlan => ({ source: 'template', ...p });

/** Pre-built, business-aware remediation for every anti-pattern. */
export const REMEDIATIONS: Record<string, RemediationPlan> = {
  'render-blocking-script': r({
    summary: 'Add defer/async to non-critical scripts, or load them dynamically',
    detailed:
      'Scripts without defer/async block HTML parsing and delay First Contentful Paint. Defer non-critical scripts so they execute after parsing, in order.',
    codeExample: {
      language: 'html',
      before: '<script src="/analytics.js"></script>',
      after: '<script src="/analytics.js" defer></script>',
    },
    riskLevel: 'verify',
    riskExplanation:
      'Execution timing changes. Verify the script does not use document.write() or assume the DOM is incomplete.',
    estimatedImpact: 'Often 100–400ms FCP/LCP improvement',
    validationSteps: [
      'Confirm no document.write() in the script',
      'Re-test FCP/LCP before vs after',
      'Verify dependent inline scripts still initialize',
    ],
    businessSafetyNote:
      'Deferred scripts run in order after parsing — same behavior, just later. No business-logic change as long as nothing relies on synchronous execution during parse.',
    relatedResources: [
      { title: 'script defer (MDN)', url: 'https://developer.mozilla.org/docs/Web/HTML/Element/script#defer' },
    ],
  }),

  'render-blocking-stylesheet': r({
    summary: 'Inline critical CSS and defer the rest',
    detailed:
      'Stylesheets in the document head block rendering until downloaded and parsed. Inline the small amount of CSS needed for above-the-fold content and load the rest non-blockingly.',
    codeExample: {
      language: 'html',
      before: '<link rel="stylesheet" href="/styles.css">',
      after: '<style>/* critical above-the-fold CSS */</style>\n<link rel="stylesheet" href="/styles.css" media="print" onload="this.media=\'all\'">',
    },
    riskLevel: 'verify',
    riskExplanation: 'Splitting critical vs. deferred CSS can cause a flash of unstyled content if the critical set is incomplete.',
    estimatedImpact: 'Removes stylesheet round-trips from the render path (often 100–300ms FCP)',
    validationSteps: ['Identify render-blocking stylesheets', 'Extract critical CSS', 'Defer the remainder', 'Re-check FCP/LCP for FOUC'],
    businessSafetyNote: 'Visual output is unchanged once all CSS loads; verify no flash of unstyled content during load.',
    relatedResources: [{ title: 'Defer non-critical CSS', url: 'https://web.dev/articles/defer-non-critical-css' }],
  }),

  'document-write': r({
    summary: 'Replace document.write with DOM APIs or async loading',
    detailed:
      'document.write blocks the HTML parser, and any call after the document finishes loading wipes the entire page. Build nodes with DOM methods, or load scripts asynchronously.',
    codeExample: {
      language: 'javascript',
      before: 'document.write(\'<script src="/widget.js"></scr\' + \'ipt>\');',
      after: 'const s = document.createElement("script");\ns.src = "/widget.js"; s.async = true;\ndocument.head.appendChild(s);',
    },
    riskLevel: 'review',
    riskExplanation: 'Async loading changes execution timing; verify code depending on the injected content waits for it.',
    estimatedImpact: 'Unblocks the parser; avoids catastrophic full-document rewrites',
    validationSteps: ['Find document.write call sites', 'Replace with DOM insertion / async script', 'Verify the injected content still appears and initializes'],
    businessSafetyNote: 'Same content is added to the page; only the insertion mechanism and timing change — verify dependent code.',
    relatedResources: [{ title: 'Avoid document.write()', url: 'https://web.dev/articles/no-document-write' }],
  }),

  'unused-javascript': r({
    summary: 'Code-split and lazy-load rarely-used JavaScript',
    detailed:
      'Large bundles ship code that is downloaded and parsed but never executed during the session. Split by route/feature and import on demand.',
    codeExample: {
      language: 'javascript',
      before: "import { HeavyChart } from './heavy-chart';",
      after: "const HeavyChart = await import('./heavy-chart');",
    },
    riskLevel: 'review',
    riskExplanation: 'Dynamic imports change loading timing; ensure code that needs the module awaits it.',
    estimatedImpact: 'Reduced parse/compile + transfer; faster TTI',
    validationSteps: ['Use Coverage tab to confirm unused %', 'Verify lazy module loads on demand', 'Check no race conditions'],
    businessSafetyNote: 'Behavior is preserved — the same code runs, just loaded when needed.',
    relatedResources: [{ title: 'Reduce unused JS', url: 'https://web.dev/articles/unused-javascript' }],
  }),

  'chain-loaded-dependencies': r({
    summary: 'Flatten request chains with preload/early hints or bundling',
    detailed:
      'When script A loads B which loads C, each hop adds a round trip. Preload deep dependencies or bundle them to remove the serial chain.',
    codeExample: {
      language: 'html',
      before: '<!-- a.js dynamically injects b.js, which injects c.js -->',
      after: '<link rel="preload" as="script" href="/c.js">\n<link rel="preload" as="script" href="/b.js">',
    },
    riskLevel: 'verify',
    riskExplanation: 'Preloading changes fetch order but not execution semantics.',
    estimatedImpact: 'Removes 1 RTT per chain hop (often 50–150ms each)',
    validationSteps: ['Inspect the initiator chain in the network panel', 'Confirm preloaded resources are used'],
    businessSafetyNote: 'Only fetch ordering changes; execution order and logic are unchanged.',
    relatedResources: [{ title: 'Preload critical assets', url: 'https://web.dev/articles/preload-critical-assets' }],
  }),

  'duplicate-libraries': r({
    summary: 'Deduplicate to a single shared version of the library',
    detailed:
      'Multiple copies/versions of the same library inflate bundle size and parse time. Consolidate via dependency resolution or a shared external.',
    codeExample: {
      language: 'bash',
      before: '# react@17 and react@18 both bundled',
      after: 'npm dedupe   # or align versions in package.json / use externals',
    },
    riskLevel: 'review',
    riskExplanation: 'Version consolidation can surface API differences between the duplicate versions.',
    estimatedImpact: 'Eliminates redundant KBs + duplicate parse cost',
    validationSteps: ['Run npm ls <lib> to find duplicates', 'Align versions', 'Smoke-test features using the library'],
    businessSafetyNote: 'Verify the unified version is API-compatible with all call sites before shipping.',
    relatedResources: [{ title: 'npm dedupe', url: 'https://docs.npmjs.com/cli/commands/npm-dedupe' }],
  }),

  'over-eager-preload': r({
    summary: 'Remove preload/prefetch hints for resources unused this session',
    detailed:
      'Preloaded/prefetched resources that are never used compete for bandwidth with critical assets. Drop or gate them behind interaction.',
    codeExample: {
      language: 'html',
      before: '<link rel="preload" as="script" href="/maybe-needed.js">',
      after: '<!-- load on demand when the feature is actually used -->',
    },
    riskLevel: 'safe',
    riskExplanation: 'Removing an unused hint cannot change behavior of the page.',
    estimatedImpact: 'Frees bandwidth for critical resources',
    validationSteps: ['Confirm the resource is unused during typical flows', 'Re-check LCP after removal'],
    businessSafetyNote: 'No behavioral change — the resource was not consumed anyway.',
    relatedResources: [{ title: 'Preload vs prefetch', url: 'https://web.dev/articles/preload-critical-assets' }],
  }),

  'large-parse-compile': r({
    summary: 'Split large scripts and defer non-critical parsing',
    detailed:
      'Scripts over ~100KB incur significant parse/compile time on the main thread. Code-split, tree-shake, and defer.',
    codeExample: {
      language: 'javascript',
      before: '// single 600KB vendor bundle parsed up-front',
      after: '// route-level code splitting → smaller initial parse',
    },
    riskLevel: 'review',
    riskExplanation: 'Splitting changes module boundaries; verify shared state still initializes correctly.',
    estimatedImpact: 'Cuts main-thread compile time proportional to bytes removed',
    validationSteps: ['Measure compileDuration via Long Animation Frames', 'Verify split chunks load correctly'],
    businessSafetyNote: 'Same code executes; only when/how it is parsed changes.',
    relatedResources: [{ title: 'Reduce JS payloads with code splitting', url: 'https://web.dev/articles/reduce-javascript-payloads-with-code-splitting' }],
  }),

  'layout-thrashing': r({
    summary: 'Batch DOM reads before writes to avoid forced reflows',
    detailed:
      'Interleaving geometry reads and style writes forces the browser to recompute layout synchronously each cycle. Read all measurements first, then write.',
    codeExample: {
      language: 'javascript',
      before: 'for (const el of els) {\n  el.style.width = w + "px";\n  total += el.offsetHeight; // forces reflow each iteration\n}',
      after: 'const heights = els.map(el => el.offsetHeight); // read phase\nels.forEach((el, i) => { el.style.width = w + "px"; }); // write phase',
    },
    riskLevel: 'safe',
    riskExplanation: 'Pure reordering of reads/writes; the same final styles are applied.',
    estimatedImpact: 'Removes synchronous layout passes (often tens of ms per interaction)',
    validationSteps: ['Confirm the same elements end in the same state', 'Re-check forced-reflow count'],
    businessSafetyNote: 'No behavioral change — identical styles applied, just in a non-thrashing order.',
    relatedResources: [{ title: 'Avoid forced synchronous layouts', url: 'https://web.dev/articles/avoid-large-complex-layouts-and-layout-thrashing' }],
  }),

  'long-main-thread-task': r({
    summary: 'Break long tasks into chunks yielding to the main thread',
    detailed:
      'Tasks over ~50ms block input handling. Split work into smaller chunks and yield (scheduler.yield / setTimeout / isInputPending) so the page stays responsive.',
    codeExample: {
      language: 'javascript',
      before: 'items.forEach(process); // one long synchronous task',
      after: 'async function run() {\n  for (const item of items) {\n    process(item);\n    if (navigator.scheduling?.isInputPending?.()) await scheduler.yield();\n  }\n}',
    },
    riskLevel: 'verify',
    riskExplanation: 'Yielding makes work asynchronous; ensure consumers handle the now-async completion.',
    estimatedImpact: 'Directly improves INP and input latency',
    validationSteps: ['Confirm no task exceeds 50ms', 'Verify results identical after chunking'],
    businessSafetyNote: 'Same computation and output — only scheduled in interruptible chunks.',
    relatedResources: [{ title: 'Optimize long tasks', url: 'https://web.dev/articles/optimize-long-tasks' }],
  }),

  'suspected-memory-leak': r({
    summary: 'Find and release retained objects (listeners, timers, detached nodes)',
    detailed:
      'Sustained heap growth that never recedes suggests objects are being retained. Common causes: event listeners never removed, timers never cleared, growing caches/arrays, and detached DOM nodes held by closures. Use the DevTools Memory panel to compare heap snapshots and find what is retained.',
    codeExample: {
      language: 'javascript',
      before: 'el.addEventListener("scroll", onScroll); // never removed when el is discarded',
      after: 'el.addEventListener("scroll", onScroll);\n// on teardown:\nel.removeEventListener("scroll", onScroll);',
    },
    riskLevel: 'review',
    riskExplanation: 'This is a heuristic — growth can be legitimate (e.g., loading data). Confirm with heap snapshots before changing code.',
    estimatedImpact: 'Prevents unbounded memory growth and the slowdowns/crashes it causes over time',
    validationSteps: ['Take DevTools heap snapshots over time', 'Look for detached nodes / growing retainers', 'Add cleanup (removeEventListener, clearInterval, bounded caches)', 'Confirm heap plateaus'],
    businessSafetyNote: 'Cleanup must not remove listeners/timers still in use — verify functionality after adding teardown.',
    relatedResources: [{ title: 'Fix memory problems', url: 'https://developer.chrome.com/docs/devtools/memory-problems' }],
  }),

  'oversized-images': r({
    summary: 'Compress, resize, and serve modern image formats',
    detailed:
      'Large images dominate page weight. Serve appropriately-sized images with responsive srcset, compress them, and use modern formats (WebP/AVIF) which are far smaller than PNG/JPEG.',
    codeExample: {
      language: 'html',
      before: '<img src="hero.png">  <!-- 1.8MB PNG -->',
      after: '<img src="hero.avif" srcset="hero-480.avif 480w, hero-1080.avif 1080w" sizes="100vw" width="1080" height="540">',
    },
    riskLevel: 'safe',
    riskExplanation: 'Re-encoding/resizing does not change behavior; pick quality settings that preserve acceptable fidelity.',
    estimatedImpact: 'Often 50–80% image-byte reduction; improves LCP and total weight',
    validationSteps: ['Identify oversized images', 'Generate AVIF/WebP + responsive sizes', 'Verify visual quality and correct variant selection'],
    businessSafetyNote: 'Same images, smaller; verify quality and that dimensions are reserved to avoid layout shift.',
    relatedResources: [{ title: 'Optimize images', url: 'https://web.dev/articles/use-imagemin-to-compress-images' }],
  }),

  'unthrottled-listeners': r({
    summary: 'Throttle/debounce high-frequency event handlers',
    detailed:
      'scroll/resize/mousemove fire many times per second. Doing layout or network work in each handler floods the main thread. Throttle, debounce, or use rAF/passive listeners.',
    codeExample: {
      language: 'javascript',
      before: "window.addEventListener('scroll', () => doExpensiveWork());",
      after: "let ticking = false;\nwindow.addEventListener('scroll', () => {\n  if (!ticking) { ticking = true; requestAnimationFrame(() => { doExpensiveWork(); ticking = false; }); }\n}, { passive: true });",
    },
    riskLevel: 'verify',
    riskExplanation: 'Throttling reduces invocation frequency; verify UX (e.g., scroll-linked animations) still feels correct.',
    estimatedImpact: 'Large reduction in handler-driven main-thread time during scroll/resize',
    validationSteps: ['Confirm handler fires ≤ once per frame', 'Verify visual behavior unchanged'],
    businessSafetyNote: 'Logic is unchanged — it simply runs at most once per frame instead of per event.',
    relatedResources: [{ title: 'Debounce your input handlers', url: 'https://web.dev/articles/debounce-your-input-handlers' }],
  }),

  'synchronous-xhr': r({
    summary: 'Replace synchronous XHR with async fetch/await',
    detailed:
      'Synchronous XHR blocks the main thread until the response arrives, freezing the entire page. Use asynchronous requests.',
    codeExample: {
      language: 'javascript',
      before: "const xhr = new XMLHttpRequest();\nxhr.open('GET', url, false); // sync — blocks everything\nxhr.send();",
      after: 'const res = await fetch(url);\nconst data = await res.json();',
    },
    riskLevel: 'review',
    riskExplanation: 'Converting to async changes control flow; callers must await the result.',
    estimatedImpact: 'Eliminates full main-thread stalls (often hundreds of ms)',
    validationSteps: ['Find sync XHR usages', 'Refactor callers to async', 'Verify ordering assumptions hold'],
    businessSafetyNote: 'Same data is fetched; ensure code depending on the result is adapted to async timing.',
    relatedResources: [{ title: 'Synchronous XHR (MDN)', url: 'https://developer.mozilla.org/docs/Web/API/XMLHttpRequest/open' }],
  }),

  'large-json-parse': r({
    summary: 'Move large JSON parsing off the main thread or stream it',
    detailed:
      'JSON.parse on large payloads blocks the main thread. Parse in a Web Worker, paginate the payload, or stream-parse.',
    codeExample: {
      language: 'javascript',
      before: 'const data = JSON.parse(hugeString); // blocks main thread',
      after: '// in a worker:\nself.onmessage = e => self.postMessage(JSON.parse(e.data));',
    },
    riskLevel: 'verify',
    riskExplanation: 'Worker parsing is async and copies data; verify the consumer handles the async hand-off.',
    estimatedImpact: 'Removes parse time from the main thread (scales with payload size)',
    validationSteps: ['Confirm payload size', 'Move parse to a worker', 'Verify parsed result identical'],
    businessSafetyNote: 'Parsing produces the same object — only where it runs changes.',
    relatedResources: [{ title: 'Web Workers (MDN)', url: 'https://developer.mozilla.org/docs/Web/API/Web_Workers_API' }],
  }),

  'expensive-dom-query': r({
    summary: 'Cache query results and simplify selectors',
    detailed:
      'Complex selectors over large DOMs are costly, especially when re-run. Cache results, narrow the scope, or use simpler selectors / IDs.',
    codeExample: {
      language: 'javascript',
      before: 'document.querySelectorAll(".a .b > .c:nth-child(2n) [data-x]"); // repeated',
      after: 'const cache = container.querySelectorAll(".c"); // scoped + cached',
    },
    riskLevel: 'verify',
    riskExplanation: 'Caching assumes the matched set is stable; invalidate on relevant DOM changes.',
    estimatedImpact: 'Cuts repeated query cost; scales with DOM size',
    validationSteps: ['Confirm selector results unchanged', 'Verify cache invalidation on DOM updates'],
    businessSafetyNote: 'Same elements selected; ensure cached results are refreshed when the DOM changes.',
    relatedResources: [{ title: 'querySelectorAll (MDN)', url: 'https://developer.mozilla.org/docs/Web/API/Document/querySelectorAll' }],
  }),

  'timer-flooding': r({
    summary: 'Consolidate many timers into fewer scheduled tasks',
    detailed:
      'Dozens of simultaneous setTimeout/setInterval registrations add scheduling overhead and unpredictability. Coalesce into a single loop or scheduler.',
    codeExample: {
      language: 'javascript',
      before: 'items.forEach(i => setInterval(() => update(i), 1000)); // N intervals',
      after: 'setInterval(() => items.forEach(update), 1000); // one interval',
    },
    riskLevel: 'verify',
    riskExplanation: 'Coalescing changes timing granularity; verify per-item timing is still acceptable.',
    estimatedImpact: 'Reduces timer scheduling overhead and wakeups',
    validationSteps: ['Count active timers', 'Consolidate', 'Verify timing behavior'],
    businessSafetyNote: 'Same work runs on the same cadence — just scheduled together.',
    relatedResources: [{ title: 'setInterval (MDN)', url: 'https://developer.mozilla.org/docs/Web/API/setInterval' }],
  }),

  'recursive-raf': r({
    summary: 'Stop rAF loops when idle and keep per-frame work small',
    detailed:
      'A requestAnimationFrame loop doing heavy work every frame burns the frame budget even when nothing is animating. Pause the loop when idle and minimize per-frame work.',
    codeExample: {
      language: 'javascript',
      before: 'function loop() { doHeavyWork(); requestAnimationFrame(loop); }\nloop();',
      after: 'function loop() {\n  if (needsUpdate) doHeavyWork();\n  if (isActive) requestAnimationFrame(loop);\n}',
    },
    riskLevel: 'verify',
    riskExplanation: 'Pausing the loop requires a correct re-start trigger when state changes.',
    estimatedImpact: 'Recovers frame budget when idle; steadier 60fps',
    validationSteps: ['Confirm loop pauses when idle', 'Verify animations resume correctly'],
    businessSafetyNote: 'Animation behavior preserved; the loop simply idles when there is nothing to draw.',
    relatedResources: [{ title: 'requestAnimationFrame (MDN)', url: 'https://developer.mozilla.org/docs/Web/API/window/requestAnimationFrame' }],
  }),

  'excessive-console': r({
    summary: 'Strip or gate console logging in production',
    detailed:
      'High-volume console calls have real cost (serialization, devtools overhead). Remove debug logging from production builds or gate behind a flag.',
    codeExample: {
      language: 'javascript',
      before: 'console.log("render", expensiveToSerialize);',
      after: 'if (DEBUG) console.log("render", expensiveToSerialize);',
    },
    riskLevel: 'safe',
    riskExplanation: 'Removing logging has no functional effect on the application.',
    estimatedImpact: 'Removes per-call serialization overhead',
    validationSteps: ['Confirm logs are debug-only', 'Strip via build (e.g., drop_console)'],
    businessSafetyNote: 'Logging is diagnostic only — removing it does not change behavior.',
    relatedResources: [{ title: 'Terser drop_console', url: 'https://terser.org/docs/options/' }],
  }),

  'forced-sync-layout': r({
    summary: 'Defer geometry reads out of style-write blocks',
    detailed:
      'Reading layout (getBoundingClientRect, offset*) right after mutating styles forces a synchronous layout. Move reads before writes, or to a later frame.',
    codeExample: {
      language: 'javascript',
      before: 'el.classList.add("big");\nconst h = el.getBoundingClientRect().height; // forced layout',
      after: 'const h = el.getBoundingClientRect().height; // read first\nel.classList.add("big");',
    },
    riskLevel: 'safe',
    riskExplanation: 'Reordering reads/writes; end state identical.',
    estimatedImpact: 'Removes synchronous layout passes',
    validationSteps: ['Identify the read-after-write site', 'Reorder', 'Confirm visual result unchanged'],
    businessSafetyNote: 'No behavioral change — same measurements, same styles.',
    relatedResources: [{ title: 'Avoid forced synchronous layout', url: 'https://web.dev/articles/avoid-large-complex-layouts-and-layout-thrashing' }],
  }),

  'excessive-dom-size': r({
    summary: 'Reduce DOM node count via virtualization and simpler markup',
    detailed:
      'Very large DOMs slow style, layout, and memory. Virtualize long lists, flatten wrappers, and remove offscreen nodes.',
    codeExample: {
      language: 'javascript',
      before: '// render all 5,000 rows into the DOM',
      after: '// react-window / virtual list → render only visible rows',
    },
    riskLevel: 'review',
    riskExplanation: 'Virtualization changes how/when nodes mount; verify scroll, focus, and find-in-page.',
    estimatedImpact: 'Large layout/style/memory reduction on big pages',
    validationSteps: ['Measure node count', 'Virtualize large lists', 'Test scroll & accessibility'],
    businessSafetyNote: 'Content is preserved; only offscreen nodes are not materialized. Verify SEO/find-in-page needs.',
    relatedResources: [{ title: 'DOM size and interactivity', url: 'https://web.dev/articles/dom-size-and-interactivity' }],
  }),

  'unbounded-list': r({
    summary: 'Virtualize or paginate large lists',
    detailed:
      'Rendering hundreds/thousands of sibling elements without virtualization is expensive to lay out and update. Use a windowed/virtual list or pagination.',
    codeExample: {
      language: 'jsx',
      before: '{items.map(i => <Row key={i.id} {...i} />)} // 2,000 rows',
      after: '<VirtualList items={items} rowHeight={32} /> // only visible rows',
    },
    riskLevel: 'review',
    riskExplanation: 'Virtual lists change mount behavior; verify keyboard nav, sticky headers, and measurements.',
    estimatedImpact: 'Cuts layout/paint proportional to hidden rows',
    validationSteps: ['Confirm list length', 'Introduce virtualization', 'Test scroll/selection'],
    businessSafetyNote: 'All data remains available; only offscreen rows are not rendered.',
    relatedResources: [{ title: 'Virtualize large lists', url: 'https://web.dev/articles/virtualize-long-lists-react-window' }],
  }),

  'missing-css-containment': r({
    summary: 'Apply CSS containment to independently-updating regions',
    detailed:
      'Frequently-updated widgets without containment can trigger layout/paint of unrelated areas. Add `contain: content` (or layout/paint) to isolate them.',
    codeExample: {
      language: 'css',
      before: '.widget { /* updates often, no containment */ }',
      after: '.widget { contain: content; }',
    },
    riskLevel: 'verify',
    riskExplanation: 'Containment establishes a new layout/paint boundary; verify no clipping or sizing regressions.',
    estimatedImpact: 'Scopes layout/paint to the contained subtree',
    validationSteps: ['Identify frequently-mutated regions', 'Add containment', 'Check for clipping/overflow issues'],
    businessSafetyNote: 'Visual output should be identical; containment only limits recalculation scope. Verify edge cases.',
    relatedResources: [{ title: 'CSS containment (MDN)', url: 'https://developer.mozilla.org/docs/Web/CSS/CSS_containment' }],
  }),

  'excessive-layer-promotion': r({
    summary: 'Promote only what animates; remove blanket will-change',
    detailed:
      'Too many promoted layers (will-change / translateZ) consume GPU memory and can hurt performance. Promote sparingly and remove will-change after animations.',
    codeExample: {
      language: 'css',
      before: '* { will-change: transform; } /* over-promotion */',
      after: '.animating { will-change: transform; } /* only during animation */',
    },
    riskLevel: 'verify',
    riskExplanation: 'Removing promotion may reintroduce minor jank on genuinely animated elements — promote those specifically.',
    estimatedImpact: 'Reduces GPU memory and compositing overhead',
    validationSteps: ['Count promoted layers', 'Scope will-change to animated elements', 'Verify animations still smooth'],
    businessSafetyNote: 'No content change; only the compositing strategy is adjusted.',
    relatedResources: [{ title: 'will-change (MDN)', url: 'https://developer.mozilla.org/docs/Web/CSS/will-change' }],
  }),

  'layout-shift-sources': r({
    summary: 'Reserve space for late-loading content to stop layout shifts',
    detailed:
      'Images, ads, fonts, and injected content without reserved dimensions push content around. Set explicit size/aspect-ratio and reserve slots.',
    codeExample: {
      language: 'html',
      before: '<img src="hero.jpg">',
      after: '<img src="hero.jpg" width="1200" height="600">',
    },
    riskLevel: 'safe',
    riskExplanation: 'Reserving space does not change content, only prevents reflow on load.',
    estimatedImpact: 'Directly reduces CLS',
    validationSteps: ['Identify shifting elements', 'Reserve dimensions', 'Re-measure CLS'],
    businessSafetyNote: 'No behavioral change — the same content loads, without shifting the layout.',
    relatedResources: [{ title: 'Optimize CLS', url: 'https://web.dev/articles/optimize-cls' }],
  }),

  'redundant-fetch': r({
    summary: 'Dedupe identical in-flight/recent requests',
    detailed:
      'The same URL+method+body is fetched repeatedly in a short window. Share a single in-flight promise and cache the result.',
    codeExample: {
      language: 'javascript',
      before: 'function load(id){ return fetch(`/api/${id}`); } // called repeatedly',
      after: 'const inflight = new Map();\nfunction load(id){ if(!inflight.has(id)) inflight.set(id, fetch(`/api/${id}`).finally(()=>inflight.delete(id))); return inflight.get(id); }',
    },
    riskLevel: 'verify',
    riskExplanation: 'Caching/dedupe assumes responses are equivalent within the window; verify freshness needs.',
    estimatedImpact: 'Removes duplicate network + parse work',
    validationSteps: ['Identify duplicate requests', 'Add dedupe/cache', 'Verify data freshness'],
    businessSafetyNote: 'Ensure dedupe window respects how fresh the data must be.',
    relatedResources: [{ title: 'HTTP caching', url: 'https://web.dev/articles/http-cache' }],
  }),

  'uncached-api': r({
    summary: 'Add caching headers / client cache for stable responses',
    detailed:
      'Endpoints returning identical bodies repeatedly should be cached (Cache-Control, ETag, or an in-memory/SWR layer).',
    codeExample: {
      language: 'http',
      before: '(no Cache-Control on a stable response)',
      after: 'Cache-Control: max-age=300, stale-while-revalidate=60',
    },
    riskLevel: 'verify',
    riskExplanation: 'Caching can serve stale data; choose TTLs that match data volatility.',
    estimatedImpact: 'Avoids repeat transfers + parsing',
    validationSteps: ['Confirm responses are identical', 'Add appropriate cache policy', 'Verify staleness tolerance'],
    businessSafetyNote: 'Pick a TTL that respects how often the data legitimately changes.',
    relatedResources: [{ title: 'HTTP cache', url: 'https://web.dev/articles/http-cache' }],
  }),

  'sequential-waterfall': r({
    summary: 'Parallelize independent requests',
    detailed:
      'Independent requests issued one-after-another serialize their latency. Fire them together with Promise.all.',
    codeExample: {
      language: 'javascript',
      before: 'const a = await fetch(u1);\nconst b = await fetch(u2); // waits for a',
      after: 'const [a, b] = await Promise.all([fetch(u1), fetch(u2)]);',
    },
    riskLevel: 'verify',
    riskExplanation: 'Only parallelize requests with no data dependency between them.',
    estimatedImpact: 'Collapses serial latency into the slowest single request',
    validationSteps: ['Confirm requests are independent', 'Parallelize', 'Verify error handling for concurrent failures'],
    businessSafetyNote: 'Behavior unchanged for independent requests; do not parallelize dependent ones.',
    relatedResources: [{ title: 'Promise.all (MDN)', url: 'https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise/all' }],
  }),

  'uncompressed-payload': r({
    summary: 'Enable gzip/brotli compression on large text responses',
    detailed:
      'Large text/JSON/JS responses without Content-Encoding waste bandwidth. Enable brotli/gzip at the server/CDN.',
    codeExample: {
      language: 'nginx',
      before: '# no compression',
      after: 'gzip on; brotli on; brotli_types application/json application/javascript text/css;',
    },
    riskLevel: 'safe',
    riskExplanation: 'Compression is transparent to the client; bodies are identical after decoding.',
    estimatedImpact: 'Typically 60–80% transfer-size reduction on text',
    validationSteps: ['Confirm response is large & text', 'Enable compression', 'Verify Content-Encoding header'],
    businessSafetyNote: 'No behavioral change — the decoded payload is byte-identical.',
    relatedResources: [{ title: 'Enable text compression', url: 'https://web.dev/articles/uses-text-compression' }],
  }),

  'oversized-payload': r({
    summary: 'Paginate, filter, or trim large API responses',
    detailed:
      'Very large responses cost transfer, parse, and memory. Return only needed fields, paginate, and push filtering server-side.',
    codeExample: {
      language: 'http',
      before: 'GET /api/items   → 3MB of all fields',
      after: 'GET /api/items?fields=id,name&page=1&limit=50',
    },
    riskLevel: 'review',
    riskExplanation: 'Changing the response shape affects clients; coordinate API + consumers.',
    estimatedImpact: 'Reduces transfer, parse, and memory proportional to trimmed bytes',
    validationSteps: ['Confirm payload size', 'Add pagination/field selection', 'Verify clients handle the new shape'],
    businessSafetyNote: 'Ensure all consumers still receive the data they require after trimming.',
    relatedResources: [{ title: 'Reduce network payloads', url: 'https://web.dev/articles/total-byte-weight' }],
  }),

  'dev-build-shipped': r({
    summary: 'Ship the production build of your framework',
    detailed:
      'Development builds (React/Vue/etc.) include extra warnings, prop-type checks, and dev-only code paths that can be 3–10× slower than production. Ensure your bundler builds in production mode.',
    codeExample: {
      language: 'bash',
      before: '# NODE_ENV not set to production at build time',
      after: 'NODE_ENV=production npm run build   # Vite: vite build · webpack: mode: "production"',
    },
    riskLevel: 'verify',
    riskExplanation:
      'Production builds strip dev warnings and minify. Verify your app still works without dev-only checks (it should).',
    estimatedImpact: 'Often a multiple-x reduction in framework runtime cost',
    validationSteps: [
      'Confirm the bundle URL no longer references *.development.js',
      'Check that React DevTools shows the "production" build',
      'Re-measure long tasks / INP',
    ],
    businessSafetyNote:
      'No behavioral change — production builds run the same logic, just without dev-only diagnostics.',
    relatedResources: [
      { title: 'React: Optimizing performance (production build)', url: 'https://react.dev/learn/react-developer-tools' },
      { title: 'Vue: Production deployment', url: 'https://vuejs.org/guide/best-practices/production-deployment.html' },
    ],
  }),

  'multiple-ui-frameworks': r({
    summary: 'Consolidate onto a single UI framework',
    detailed:
      'Loading more than one UI framework (e.g. React + Vue, or jQuery alongside a modern framework) ships multiple runtimes and duplicates work. Migrate widgets onto one framework, or isolate legacy ones.',
    codeExample: {
      language: 'text',
      before: 'React + jQuery + a Vue widget all loaded on one page',
      after: 'Port the jQuery/Vue widgets to the primary framework, or load them only where used',
    },
    riskLevel: 'review',
    riskExplanation:
      'Migrating components between frameworks is a real refactor — scope it per widget and test each.',
    estimatedImpact: 'Removes an entire framework runtime (tens to hundreds of KB + its execution)',
    validationSteps: ['Inventory which framework powers which UI', 'Migrate or lazy-load the secondary one', 'Regression-test the affected widgets'],
    businessSafetyNote: 'Behavior must be preserved per widget — migrate incrementally and verify each before removing the old runtime.',
    relatedResources: [{ title: 'Reduce JavaScript payloads', url: 'https://web.dev/articles/reduce-javascript-payloads-with-code-splitting' }],
  }),

  'outdated-framework': r({
    summary: 'Upgrade to a current major version',
    detailed:
      'Older framework majors miss performance features (e.g. React 18 automatic batching & concurrent rendering, Vue 3 reactivity, modern Angular rendering). Upgrading typically improves responsiveness with little app change.',
    codeExample: {
      language: 'bash',
      before: '# e.g. react@17',
      after: 'npm install react@latest react-dom@latest   # follow the official migration guide',
    },
    riskLevel: 'review',
    riskExplanation: 'Major upgrades can include breaking changes — follow the framework migration guide and test.',
    estimatedImpact: 'Access to newer rendering/batching optimizations',
    validationSteps: ['Read the migration guide', 'Upgrade in a branch', 'Run the full test suite + smoke test'],
    businessSafetyNote: 'Upgrades may change APIs — verify behavior against the migration guide before shipping.',
    relatedResources: [{ title: 'React upgrade guide', url: 'https://react.dev/blog' }],
  }),

  'third-party-blocking-paint': r({
    summary: 'Load blocking third-party scripts async/deferred',
    detailed:
      'Third-party scripts in <head> without async/defer delay first paint. Load them asynchronously, or via a facade until needed.',
    codeExample: {
      language: 'html',
      before: '<script src="https://third-party.example/widget.js"></script>',
      after: '<script src="https://third-party.example/widget.js" async></script>',
    },
    riskLevel: 'verify',
    riskExplanation: 'Third-party init timing changes; verify the widget still initializes and any inline config runs first.',
    estimatedImpact: 'Removes third-party blocking time from FCP/LCP',
    validationSteps: ['Identify blocking third-party', 'Add async/defer or a facade', 'Verify the integration still works'],
    businessSafetyNote: 'Confirm the vendor supports async loading and that any required global config is set beforehand.',
    relatedResources: [{ title: 'Efficiently load third-party JS', url: 'https://web.dev/articles/efficiently-load-third-party-javascript' }],
  }),

  'tag-manager-cascade': r({
    summary: 'Audit and prune tags loaded by the tag manager',
    detailed:
      'A tag manager pulling in many downstream scripts multiplies third-party cost. Remove unused tags, consolidate, and load non-critical tags on consent/interaction.',
    codeExample: {
      language: 'text',
      before: 'GTM loads 12 vendor tags on every page load',
      after: 'Prune to essential tags; fire the rest on consent / interaction triggers',
    },
    riskLevel: 'review',
    riskExplanation: 'Removing tags affects analytics/marketing data collection — coordinate with stakeholders.',
    estimatedImpact: 'Reduces third-party request count and main-thread time',
    validationSteps: ['List tags fired by the container', 'Remove/defer non-essential tags', 'Confirm required tracking still works'],
    businessSafetyNote: 'Tags often serve marketing/analytics needs — review with owners before removing.',
    relatedResources: [{ title: 'Tag managers & performance', url: 'https://web.dev/articles/tag-best-practices' }],
  }),

  'third-party-layout-shift': r({
    summary: 'Reserve space for third-party embeds (ads, widgets)',
    detailed:
      'Late-injected third-party content (ads, chat, social) shifts the page. Reserve fixed-size containers for these slots.',
    codeExample: {
      language: 'css',
      before: '.ad-slot { /* collapses until ad loads */ }',
      after: '.ad-slot { min-height: 250px; } /* reserve the slot */',
    },
    riskLevel: 'safe',
    riskExplanation: 'Reserving space does not change the third-party behavior, only prevents reflow.',
    estimatedImpact: 'Reduces CLS caused by third-party injection',
    validationSteps: ['Identify shifting third-party slots', 'Reserve dimensions', 'Re-measure CLS'],
    businessSafetyNote: 'No change to the third-party content — only its container is pre-sized.',
    relatedResources: [{ title: 'Optimize CLS', url: 'https://web.dev/articles/optimize-cls' }],
  }),

  'third-party-main-thread': r({
    summary: 'Sandbox or defer main-thread-heavy third parties',
    detailed:
      'Third-party scripts consuming a large share of main-thread time degrade responsiveness. Defer, lazy-load on interaction, or isolate in a worker/iframe (e.g., Partytown).',
    codeExample: {
      language: 'html',
      before: '<script src="https://heavy-third-party.example/sdk.js"></script>',
      after: '<script type="text/partytown" src="https://heavy-third-party.example/sdk.js"></script>',
    },
    riskLevel: 'review',
    riskExplanation: 'Moving third-party code off the main thread can break scripts that need direct DOM/synchronous APIs.',
    estimatedImpact: 'Returns main-thread time to first-party interactivity',
    validationSteps: ['Quantify third-party main-thread share', 'Defer/sandbox the offender', 'Verify the integration still functions'],
    businessSafetyNote: 'Validate the vendor works under deferral/sandboxing before shipping to production.',
    relatedResources: [{ title: 'Partytown', url: 'https://partytown.builder.io/' }],
  }),
};
