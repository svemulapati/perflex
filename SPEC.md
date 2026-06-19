# Perflex — Build Specification

> A complete, self-contained specification for **Perflex**, a Chrome (Manifest V3)
> real-time JavaScript performance profiler. This document is written for
> spec-driven development: an AI (or engineer) given this spec should be able to
> reproduce a functionally equivalent product. It encodes not just *what* to
> build, but the **guardrails** — the non-obvious correctness rules whose
> violation produces subtle, site-breaking bugs.
>
> **Read the [Engineering Guardrails](#12-engineering-guardrails-read-first) section before writing any collector code.**

---

## 1. Mission & scope

Build a Chrome MV3 extension that **passively profiles the JavaScript performance of any page the user chooses**, attributes main-thread cost down to the originating **script → function → source position**, detects **37 performance anti-patterns**, and produces **business-safe remediations** (template-based, plus optional AI). Everything runs **locally**; nothing is uploaded.

It is a *developer dev-time triage tool* — complementary to Lighthouse (lab) and RUM (field), not a replacement. Single purpose: "measure and diagnose JS performance of pages the user profiles, and suggest fixes."

**Hard requirements:** near-zero measurement overhead, never break or alter the host page's behavior, never leak data, never block the main thread for analysis.

---

## 2. Tech stack (exact)

- **Extension:** Manifest V3 (service worker, content scripts, side panel, popup)
- **Build:** Vite 5 + `@crxjs/vite-plugin` v2 (beta); **esbuild** for the standalone collector bundle
- **UI:** React 18 + TypeScript (strict) + Tailwind CSS; **Zustand** for state
- **Viz:** `d3-scale`, `d3-zoom`, `d3-selection` (modular d3, not the meta-package)
- **Workers:** dedicated Web Worker for correlation + analysis
- **Storage:** `chrome.storage.local` (settings); Dexie available for large recordings (optional)
- **AI:** Anthropic Claude API (`claude-sonnet-4-6` default), opt-in, user's own key
- **Tests:** Vitest (jsdom env)

`tsconfig`: `strict: true`, no `any` except at validated boundaries. Path alias `@/* → src/*`.

---

## 3. Architecture — six layers

```
 Page (MAIN world)                        Extension (privileged)
┌────────────────────────────┐           ┌──────────────────────────────────────┐
│ perflex-collector.js (IIFE)│  window   │ injector.ts (content script, ISOLATED) │
│  Layer 1: COLLECTOR        │ postMsg   │  bridge: relays collector → background  │
│  • PerformanceObservers    │ ────────► │  (immediate relay for interactions)     │
│  • fetch/XHR/timers/reflow │           └──────────────┬─────────────────────────┘
│  • runtime hooks, overlay  │                          │ chrome.runtime
│  • circuit breaker         │                          ▼
└────────────────────────────┘           ┌──────────────────────────────────────┐
   injected by background via             │ service-worker.ts (background)         │
   chrome.scripting (world: MAIN)         │  per-tab ring buffer + Port routing    │
   on webNavigation.onCommitted           │  CSP-proof MAIN-world injection         │
                                          └──────────────┬─────────────────────────┘
                                                         │ Port (+ keepalive ping)
                                                         ▼
                                          ┌──────────────────────────────────────┐
                                          │ Side panel (React)                     │
                                          │  Layer 2 CORRELATOR + Layer 3 ANALYZER │
                                          │    run in a Web Worker                 │
                                          │  Layer 5 REPORTER (Overview/Scripts/    │
                                          │    Timeline/Findings/Settings) + popup │
                                          │  Layer 4 REMEDIATION (templates + AI)   │
                                          │  Layer 6 EXPORT (JSON/HAR/OTel/PDF/share)│
                                          └──────────────────────────────────────┘
```

1. **Collector** (`src/content/collector/`, MAIN world) — capture only; forward batched events. Never analyze.
2. **Correlator** (`src/workers/correlator-core.ts`) — fuse events → per-script/per-function profiles, Core Web Vitals, interaction sessions, timeline lanes.
3. **Analyzer** (`src/shared/anti-patterns/`) — 37 anti-pattern matchers; runs inside the correlator worker.
4. **Remediation** (`src/shared/remediation-templates.ts`, `ai-client.ts`) — a `RemediationPlan` per pattern + optional Claude API.
5. **Reporter** (`src/panel/`, `src/popup/`, `src/content/overlay/`) — React dashboard, popup, in-page HUD.
6. **Export** (`src/shared/export/`) — JSON, HAR-extended, OpenTelemetry, PDF, shareable permalinks.

---

## 4. The injection model (critical — most common failure point)

The collector must run in the page's **MAIN world** to intercept the page's own globals. Getting this wrong breaks on real sites.

- **DO** inject from the background service worker via
  `chrome.scripting.executeScript({ target:{tabId}, world:'MAIN', files:['perflex-collector.js'], injectImmediately:true })`
  on `chrome.webNavigation.onCommitted` (top frame only) **and** into already-open tabs on `onInstalled`.
- **DO** bundle the collector as a **self-contained IIFE** via esbuild (`scripts/build-collector.mjs` → `public/perflex-collector.js`, copied to `dist/` by Vite). No imports, no code-splitting.
- **DO NOT** use a CRXJS `world: 'MAIN'` content script — its loader uses a relative dynamic `import()` that resolves against the *page* origin at runtime and 404s.
- **DO NOT** inject via a `<script src="chrome-extension://…">` tag — the page's **Content-Security-Policy** blocks it (Chrome exempts extension resources; Arc and other forks do not). Browser-performed `executeScript` bypasses page CSP.
- The **ISOLATED-world content script** (`injector.ts`) is purely a bridge: it listens for the collector's `window.postMessage` and relays to the background via `chrome.runtime.sendMessage`. It is the only part with `chrome.*` access.

---

## 5. Manifest

```jsonc
{
  "manifest_version": 3,
  "name": "Perflex",
  "version": "1.0.x",
  "permissions": ["activeTab","sidePanel","storage","scripting","tabs","webNavigation"],
  "host_permissions": ["<all_urls>"],
  "background": { "service_worker": "src/background/service-worker.ts", "type": "module" },
  "content_scripts": [{ "matches": ["<all_urls>"], "js": ["src/content/injector.ts"], "run_at": "document_start" }],
  "side_panel": { "default_path": "src/panel/index.html" },
  "action": { "default_popup": "src/popup/index.html", "default_icon": { "16":"…","48":"…","128":"…" } },
  "commands": { "toggle-overlay": { "suggested_key": { "default": "Ctrl+Shift+X" } } },
  "web_accessible_resources": [{ "resources": ["assets/*"], "matches": ["<all_urls>"] }]
}
```
Do **not** add `debugger`. Do **not** set `openPanelOnActionClick` (it conflicts with a `default_popup` on some Chromium forks).

---

## 6. Project structure (file → responsibility)

```
src/
├── content/
│   ├── injector.ts                 ISOLATED bridge: relay collector events; immediate relay for interactions
│   ├── collector/
│   │   ├── main-world.ts           Orchestrator (IIFE entry): wires all collectors, batches, flushes
│   │   ├── context.ts              CollectorContext: seq IDs, error isolation, overhead measure, NATIVE clock
│   │   ├── circuit-breaker.ts      Self-throttle at >2% / minimal at >5% of frame budget
│   │   ├── performance-observers.ts All PerformanceObserver entry types
│   │   ├── network-interceptor.ts  fetch + XHR wrappers, stack fingerprint
│   │   ├── timer-interceptor.ts    setTimeout/Interval/rAF wrappers, active-timer count
│   │   ├── layout-thrash-detector.ts Forced-reflow detection (geometry getter interception)
│   │   ├── dom-mutation-tracker.ts MutationObserver, batched/summarized
│   │   ├── frame-budget-tracker.ts FPS / frame-health / frame-drop events
│   │   ├── memory-monitor.ts       performance.memory polling
│   │   ├── interaction-tracker.ts  user-input trigger markers
│   │   ├── runtime-hooks.ts        JSON.parse, querySelectorAll, DOM-size sampler, hi-freq input
│   │   └── framework-detector.ts   React/Vue/Angular/Next/Nuxt/Preact/jQuery + dev-build detection
│   └── overlay/overlay.ts          In-page HUD (closed Shadow DOM, Trusted-Types-safe)
├── workers/
│   ├── correlator-core.ts          Pure, testable fusion/attribution/analysis engine
│   └── correlator.worker.ts        Worker shell (init/events/meta/reset/flush/export messages)
├── shared/
│   ├── types.ts                    ALL wire contracts (events, snapshot, findings, analysis input)
│   ├── constants.ts                Thresholds, weights, intervals
│   ├── hash.ts                     FNV-1a + stack fingerprint + body hash
│   ├── ring-buffer.ts              Fixed-size circular buffer
│   ├── script-classifier.ts        first/third-party-known/unknown/inline
│   ├── third-party-db.ts           Known 3P scripts + library signatures + tag-manager hosts
│   ├── anti-patterns/{base,loading,execution,rendering,network,third-party,framework,index}.ts
│   ├── remediation-templates.ts    A RemediationPlan per pattern
│   ├── ai-client.ts                Claude API: sanitize → prompt → parse; in-memory cache
│   └── export/{json,har,otel,report,markdown,share,index}.ts
├── panel/  (React side panel: App, views/, components/, stores/, format.ts, *.css/html)
├── popup/  (quick-glance popup)
├── background/service-worker.ts    routing + injection + commands + Pages-independent
└── assets/icons/                   16/48/128 png
scripts/{build-collector,build-viewer,generate-icons}.mjs
public/{viewer.html, perflex-collector.js(generated)}
docs/{index.html(=viewer), privacy.html, STORE_LISTING.md, screenshots/}
```

---

## 7. Data contracts (`src/shared/types.ts`)

- **`CollectorEvent`** discriminated union by `kind`: `resource`, `longtask`, `long-animation-frame`, `event`, `lcp`, `layout-shift`, `first-input`, `paint`, `navigation`, `network`, `reflow`, `mutation`, `frame`, `memory`, `timer`, `interaction`, `json-parse`, `dom-query`, `runtime-stats`, `framework`. Every event has `seq` (monotonic), `kind`, `timestamp` (page `performance.now()`), optional `fingerprint`.
- **`ScriptProfile`** — url, origin, classification, category?, `metrics` (totalMainThreadTime, longTaskCount, avg/max, network, transfer, reflows, layoutShiftContribution, memoryGrowthRate, estimatedCompileTime, frameDropsAttributed), `hotFunctions: FunctionProfile[]`, `interactions: string[]`, `timeSeries: number[]`.
- **`InteractionSession`** — trigger, duration, inProgress, health (0-100), embedded event arrays (capped), `causalChain: CausalStep[]`, metrics (TBT, network, DOM, CLS, INP).
- **`TimelineData`** — compact lane arrays: longTasks, network, layoutShifts, frames, memory, interactions.
- **`PerformanceFinding`** — id, patternId, patternName, category, severity, confidence (0-1), description, evidence, impact (frequency, totalDuration, affectedInteractions, estimatedUserImpact, coreWebVitalAffected?), remediation?.
- **`SessionSnapshot`** — tabId, url, healthScore, vitals (CoreWebVitals), TBT, heapSize, frameDropRate, networkRequestCount, scripts, findings, interactions, timeline, frameworks, fps.
- **`AnalysisInput`** — everything the matchers read (scripts, interactions, timeline, resources, network, reflows, timers, jsonParses, domQueries, runtime, frameworks, pageOrigin, allowlist, fcp, vitals, durationMs).
- **`ExportBundle`** — snapshot + raw resources + network (on-demand, heavier than a live snapshot).

Keep all types serialization-friendly (no class instances/functions) — they cross `postMessage` boundaries.

---

## 8. Collector modules (Layer 1) — behavior + per-module guardrail

Each module receives a `CollectorContext` and returns a teardown fn. The orchestrator wraps every setup in `safeSetup(name, fn)` (try/catch).

| Module | Captures | Guardrail |
|---|---|---|
| performance-observers | resource, longtask, **long-animation-frame** (function-level), event/INP, LCP, layout-shift, first-input, paint, navigation | Feature-detect each entry type; `buffered:true`; each callback in `ctx.measure`. |
| network-interceptor | fetch + XHR (method, url, async, sizes, status, duration) + stack fingerprint | Preserve behavior exactly; invoke originals on the right receiver (`fetch.apply(this ?? window, …)`); **never** read XHR `content-encoding` (logs an "unsafe header" warning); metadata capture in try/catch. |
| timer-interceptor | setTimeout/Interval/rAF callback durations + active count | Return original ids; preserve `this`/args; only emit rAF events for work > 1ms. |
| layout-thrash-detector | forced reflows (geometry read after style write) | See §12 — must not throw into page; `getComputedStyle.apply(window,…)`; side effects in try/catch. |
| dom-mutation-tracker | per-microtask mutation summaries | MutationObserver only; never record individual mutations. |
| frame-budget-tracker | frame durations, FPS, frame health | Use **native** rAF (`ctx.clock`). |
| memory-monitor | JS heap (Chromium) | Feature-detect `performance.memory`; native timer. |
| interaction-tracker | click/keydown/touchstart/pointerdown/submit/change trigger markers | Capture-phase, passive listeners on `window`. |
| runtime-hooks | JSON.parse cost, querySelectorAll cost, DOM-size sampler, hi-freq input rate | **Do not wrap console**; single-pass DOM scan capped at 4000, skipped while throttled; native timer. |
| framework-detector | React/Vue/Angular/Next/Nuxt/Preact/jQuery + versions + dev-build | Probe globals/DOM in try/catch; React dev via DevTools `bundleType`; native timer; sample at 1.5s & 5s. |

**Batching:** collector buffers events, flushes every 100ms (`ctx.clock.setInterval`), hard-caps a batch at 2000, and **flushes immediately on an `interaction` event** (so navigating clicks aren't lost). Posts via `window.postMessage({source:'perflex-collector', kind:'events'|'meta', …})`. Guard against double-injection with a `window.__perflexCollectorActive` flag.

---

## 9. Correlator + Analyzer (Layers 2-3)

`correlator-core.ts` is a **pure class** (unit-tested without a browser). It:
- aggregates per-script & per-function profiles (LoAF gives function names; longtask attribution gives script); builds `timeSeries` buckets (5s).
- computes Core Web Vitals (LCP, INP≈p98 of interaction durations, CLS sum excluding `hadRecentInput`, FCP/FP, TTFB) and a composite **health score** (weights: longTask .30, INP .25, CLS .15, memory .10, network .10, frameDrop .10).
- assembles **interaction sessions** using a **500ms quiet-window** rule; builds **causal chains**.
- emits compact **timeline** lanes.
- runs `analyze(buildAnalysisInput())` and attaches `findings`.

The **worker shell** owns the instance, ingests batches, and posts snapshots **throttled to ~4Hz** (250ms). Messages: `init`, `events`, `meta`, `reset`, `flush`, `export`.

**Memory discipline:** every accumulator that grows with session length MUST be capped — timeline lanes (3000), resources/network (3000), completed sessions (200), per-session embedded arrays (60), heap samples (500), interaction durations (1000). (An uncapped sorted array degrades long sessions.)

---

## 10. The 37 detectors (`src/shared/anti-patterns/`)

Each matcher is a pure `(AnalysisInput) => PerformanceFinding[]`, isolated so one throwing can't suppress the rest. `index.ts/analyze()` runs all and ranks by severity → impact → duration. Every `patternId` MUST have a `RemediationPlan` (asserted by a test).

- **Loading (8):** render-blocking-script, render-blocking-stylesheet, document-write, unused-javascript, chain-loaded-dependencies, duplicate-libraries, over-eager-preload, large-parse-compile
- **Execution (10):** layout-thrashing, long-main-thread-task, suspected-memory-leak, unthrottled-listeners, synchronous-xhr, large-json-parse, expensive-dom-query, timer-flooding, recursive-raf, excessive-console *(dormant — see guardrail on console)*
- **Rendering (6):** forced-sync-layout, excessive-dom-size, unbounded-list, missing-css-containment, excessive-layer-promotion, layout-shift-sources
- **Network (6):** redundant-fetch, uncached-api, sequential-waterfall, uncompressed-payload, oversized-payload, oversized-images
- **Framework (3):** dev-build-shipped (critical), multiple-ui-frameworks, outdated-framework
- **Third-party (4):** third-party-blocking-paint, tag-manager-cascade, third-party-layout-shift, third-party-main-thread

> Notes: `suspected-memory-leak` reads the heap-sample trend (already collected — no new collector cost). `document-write` needs a transparent `document.write/writeln` wrap (guardrail G1). `oversized-images` owns `img` resources so it doesn't double-flag with `oversized-payload`.

Severities/thresholds and confidence scores are encoded per matcher; use **honest confidence** (heuristic detectors score lower).

---

## 11. Remediation, UI, Export

- **RemediationPlan:** summary, detailed, before/after code, `riskLevel` (safe/verify/review), riskExplanation, estimatedImpact, validationSteps, **businessSafetyNote**, relatedResources, source (template|ai). One per pattern.
- **AI (`ai-client.ts`):** opt-in, user's key. `sanitizeFinding` sends **filename only** (no query strings/tokens), function name, metrics — never full URLs, bodies, or page content. Parse JSON response → RemediationPlan; cache by pattern+file+function.
- **Reporter:** side panel tabs Overview / Scripts (sortable/filterable leaderboard + hot functions) / Timeline (D3 zoom/pan lanes + causal-chain detail) / Findings (cards, sort/filter/dismiss, before/after diff, Copy MD/JSON, AI button) / Settings (API key+model, first-party domains, share, export, clear). Popup = quick glance. In-page overlay via Shadow DOM.
- **Export:** JSON (schemaVersion), HAR 1.2 (+`_perflex` namespace), OpenTelemetry OTLP/JSON (interaction→trace, nanos as BigInt strings), printable PDF report (no `<script>` → CSP-safe). **Shareable permalinks:** gzip(`CompressionStream`)+base64url into the URL **fragment** (never uploaded) → static viewer (`public/viewer.html` → `docs/index.html` on GitHub Pages); plus a self-contained offline HTML.

---

## 12. Engineering guardrails (READ FIRST)

These are **non-negotiable** rules. Each prevents a class of real, site-breaking or data-corrupting bug encountered in practice.

### G1 — Monkey-patches must be perfectly transparent
The collector wraps page globals (`fetch`, `XMLHttpRequest`, `setTimeout`, geometry getters, `getComputedStyle`, `JSON.parse`, `querySelectorAll`). For every wrapper:
- **Invoke the original on the correct receiver.** The collector bundle is strict-mode, so bare calls like `getComputedStyle(el)` or `fetch(url)` have `this === undefined`; `original.apply(this, args)` then throws *"Illegal invocation"* **inside the page's own code**. Use `original.apply(window, args)` for window methods and `apply(this ?? window, …)` for `fetch`.
- **Run the page's original call path unchanged**, return its exact value, preserve `this`/args, and let its exceptions propagate normally (e.g. invalid JSON / bad selector).
- **Wrap all instrumentation side-effects in try/catch** so bookkeeping can never throw into the page.
- Provide a teardown that restores the original.

### G2 — Never assign raw `innerHTML` (Trusted Types)
Pages enforcing `require-trusted-types-for 'script'` (Google properties, etc.) make `el.innerHTML = '…'` **throw**. The overlay must build DOM with `createElement`/`textContent`, or go through a `trustedTypes.createPolicy(...).createHTML` shim with a direct-assign fallback. Any UI injected into the page must be Trusted-Types-safe.

### G3 — Critical plumbing before optional features
Set up event **flushing** and core observers *before* anything that may throw (overlay, framework probes). Wrap optional features in `safeSetup`. A throw in a non-critical setup must never prevent events from reaching the panel. (Symptom if violated: "works, then nothing"; "no events at all" on some sites.)

### G4 — The collector must not instrument itself
Capture **native** `setTimeout`/`setInterval`/`requestAnimationFrame` in `CollectorContext` *before* the timer interceptor patches them (`ctx.clock`). All internal scheduling (flush/meta intervals, frame tracker, memory poll, framework scans, DOM sampler) uses `ctx.clock`. Otherwise Perflex's own timers/rAF pollute the data and add overhead, and the breaker may throttle itself.

### G5 — Do not wrap `console.*`
Wrapping console rewrites the **source location** of every page log to the collector file — hostile to the developers who are the users. The "excessive-console" detector stays dormant rather than break the console.

### G6 — CSP-proof injection
Inject the collector via `chrome.scripting.executeScript({ world:'MAIN' })` from the background. Never a `<script src>` tag (page CSP blocks it) and never CRXJS `world:'MAIN'` (dynamic-import path 404s).

### G7 — Survive the MV3 service-worker lifecycle
The SW suspends after ~30s idle, killing the panel↔SW Port. The panel **must auto-reconnect** on `port.onDisconnect` (with a stale-port identity guard `if (port !== thisPort) return`), send a **keepalive ping** (~20s) to keep the SW warm, and on reconnect **reset the correlator then replay** the SW's buffer so state rebuilds without double-counting. (Symptom if violated: tool "suddenly stops" until a full reload.)

### G8 — Bound all memory
Any structure that grows with session length must be capped (see §9). Especially: never keep an unbounded array that you sort on every snapshot.

### G9 — Privacy by construction
No telemetry, no account, no uploads. The only off-device transmission is the **opt-in, user-initiated** AI call sending a **sanitized** summary (filename + function + metrics) — never URLs with secrets, bodies, or page content. Shareable links keep data in the URL fragment.

### G10 — Keep the main thread clean
All correlation/analysis runs in a Web Worker. The collector only captures and forwards. Snapshots throttled to ~4Hz. The **circuit breaker** measures Perflex's own callback time over a rolling 1s window and throttles (>2%) / drops to minimal (`longtask`+`resource` only, >5%), with a toolbar badge.

### G11 — Error isolation everywhere
Every collector hook, every matcher, the analyzer call, and every React view (ErrorBoundary) is wrapped so a failure degrades gracefully and never crashes the page or the panel. Background `sendMessage`/port posts are try/caught for "extension context invalidated" on reload.

### G12 — Cross-browser reality
Target Chromium broadly. Arc lacks `chrome.sidePanel` — the popup's "Open Dashboard" must fall back to a standalone window (passing `?tabId=`). Feature-detect every Performance API with graceful fallback (LoAF → longtask; `measureUserAgentSpecificMemory` → `performance.memory` → none).

---

## 13. Build system

- `npm run build` = `tsc -b` → `build:collector` (esbuild IIFE → `public/perflex-collector.js`) → `build:viewer` (copy `public/viewer.html` → `docs/index.html`) → `vite build` (→ `dist/`).
- `npm run dev`, `npm test` (Vitest), `npm run typecheck`.
- `scripts/generate-icons.mjs` produces 16/48/128 PNGs (no image deps).
- The collector is bundled **separately** (esbuild) because it must be a dependency-free IIFE for MAIN-world injection; rerun the full build after editing `src/content/collector/`.

---

## 14. Phased build order

1. **Foundation + Collector + Scripts:** scaffold; collector (observers, network, fingerprint, ring buffer, classifier, circuit breaker); correlator (script/function attribution, CWV, health); side panel Overview + Script Leaderboard; popup.
2. **Interaction correlation + Timeline:** 500ms-quiet-window sessions, causal chains, compact timeline; D3 Timeline tab (zoom/pan, lanes) + causal-chain detail panel.
3. **Analyzer + Findings:** all 37 detectors (in the worker), template remediations for every pattern, Findings tab.
4. **AI + Settings + Overlay:** Claude integration (sanitized, opt-in), Settings, Trusted-Types-safe Shadow-DOM overlay.
5. **Export & sharing:** JSON / HAR / OTel / PDF; shareable permalinks + offline HTML; Copy MD/JSON.

Each phase must build clean, pass tests, and be verified before the next.

---

## 15. Acceptance criteria

- `npm run build` clean; `npm run typecheck` clean (strict).
- Vitest suite green, including: FNV-1a/fingerprint, ring buffer, script classifier, circuit-breaker thresholds, correlator attribution + interaction-session assembly, analyzer (sync-XHR critical, layout-thrash escalation, oversized payload, third-party domination, clean-session = 0 findings, **every pattern has a remediation**), framework matchers, share encode/decode round-trip, export format shapes.
- Loads unpacked in Chrome; profiles a heavy real page (e.g. cnn.com) and a Trusted-Types/CSP-strict site (e.g. fonts.google.com) **without console errors and without breaking the page**; events flow, interactions register on non-navigating input, the tool keeps working after the SW idles.
- Collector overhead within the circuit-breaker budget; no unbounded memory growth over a long session.

---

## 16. Known limitations (state honestly)

Coverage-API "unused JS" is heuristic (no `chrome.debugger`); Preact detection is best-effort (no reliable global); some third-party/containment detectors are low-confidence heuristics; the AI feature requires the user's own key; broad `<all_urls>` triggers an in-depth Web Store review. Perflex is a dev-time tool — it does not replace Lighthouse (lab) or RUM (field).
