import { create } from 'zustand';
import { DEFAULT_FEATURE_FLAGS, type CollectorFeatureFlags } from '@/shared/constants';
import type { AiProvider, ChatConfig } from '@/shared/ai-client';

export interface PerflexSettings {
  /** Which AI provider the Coach + remediation use. */
  aiProvider: AiProvider;
  anthropicApiKey: string;
  aiModel: string;
  /** Google Gemini (free tier). */
  googleApiKey: string;
  geminiModel: string;
  firstPartyDomains: string[];
  aiEnabled: boolean;
  /** Base URL of the static viewer used for shareable permalinks. */
  viewerBaseUrl: string;
  /** Opt-in Phase 2 collector modules. */
  featureFlags: CollectorFeatureFlags;
}

const DEFAULTS: PerflexSettings = {
  aiProvider: 'anthropic',
  anthropicApiKey: '',
  aiModel: 'claude-sonnet-4-6',
  googleApiKey: '',
  geminiModel: 'gemini-2.0-flash',
  firstPartyDomains: [],
  aiEnabled: true,
  viewerBaseUrl: 'https://svemulapati.github.io/perflex/',
  featureFlags: { ...DEFAULT_FEATURE_FLAGS },
};

/**
 * Resolve the active provider config, or null when its key is missing. This is
 * the single gate for every AI feature (Coach + remediation).
 */
export function resolveAiConfig(s: PerflexSettings): ChatConfig | null {
  if (s.aiProvider === 'google') {
    return s.googleApiKey ? { provider: 'google', apiKey: s.googleApiKey, model: s.geminiModel } : null;
  }
  return s.anthropicApiKey ? { provider: 'anthropic', apiKey: s.anthropicApiKey, model: s.aiModel } : null;
}

const STORAGE_KEY = 'perflex:settings';

/** A patch may flip a single feature flag, so featureFlags is itself partial. */
export type SettingsPatch = Partial<Omit<PerflexSettings, 'featureFlags'>> & {
  featureFlags?: Partial<CollectorFeatureFlags>;
};

interface SettingsState extends PerflexSettings {
  loaded: boolean;
  load: () => Promise<void>;
  update: (patch: SettingsPatch) => Promise<void>;
}

async function persist(settings: PerflexSettings): Promise<void> {
  try {
    await chrome.storage?.local.set({ [STORAGE_KEY]: settings });
  } catch {
    /* storage unavailable */
  }
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...DEFAULTS,
  loaded: false,

  async load() {
    try {
      const stored = await chrome.storage?.local.get(STORAGE_KEY);
      const saved = (stored?.[STORAGE_KEY] ?? {}) as Partial<PerflexSettings>;
      // Merge featureFlags key-by-key so a stored object from an older schema
      // still picks up defaults for flags added later.
      set({
        ...DEFAULTS,
        ...saved,
        featureFlags: { ...DEFAULT_FEATURE_FLAGS, ...saved.featureFlags },
        loaded: true,
      });
    } catch {
      set({ ...DEFAULTS, loaded: true });
    }
  },

  async update(patch) {
    const next: PerflexSettings = {
      aiProvider: patch.aiProvider ?? get().aiProvider,
      anthropicApiKey: patch.anthropicApiKey ?? get().anthropicApiKey,
      aiModel: patch.aiModel ?? get().aiModel,
      googleApiKey: patch.googleApiKey ?? get().googleApiKey,
      geminiModel: patch.geminiModel ?? get().geminiModel,
      firstPartyDomains: patch.firstPartyDomains ?? get().firstPartyDomains,
      aiEnabled: patch.aiEnabled ?? get().aiEnabled,
      viewerBaseUrl: patch.viewerBaseUrl ?? get().viewerBaseUrl,
      // Deep-merge so callers can flip a single flag with a partial object.
      featureFlags: { ...get().featureFlags, ...patch.featureFlags },
    };
    set(next);
    await persist(next);
  },
}));
