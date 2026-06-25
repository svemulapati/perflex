# perflex-ci

Replay a **Perflex user flow** (recorded in the Perflex extension → Settings → User Flows → Export) in a headless browser and **fail a pull request** if the journey's performance regresses or blows a budget.

This turns a recorded flow from documentation into an automated performance gate.

## How it works

1. You record a flow in the Perflex extension (e.g. a checkout path) and **Export** it to `checkout.flow.json`.
2. In CI, `perflex-ci` launches headless Chromium (Playwright), **replays the exact steps** using the recorded stable selectors, and measures Core Web Vitals (LCP, CLS, TBT, FCP) on every page the flow visits.
3. It checks the results against either a **budget file** or the flow's **recorded baseline** (regression mode), writes a markdown report for a PR comment, and exits non-zero if a check fails.

## Install & run locally

```bash
cd perflex-ci
npm install
npx playwright install chromium

# Regression mode — compares to the baseline stored in the flow:
node cli.mjs --flow ../path/to/checkout.flow.json --url http://localhost:3000 --verbose

# Budget mode — explicit thresholds:
node cli.mjs --flow checkout.flow.json --budgets perflex-budgets.example.json --md report.md
```

Exit code: **0** = pass, **1** = a check failed, **2** = usage/runtime error.

## CLI options

| Flag | Description |
|------|-------------|
| `--flow <file>` | **Required.** A flow exported from Perflex. |
| `--budgets <file>` | Budget list (see `perflex-budgets.example.json`). If omitted, falls back to the flow's baseline. |
| `--url <url>` | Override the flow's start URL (e.g. point at `http://localhost:3000`). |
| `--tolerance <0..1>` | Regression tolerance vs baseline (default `0.2` = 20%). |
| `--out <file>` | Write the full JSON report. |
| `--md <file>` | Write the markdown report (for PR comments). |
| `--verbose` | Log each replayed step. |

## Metrics

- **LCP** — worst (largest) across the journey's pages
- **CLS** — accumulated across pages
- **TBT** — total blocking time accumulated across pages
- **FCP** — first contentful paint of the journey

Measured via `PerformanceObserver` injected before page scripts run, so it captures real per-page vitals during replay.

## GitHub Actions

Copy `perflex.yml` to `.github/workflows/perflex.yml` and adjust the app-start step. It runs the flow on every PR and posts a results table as a comment:

```
## ❌ Perflex Performance Check — Checkout
**1 check(s) failed.**

| Metric | Value | Budget | Status |
|---|---|---|---|
| LCP | 3.10s | <= 2.50s | ❌ |
| CLS | 0.040 | <= 0.100 | ✅ |
| TBT | 120ms | <= 300ms | ✅ |
```

## Notes / limitations

- Typed values aren't recorded (privacy), so `type` steps fill placeholder text of the recorded length — fine for triggering behavior, but flows that depend on specific input values may need a fixture.
- The browser metrics are lab measurements (like Lighthouse), not field data. Run on a consistent CI runner for stable comparisons.
