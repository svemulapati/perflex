# Screenshots

Drop the PNG/JPG files here with the exact names below and they'll render in the
main [README](../../README.md) automatically — no markdown edits needed.

## What to capture

Run `npm run build`, load `dist/` as an unpacked extension, open a **heavy real-world
page** (e.g. `cnn.com`, `fonts.google.com`, an Amazon product page), interact with it
for a few seconds, then capture each side-panel tab.

| File | View | What it should show |
|---|---|---|
| `overview.png` | **Overview** tab | Health score gauge, Core Web Vitals badges, "Detected Frameworks", Top Offenders, Recent Findings |
| `scripts.png` | **Scripts** tab | The leaderboard with a couple of rows; expand one to reveal its hot functions |
| `timeline.png` | **Timeline** tab | The zoomed timeline lanes + an interaction selected so its causal chain panel is visible |
| `findings.png` | **Findings** tab | A critical finding expanded via "View fix" showing the before/after code diff + risk level |
| `overlay.png` | **In-page overlay** | The Shadow-DOM HUD (`Ctrl+Shift+X`) expanded on a real page, showing FPS/heap/long tasks |

## Tips for clean shots

- Use the side panel at ~**420–480px** wide so tables aren't cramped.
- Capture in **dark mode** (the default) — it matches the README's aesthetic.
- Aim for roughly **1280×800** (or 2× for retina crispness); keep files reasonably small (< ~400 KB each).
- macOS: `Cmd+Shift+4` then `Space` to grab a single window/panel cleanly.
- A short **GIF** of zooming the timeline or running an AI fix is a great optional addition (`demo.gif`) — animated demos convert really well on GitHub.

Once added, commit them and the README gallery comes alive.
