import { create } from 'zustand';

export interface PerflexSettings {
  anthropicApiKey: string;
  aiModel: string;
  firstPartyDomains: string[];
  aiEnabled: boolean;
}

const DEFAULTS: PerflexSettings = {
  anthropicApiKey: '',
  aiModel: 'claude-sonnet-4-6',
  firstPartyDomains: [],
  aiEnabled: true,
};

const STORAGE_KEY = 'perflex:settings';

interface SettingsState extends PerflexSettings {
  loaded: boolean;
  load: () => Promise<void>;
  update: (patch: Partial<PerflexSettings>) => Promise<void>;
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
      set({ ...DEFAULTS, ...saved, loaded: true });
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
    };
    set(next);
    await persist(next);
  },
}));
