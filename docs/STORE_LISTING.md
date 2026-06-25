# Chrome Web Store — submission checklist & copy

Everything you need to paste into the [Developer Dashboard](https://chrome.google.com/webstore/devconsole). One-time **$5** registration fee if you don't have a developer account yet.

## 1. Upload package

- File: **`perflex-2.0.0.zip`** (repo root, rebuilt by `npm run build` → zipped from `dist/`).
- `manifest.json` is at the zip root ✔ — manifest `version` is **2.0.0** (must be higher than the published version).

## 2. Store listing

**Name:** `Perflex — JS Performance Profiler`

**Summary** (≤132 chars):
```
JS performance profiler: function-level attribution, 37 detectors, network waterfall, Lighthouse estimate & AI coach.
```

**Category:** `Developer Tools`
**Language:** English

**Detailed description:**
```
Perflex tells you exactly which line of JavaScript is making your site slow — and how to fix it.

It passively instruments any page you visit and attributes main-thread time down to the originating script, function, and source position. It pattern-matches your session against 37 known performance anti-patterns and generates concrete remediation plans with before/after code, a risk level, and a note on why the fix is safe for your UI and business logic.

FEATURES
• Function-level attribution via the Long Animation Frames API
• Script leaderboard ranked by main-thread time, long tasks, transfer size & more
• Live Core Web Vitals (LCP, INP, CLS), TBT, FPS, JS heap, and a 0–100 health score
• Local Lighthouse performance-score estimate with a "What If" fix simulator
• Network waterfall: virtualized, color-coded timing phases, render-blocking & cache indicators
• Third-party impact dashboard: vendors ranked by their performance tax, with a "remove this vendor" simulator
• Zoomable interaction timeline with causal chains (click → task → fetch → reflow → shift)
• 37 anti-pattern detectors across loading, execution, rendering, network, third-party & frameworks
• Framework-aware: detects React/Vue/Angular/Next/Nuxt and flags dev builds shipped to production
• Business-safe remediations with before/after code and risk levels
• AI Performance Coach + per-finding AI fixes — use your own Anthropic Claude OR free Google Gemini key
• In-page overlay (Ctrl+Shift+X) with live FPS / heap / long tasks
• Export to JSON, HAR, OpenTelemetry traces, a redesigned PDF report, and an interactive shareable HTML

PRIVACY
Everything runs locally in your browser. No account, no tracking, nothing is uploaded. The optional AI features send only an anonymized, PII-free summary to your chosen provider (Anthropic or Google) — and only when you use them with your own API key configured.

Perflex is free and open source (MIT). Source: https://github.com/svemulapati/perflex
```

**Screenshots** (upload these — already 1280×800):
- `docs/screenshots/store/overview.png`
- `docs/screenshots/store/scripts.png`
- `docs/screenshots/store/timeline.png`
- `docs/screenshots/store/findings.png`
- `docs/screenshots/store/settings.png`

**Store icon:** 128×128 — `dist/src/assets/icons/icon-128.png` *(consider a more polished icon before launch).*

**Homepage URL:** `https://github.com/svemulapati/perflex`

## 3. Privacy practices tab

**Single purpose:**
```
Perflex measures and diagnoses the JavaScript performance of web pages the user chooses to profile, and suggests fixes. It is a developer performance-profiling tool.
```

**Permission justifications:**

| Permission | Justification |
|---|---|
| `scripting` | Inject the performance collector into the page's main world to instrument JavaScript execution (long tasks, network, layout thrashing, etc.). |
| `activeTab` | Access the tab the user is actively profiling when they open the extension. |
| `tabs` | Read the active tab's URL/title to label the session and route data to the correct tab's dashboard. |
| `storage` | Persist user settings locally (API key, first-party domains, viewer URL). |
| `sidePanel` | Display the diagnostic dashboard in Chrome's side panel. |
| `webNavigation` | Detect top-frame navigations to re-inject the collector and reset per-page session data. |
| `host_permissions: <all_urls>` | Perflex profiles whichever site the user visits, so it must be able to instrument any page the user chooses. |

**Remote code:** No — all executable code is bundled in the package; nothing is fetched and executed at runtime.

**Data usage disclosures:**
- Does the extension collect personally identifiable information? **No.**
- Health, financial, authentication, personal communications, location, web history? **No.**
- The extension processes web-page performance metrics **locally**.
- The optional AI features transmit a sanitized, non-PII summary to the user's selected provider — Anthropic (api.anthropic.com) or Google Gemini (generativelanguage.googleapis.com) — **only on explicit user action with the user's own API key**.
- Data is **not** sold or transferred to third parties for purposes unrelated to the single purpose.

**Privacy policy URL:** `https://svemulapati.github.io/perflex/privacy.html`
*(Requires GitHub Pages enabled → Deploy from branch → `/docs`.)*

## 4. Likely review notes

- `<all_urls>` + `scripting` are broad; the justifications above explain why a profiler needs them. If reviewers push back, the fallback is to gate injection behind `activeTab` (inject only when the user clicks the icon) instead of auto-injecting on navigation.
- First review typically takes a few days.
