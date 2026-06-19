import type { ThirdPartyCategory } from './types';

export interface ThirdPartyEntry {
  /** Substring/host patterns matched against the script URL. */
  patterns: string[];
  name: string;
  category: ThirdPartyCategory;
}

/**
 * Built-in database of common third-party scripts. Matching is a simple
 * case-insensitive substring test against the full script URL — cheap and
 * good enough for classification.
 */
export const THIRD_PARTY_DB: ThirdPartyEntry[] = [
  { name: 'Google Analytics', category: 'analytics', patterns: ['google-analytics.com', 'analytics.js', 'gtag/js', 'ga.js'] },
  { name: 'Google Tag Manager', category: 'tag-manager', patterns: ['googletagmanager.com'] },
  { name: 'Google Ads', category: 'marketing', patterns: ['googlesyndication.com', 'googleadservices.com', 'doubleclick.net'] },
  { name: 'Facebook Pixel', category: 'marketing', patterns: ['connect.facebook.net', 'fbevents.js'] },
  { name: 'Segment', category: 'analytics', patterns: ['cdn.segment.com', 'analytics.min.js'] },
  { name: 'HubSpot', category: 'marketing', patterns: ['js.hs-scripts.com', 'js.hsforms.net', 'hs-analytics.net'] },
  { name: 'Hotjar', category: 'analytics', patterns: ['static.hotjar.com', 'script.hotjar.com'] },
  { name: 'Intercom', category: 'support', patterns: ['widget.intercom.io', 'js.intercomcdn.com'] },
  { name: 'Stripe', category: 'payments', patterns: ['js.stripe.com'] },
  { name: 'PayPal', category: 'payments', patterns: ['paypal.com/sdk', 'paypalobjects.com'] },
  { name: 'Zendesk', category: 'support', patterns: ['static.zdassets.com', 'zendesk.com'] },
  { name: 'Drift', category: 'support', patterns: ['js.driftt.com', 'driftt.com'] },
  { name: 'Optimizely', category: 'ab-testing', patterns: ['cdn.optimizely.com'] },
  { name: 'VWO', category: 'ab-testing', patterns: ['dev.visualwebsiteoptimizer.com', 'wingify.com'] },
  { name: 'Mixpanel', category: 'analytics', patterns: ['cdn.mxpnl.com', 'mixpanel'] },
  { name: 'Amplitude', category: 'analytics', patterns: ['cdn.amplitude.com', 'amplitude.com/libs'] },
  { name: 'Tealium', category: 'tag-manager', patterns: ['tags.tiqcdn.com'] },
  { name: 'Twitter Widgets', category: 'social', patterns: ['platform.twitter.com'] },
  { name: 'LinkedIn Insight', category: 'marketing', patterns: ['snap.licdn.com'] },
  { name: 'TikTok Pixel', category: 'marketing', patterns: ['analytics.tiktok.com'] },
  { name: 'Cloudflare Insights', category: 'analytics', patterns: ['static.cloudflareinsights.com'] },
  { name: 'jsDelivr CDN', category: 'cdn', patterns: ['cdn.jsdelivr.net'] },
  { name: 'unpkg CDN', category: 'cdn', patterns: ['unpkg.com'] },
  { name: 'cdnjs', category: 'cdn', patterns: ['cdnjs.cloudflare.com'] },
  { name: 'New Relic', category: 'analytics', patterns: ['js-agent.newrelic.com', 'bam.nr-data.net'] },
  { name: 'Sentry', category: 'analytics', patterns: ['browser.sentry-cdn.com', 'js.sentry-cdn.com'] },
  { name: 'FullStory', category: 'analytics', patterns: ['fullstory.com/s/fs.js', 'fullstory.com'] },
];

const KNOWN_LIBRARIES = [
  { name: 'React', patterns: ['react.production.min.js', 'react.development.js', '/react@', 'react-dom'] },
  { name: 'jQuery', patterns: ['jquery.min.js', 'jquery-', '/jquery@'] },
  { name: 'Lodash', patterns: ['lodash.min.js', '/lodash@', 'lodash.js'] },
  { name: 'Moment.js', patterns: ['moment.min.js', '/moment@', 'moment.js'] },
  { name: 'Vue', patterns: ['vue.min.js', '/vue@', 'vue.global.js'] },
  { name: 'Angular', patterns: ['angular.min.js', '@angular/core'] },
  { name: 'D3', patterns: ['d3.min.js', '/d3@'] },
  { name: 'Bootstrap', patterns: ['bootstrap.min.js', '/bootstrap@'] },
];

export function matchThirdParty(url: string): ThirdPartyEntry | null {
  const lower = url.toLowerCase();
  for (const entry of THIRD_PARTY_DB) {
    if (entry.patterns.some((p) => lower.includes(p))) return entry;
  }
  return null;
}

/** Identify a well-known library for duplicate-library detection. Returns its name. */
export function matchKnownLibrary(url: string): string | null {
  const lower = url.toLowerCase();
  for (const lib of KNOWN_LIBRARIES) {
    if (lib.patterns.some((p) => lower.includes(p))) return lib.name;
  }
  return null;
}

/** URLs whose initiator chain traces to one of these are tag-manager cascades. */
export const TAG_MANAGER_HOSTS = ['googletagmanager.com', 'tags.tiqcdn.com', 'assets.adobedtm.com'];
