import Dexie, { type Table } from 'dexie';
import { create } from 'zustand';
import type { Flow } from '@/shared/flow';

/** Perflex's IndexedDB. Flows are the first table; replays/baselines join later. */
class PerflexDB extends Dexie {
  flows!: Table<Flow, string>;
  constructor() {
    super('perflex');
    this.version(1).stores({ flows: 'id, createdAt, name' });
  }
}

let db: PerflexDB | null = null;
let dbFailed = false;

/** Lazily open the DB; returns null if IndexedDB is unavailable (private mode). */
function getDb(): PerflexDB | null {
  if (db) return db;
  if (dbFailed) return null;
  try {
    db = new PerflexDB();
    return db;
  } catch {
    dbFailed = true;
    return null;
  }
}

interface FlowState {
  flows: Flow[];
  available: boolean;
  load: () => Promise<void>;
  save: (flow: Flow) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useFlowStore = create<FlowState>((set, get) => ({
  flows: [],
  available: true,

  async load() {
    const d = getDb();
    if (!d) {
      set({ available: false });
      return;
    }
    try {
      const flows = await d.flows.orderBy('createdAt').reverse().toArray();
      set({ flows, available: true });
    } catch {
      set({ available: false });
    }
  },

  async save(flow) {
    const d = getDb();
    if (!d) {
      set({ available: false });
      return;
    }
    try {
      await d.flows.put(flow);
      await get().load();
    } catch {
      set({ available: false });
    }
  },

  async remove(id) {
    const d = getDb();
    if (!d) return;
    try {
      await d.flows.delete(id);
      await get().load();
    } catch {
      /* ignore */
    }
  },
}));
