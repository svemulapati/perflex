import type { ScriptClassification, ThirdPartyCategory } from './types';
import { matchThirdParty } from './third-party-db';

export interface Classification {
  classification: ScriptClassification;
  origin: string;
  category?: ThirdPartyCategory;
  thirdPartyName?: string;
}

function safeOrigin(url: string): string {
  try {
    return new URL(url, location.href).origin;
  } catch {
    return '';
  }
}

/**
 * Classify a script URL relative to the current page origin and an optional
 * user-configured first-party allowlist (extra origins treated as first-party).
 */
export function classifyScript(
  url: string,
  pageOrigin: string,
  firstPartyAllowlist: string[] = []
): Classification {
  if (!url || url.startsWith('inline:') || url === pageOrigin) {
    return { classification: 'inline', origin: pageOrigin };
  }

  const origin = safeOrigin(url);

  if (origin === pageOrigin || firstPartyAllowlist.includes(origin)) {
    return { classification: 'first-party', origin };
  }

  const known = matchThirdParty(url);
  if (known) {
    return {
      classification: 'third-party-known',
      origin,
      category: known.category,
      thirdPartyName: known.name,
    };
  }

  return { classification: 'third-party-unknown', origin };
}
