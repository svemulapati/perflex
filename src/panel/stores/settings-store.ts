import { create } from 'zustand';
import { DEFAULT_FEATURE_FLAGS, type CollectorFeatureFlags } from '@/shared/constants';

export interface PerflexSettings {
  anthropicApiKey: string;
  aiModel: string;
  firstPartyDomains: string[];
  aiEnabled: boolean;
  /** Base URL of the static viewer used for shareable permalinks. */
  viewerBaseUrl: string;
  /** Opt-in Phase 2 collector modules. */
  featureFlags: CollectorFeatureFlags;
}

const DEFAULTS: PerflexSettings = {
  anthropicApiKey: '',
  aiModel: 'claude-sonnet-4-6',
  firstPartyDomains: [],
  aiEnabled: true,
  viewerBaseUrl: 'https://svemulapati.github.io/perflex/',
  featureFlags: { ...DEFAULT_FEATURE_FLAGS },
};

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
      anthropicApiKey: patch.anthropicApiKey ?? get().anthropicApiKey,
      aiModel: patch.aiModel ?? get().aiModel,
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
