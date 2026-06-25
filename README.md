<div align="center">

# ⚡ Perflex

### The browser extension that tells you *which line of JavaScript* is making your site slow — and how to fix it.

**Real-time JavaScript performance profiler for Chrome with function-level attribution, 37 automatic anti-pattern detectors, and AI-powered, business-safe remediation.**

A free, open-source, privacy-first alternative to Lighthouse, the Chrome DevTools Performance panel, and commercial RUM (Sentry / Datadog / New Relic) — but focused on *attribution depth* and *actionable fixes*, right in your browser side panel.

[**▶ Add to Chrome**](https://chromewebstore.google.com/detail/perflex/mhnljjmpmafepjemojpdifjjfldlgaag) · [Install](#-install-in-60-seconds) · [Features](#-features) · [How it works](#-how-it-works) · [Why Perflex](#-perflex-vs-the-alternatives) · [Contributing](#-contributing)

[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/mhnljjmpmafepjemojpdifjjfldlgaag?label=Chrome%20Web%20Store&logo=googlechrome&logoColor=white&color=4285F4)](https://chromewebstore.google.com/detail/perflex/mhnljjmpmafepjemojpdifjjfldlgaag)
[![Users](https://img.shields.io/chrome-web-store/users/mhnljjmpmafepjemojpdifjjfldlgaag?label=users&logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/perflex/mhnljjmpmafepjemojpdifjjfldlgaag)
[![Rating](https://img.shields.io/chrome-web-store/rating/mhnljjmpmafepjemojpdifjjfldlgaag?label=rating&logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/perflex/mhnljjmpmafepjemojpdifjjfldlgaag)

![Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4?logo=googlechrome&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)
![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)
![No tracking](https://img.shields.io/badge/privacy-100%25%20local-success)

</div>

---

> **TL;DR** — Open the side panel, use your site normally, and Perflex shows you a ranked leaderboard of the scripts and **functions** eating your main thread, a zoomable timeline of every interaction, and a queue of concrete performance fixes (with before/after code) that are safe for your UI and business logic. Optionally, ask Claude for a contextual fix on any finding.

## 🆕 New: AI Coach · Network Waterfall · Lighthouse estimate · Third-Party dashboard

The latest source adds a major round of features *(build from source to try them today — a Chrome Web Store update is on the way)*:

- 🤖 **AI Performance Coach** — a conversational **Coach** tab that can see your whole session. Ask *"why is this page slow?"* or *"what should I fix first?"* and get specific, data-backed answers (with before/after code), streamed in real time. Works with **Claude** *or* **Google Gemini's free tier** — bring whichever key you have.
- 🌊 **Network Waterfall** — a dedicated, **virtualized** waterfall (stays smooth at 500+ requests) with color-coded timing phases (DNS/TCP/TLS/TTFB/Download), render-blocking & cache/Service-Worker indicators, and type / first-vs-third-party / search filters.
- 💡 **Lighthouse Score Predictor** — a local, zero-network estimate of your Lighthouse performance score next to the health score, plus a **"What If"** simulator that ranks each finding by the points fixing it would gain.
- 🧩 **Third-Party Impact Dashboard** — every third party grouped by vendor (Google Analytics, GTM, Stripe, Intercom…), each with its main-thread / transfer / request tax, and a **"what if I removed this?"** simulator showing the Lighthouse points and CLS you'd reclaim.
- 📄 **Editorial exports** — a fully redesigned **PDF report** (SVG gauges, color-rated Core Web Vitals, a mini network waterfall, the worst interaction's causal chain, and before/after code) and an **interactive shareable HTML** viewer (filter / search / sort findings, light & dark themes).

## 🎯 What is Perflex?

Most performance tools tell you *that* your page is slow. Perflex tells you **exactly what to change.**

It's a Chrome (Manifest V3) extension that passively instruments a page — capturing network traffic, long tasks, layout thrashing, forced reflows, layout shifts, memory, and more — then attributes that cost down to the **originating script, function, and character position**. It pattern-matches your session against **37 known performance anti-patterns** and generates **remediation plans with before/after code, a risk level, and a "why this won't break your business logic" note.**

Everything runs **locally in your browser**. No account, no data leaves your machine (the optional AI feature sends only an anonymized, PII-free summary — and only if you add your own API key).

## ✨ Features

- 🔬 **Function-level attribution** — uses the **Long Animation Frames API** to pin main-thread time to a specific function and source location, not just "scripting."
- 🏆 **Script Leaderboard** — every script ranked by main-thread time, long tasks, transfer size, layout-shift contribution, and memory growth. Sortable, filterable (first-party vs third-party), expandable to per-function hotspots.
- 📊 **Core Web Vitals, live** — **LCP, INP, CLS**, TBT, FPS, JS heap, and a composite **0–100 health score** with an A–F grade.
- ⏱️ **Interaction timeline** — a zoomable, pannable **flame-chart-style timeline** (lanes for interactions, long tasks, network waterfall, layout shifts, frame drops, and memory) built on D3. Click any interaction to see its **causal chain**: `click → long task → fetch → DOM mutation → reflow → layout shift`.
- 🩺 **37 anti-pattern detectors** across Loading, Execution, Rendering, Network, Third-party, and **Framework** — layout thrashing, render-blocking scripts, synchronous XHR, redundant fetches, oversized/uncompressed payloads, unbounded list rendering, excessive DOM size, timer flooding, third-party main-thread domination, and more.
- ⚛️ **Framework-aware** — detects React, Vue, Angular, Next.js, Nuxt, Preact, and jQuery, and flags the costly mistakes: a **development build shipped to production** (reliably detected for React via the DevTools `bundleType`), **multiple UI frameworks** loaded on one page, and **outdated major versions**.
- 🛠️ **Business-safe remediation** — every finding ships with a fix: a one-line summary, before/after code diff, **risk level** (safe / verify / review), validation steps, and an explicit business-safety note.
- 🤖 **AI remediation & Coach (opt-in)** — bring your own **Claude** *or* free **Google Gemini** API key for contextual, code-specific fixes on any finding, plus a conversational **Coach** that analyzes your whole session. Only a sanitized, anonymized summary is ever sent — never URLs with tokens, request bodies, or page content.
- 💡 **Lighthouse estimate & "What If"** — a local estimate of your Lighthouse performance score, with a simulator that ranks fixes by the score points each would recover.
- 🌊 **Network waterfall** — a virtualized, phase-colored request waterfall (DNS/TCP/TLS/TTFB/Download) with render-blocking, cache, and third-party indicators and rich filtering.
- 🧩 **Third-party dashboard** — vendors ranked by their performance tax, with a "remove this vendor" simulator that recomputes your score.
- 🪶 **Near-zero overhead** — a self-monitoring **circuit breaker** measures Perflex's own cost and automatically throttles if it ever exceeds 2% of the frame budget.
- 🧩 **In-page overlay** — a draggable, Shadow-DOM-isolated HUD (`Ctrl+Shift+X`) showing live FPS, heap, long tasks, and throttle state on any page.
- 📤 **Export everything** — **JSON**, **HAR** (extended with a `_perflex` namespace), **OpenTelemetry/OTLP traces** (for Jaeger / Tempo / Datadog), and a redesigned, printable **PDF report** with gauges, charts, and code. Plus "Copy as Markdown / JSON" for any finding (drop straight into a Jira / GitHub issue).
- 🔗 **Shareable permalinks** — share a read-only snapshot of a session as a **permalink** (the whole session is gzip-compressed into the URL fragment — never uploaded) or as a **self-contained HTML file** that opens offline with no extension or server.
- 🔒 **100% local & private** — no servers, no telemetry, no account.

## 📸 Screenshots

<div align="center">

![Perflex — a tour of the dashboard](docs/screenshots/demo.gif)

*A quick tour — Overview · Scripts · Timeline · Findings · Settings*

</div>

| Script Leaderboard | Session Timeline |
|:---:|:---:|
| ![Script leaderboard with per-function hotspots](docs/screenshots/scripts.png) | ![Zoomable interaction timeline with causal chain](docs/screenshots/timeline.png) |
| **Per-script & per-function attribution** | **Interaction causal chains** |

| Findings & Remediation | Settings |
|:---:|:---:|
| ![Findings with before/after fix and risk level](docs/screenshots/findings.png) | ![Settings — AI key, first-party domains, share & export](docs/screenshots/settings.png) |
| **37 detectors with business-safe fixes** | **AI remediation, sharing & export** |

## 🚀 Install in 60 seconds

### Option 1 — Chrome Web Store (recommended)

<div align="center">

### [**▶ Add Perflex to Chrome**](https://chromewebstore.google.com/detail/perflex/mhnljjmpmafepjemojpdifjjfldlgaag)

</div>

One click — no build step. Works in **Chrome, Edge, Brave, Arc**, and other Chromium browsers.

### Option 2 — From source (for development)

```bash
git clone https://github.com/svemulapati/perflex.git
cd perflex
npm install
npm run build      # → produces dist/
```

Then load it:

1. Open `chrome://extensions`
2. Toggle **Developer mode** (top-right)
3. Click **Load unpacked** → select the `dist/` folder
4. Pin the ⚡ Perflex icon, open any page, and hit the icon (or `Ctrl+Shift+P`)

*(On Arc, the dashboard opens in a standalone window since Arc doesn't yet support the side-panel API.)*

## 🧭 Using it

1. **Open the side panel** and interact with your page normally (click, scroll, navigate).
2. **Overview** → health score, **Lighthouse estimate** + "What If" simulator, Core Web Vitals, top offenders.
3. **Scripts** → the leaderboard (click a row for its hottest functions), or switch to the **Third Parties** sub-view for the vendor dashboard + removal simulator.
4. **Network** → the virtualized waterfall with phase-colored timing bars and filters.
5. **Timeline** → scroll to zoom, drag to pan; click an interaction for its causal chain.
6. **Findings** → ranked issues; click **View fix**, **Copy MD** to paste into a ticket, or **AI Analysis** for a contextual fix.
7. **Coach** → chat with an AI that can see your whole session (needs a Claude or Gemini key).
8. **Settings** → pick an AI provider (Claude or free Gemini) and add a key, set first-party domains, and **export** the session.

> Press **`Ctrl+Shift+X`** on any page to toggle the live in-page overlay.

### 🔗 Sharing a session

In **Settings → Share** you can:

- **Copy permalink** — encodes the session into a URL fragment pointing at a static viewer. The fragment is decoded entirely in the recipient's browser; **nothing is ever uploaded**. The viewer ships in this repo at `docs/` — enable **GitHub Pages → Deploy from branch → `/docs`** and set the *Viewer URL* in Settings to your Pages URL (default `https://svemulapati.github.io/perflex/`).
- **Download shareable HTML** — a single self-contained `.html` file with the session inlined; it opens in any browser fully offline, no extension or server required. Great for attaching to a ticket.

## 🆚 Perflex vs the alternatives

| | **Perflex** | Lighthouse | DevTools Perf panel | Sentry / Datadog RUM |
|---|:---:|:---:|:---:|:---:|
| Runs live in the browser | ✅ | ⚠️ lab run | ✅ | ✅ |
| Function-level attribution | ✅ | ❌ | ⚠️ manual | ❌ |
| 37 automatic anti-pattern detectors | ✅ | ⚠️ subset | ❌ | ⚠️ subset |
| Concrete before/after fix + risk level | ✅ | ⚠️ generic | ❌ | ❌ |
| AI-generated contextual remediation | ✅ | ❌ | ❌ | ⚠️ paid |
| Interaction causal chains | ✅ | ❌ | ⚠️ manual | ⚠️ |
| Free & open source | ✅ | ✅ | ✅ | ❌ |
| 100% local / no account | ✅ | ✅ | ✅ | ❌ |
| Export HAR / OpenTelemetry / PDF | ✅ | ⚠️ JSON | ⚠️ | ✅ |

Perflex isn't trying to replace your RUM in production — it's the tool you reach for *while developing or debugging* to find the exact code to change.

## 🧠 How it works

Six layers, designed so measurement never contaminates the page or the main thread:

```
 Page (MAIN world)                 Extension (privileged)
┌──────────────────────┐          ┌────────────────────────────────────┐
│  Collector (IIFE)    │  window  │  Bridge (content, ISOLATED world)  │
│  • PerformanceObserver│ postMsg  │  relays events to the background   │
│  • fetch / XHR hooks  │ ───────► └─────────────┬──────────────────────┘
│  • timers / reflow    │                        │ chrome.runtime
│  • layout thrashing   │                        ▼
│  • circuit breaker    │          ┌────────────────────────────────────┐
└──────────────────────┘          │  Service worker (per-tab buffer)   │
   injected via                   └─────────────┬──────────────────────┘
   chrome.scripting                             │ Port
   (CSP-proof)                                  ▼
                                   ┌────────────────────────────────────┐
                                   │  Side panel (React)                │
                                   │  • Correlator + Analyzer (Worker)  │
                                   │  • Overview / Scripts / Timeline / │
                                   │    Findings / Settings             │
                                   └────────────────────────────────────┘
```

1. **Collector** — captures everything in the page's MAIN world with a fixed-size ring buffer and stack **fingerprinting** (FNV-1a hash, never full stack strings in the hot path).
2. **Correlator** (Web Worker) — fuses events into per-script / per-function profiles, Core Web Vitals, and interaction sessions.
3. **Analyzer** (Web Worker) — runs the 37 anti-pattern matchers and the local Lighthouse-score estimator.
4. **Remediation & Coach** — template fixes for every pattern, plus optional Claude or Google Gemini for contextual fixes and conversational coaching.
5. **Reporter** — the React side panel (Overview · Scripts/Third-Parties · Network · Timeline · Findings · Coach · Settings) + in-page overlay.
6. **Export** — JSON / HAR / OpenTelemetry / redesigned PDF / interactive HTML.

All heavy lifting happens off the main thread in a worker, so Perflex's own measurements stay clean.

### Tech stack

`Manifest V3` · `TypeScript (strict)` · `React 18` · `Vite + CRXJS` · `Zustand` · `Web Workers` · `D3` · `@tanstack/react-virtual` · `Tailwind CSS` · `Vitest` · `Claude API` · `Google Gemini API`

## 🛠️ Development

```bash
npm run dev          # Vite dev server (HMR for the panel/popup)
npm test             # Vitest unit suite
npm run typecheck    # strict TypeScript, no emit
npm run build        # production build → dist/
```

> The MAIN-world collector is bundled separately as a self-contained IIFE. After editing anything in `src/content/collector/`, run a full `npm run build` (which runs `npm run build:collector`).

```
src/
├── content/          # collector (MAIN world) + bridge + overlay
├── workers/          # correlator + analyzer
├── shared/           # types, anti-patterns, remediation, exporters, AI client (Claude + Gemini), Lighthouse + third-party impact
├── panel/            # React side panel (Overview · Scripts/Third-Parties · Network · Timeline · Findings · Coach · Settings)
├── popup/            # quick-glance popup
└── background/       # service worker (routing + CSP-proof injection)
```

## ⚡ Performance overhead

Perflex is built to be invisible: target **<0.5ms per event**, a bounded memory footprint, and a **circuit breaker** that throttles collection if its own cost exceeds 2% of the frame budget (and drops to a minimal mode above 5%). A ⚠️ badge on the toolbar icon indicates when it's throttling.

## ❓ FAQ

**Does my data leave my browser?** No. Everything is processed locally. The optional AI features (per-finding analysis and the Coach) send only an anonymized, PII-stripped summary — URLs are reduced to `site.com/path`, never page content — and only when you use them with your own API key configured.

**Which AI providers are supported?** **Claude** (Anthropic) and **Google Gemini**, which has a free tier — so you can use the AI features at no cost. Pick the provider and paste a key in **Settings → AI Provider**.

**Will it slow down the page I'm profiling?** It's designed not to — see [overhead](#-performance-overhead). The circuit breaker is your safety net.

**Does it work on sites with a strict Content-Security-Policy?** Yes — the collector is injected via `chrome.scripting` in the MAIN world, which bypasses page CSP.

**Is it a replacement for Lighthouse / RUM?** No — it's complementary. Use Lighthouse for lab scores and RUM for production monitoring; use Perflex to find the exact code to fix.

## 🤝 Contributing

Contributions are very welcome — new anti-pattern detectors, remediation templates, and UI polish especially.

1. Fork & clone
2. `npm install && npm test`
3. Add your change (anti-patterns live in `src/shared/anti-patterns/`, each with a remediation in `src/shared/remediation-templates.ts`)
4. `npm run typecheck && npm test && npm run build`
5. Open a PR

Found a site where Perflex misbehaves or misses an issue? **[Open an issue](https://github.com/svemulapati/perflex/issues)** — real-world repro cases are gold.

## 🗺️ Roadmap

- [x] **[Chrome Web Store listing](https://chromewebstore.google.com/detail/perflex/mhnljjmpmafepjemojpdifjjfldlgaag)** — live!
- [x] **AI Performance Coach** (conversational) — Claude **and** free Google Gemini
- [x] **Network waterfall** (virtualized, phase-colored, dependency-aware)
- [x] **Lighthouse score predictor** + "What If" fix simulator
- [x] **Third-party impact dashboard** with a "remove this vendor" simulator
- [x] Redesigned PDF report + interactive shareable HTML viewer
- [x] Shareable session permalinks (URL-fragment encoded + offline HTML)
- [x] Framework-aware detectors (React/Vue/Angular/Next/Nuxt/jQuery)
- [ ] **Performance budgets + CI integration** (gate PRs on Core Web Vitals)
- [ ] Before/after comparison & saved baselines
- [ ] DevTools panel integration
- [ ] Firefox / Safari support
- [ ] Coverage-API-backed unused-JS detection

## 📄 License

[MIT](LICENSE) © 2026 [Sudeep Nag Vemulapati](https://github.com/svemulapati). Free to use, fork, and ship.

---

<div align="center">

**If Perflex helped you find a slow function, please ⭐ star the repo — it genuinely helps others discover it.**

Built by **[Sudeep Nag Vemulapati](https://github.com/svemulapati)**

<sub>web performance · javascript profiler · chrome extension · manifest v3 · core web vitals · LCP · INP · CLS · long tasks · layout thrashing · forced reflow · flame chart · main thread · devtools · lighthouse alternative · RUM · performance monitoring · web vitals · frontend performance · bundle analysis · third-party scripts · AI code review · performance optimization</sub>

</div>
