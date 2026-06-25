# Perflex Privacy Policy

_Last updated: 2026-06-24_

**Perflex is a privacy-first, local-only browser extension.** It does not require an
account, does not track you, and does not upload your browsing or performance data to
any server operated by us — we do not operate any server.

## What Perflex does
Perflex measures and diagnoses the JavaScript performance of web pages you choose to
profile, capturing signals like long tasks, network timings, layout shifts, memory, and
DOM activity, and analyzing them entirely in your browser.

## Data we collect
**None is sent to us.** All captured data is processed locally and kept only for the
session. We do not collect personally identifiable information, credentials, financial or
health data, personal communications, location, or web-browsing history.

## Local storage
Settings are stored locally on your device: an optional AI provider API key — either an
Anthropic Claude key or a Google Gemini key (if you provide one) — your configured
first-party domains, and the viewer URL for shareable links.

## Optional AI features
The AI features are **opt-in** and only work if you supply your own API key for the AI
provider you select in Settings (**Anthropic Claude** or **Google Gemini**).

- **AI Analysis** (per finding): when you explicitly click it, Perflex sends an anonymized,
  non-identifying summary of that single finding (pattern name, script filename, function
  name, timing metrics) to your selected provider.
- **AI Coach** (chat): when you send a message, Perflex sends an anonymized summary of the
  current session (health score, Core Web Vitals, top scripts by filename, findings) plus
  your message. URLs are reduced to `site.com/path` with query values removed.

In both cases, full URLs, request/response bodies, and page content are never sent. Data is
transmitted only to the provider you chose — `api.anthropic.com` (governed by
[Anthropic's privacy policy](https://www.anthropic.com/legal/privacy)) or
`generativelanguage.googleapis.com` (governed by
[Google's privacy policy](https://policies.google.com/privacy)).

## Sharing & exports
Exports and shareable links are encoded on your device. Permalinks keep the session in the
URL fragment, which browsers never transmit to a server.

## Data sharing & sale
We do not sell, rent, or share your data. No analytics, ads, or telemetry.

## Contact
[github.com/svemulapati/perflex/issues](https://github.com/svemulapati/perflex/issues)
