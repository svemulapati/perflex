import { create } from 'zustand';
import { FLOW_SCHEMA_VERSION, type Flow, type FlowStep } from '@/shared/flow';
import { useSessionStore } from './session-store';
import { useFlowStore } from './flow-store';

interface RecordingState {
  recording: boolean;
  steps: FlowStep[];
  start: () => void;
  addStep: (step: FlowStep) => void;
  cancel: () => void;
  /** Stop, build a Flow (with a baseline snapshot), and persist it. */
  stopAndSave: (name: string) => Promise<Flow | null>;
}

export const useRecordingStore = create<RecordingState>((set, get) => ({
  recording: false,
  steps: [],

  start() {
    set({ recording: true, steps: [] });
    useSessionStore.getState().sendControl('flow-record-start');
  },

  addStep(step) {
    if (!get().recording) return;
    set((s) => ({ steps: [...s.steps, step] }));
  },

  cancel() {
    useSessionStore.getState().sendControl('flow-record-stop');
    set({ recording: false, steps: [] });
  },

  async stopAndSave(name) {
    useSessionStore.getState().sendControl('flow-record-stop');
    const steps = get().steps;
    set({ recording: false, steps: [] });
    if (steps.length === 0) return null;

    const session = useSessionStore.getState();
    const snap = session.snapshot;
    const flow: Flow = {
      id: `flow-${Date.now()}-${steps.length}`,
      name: name.trim() || 'Untitled flow',
      createdAt: Date.now(),
      url: session.url,
      steps,
      schemaVersion: FLOW_SCHEMA_VERSION,
      baseline: snap
        ? {
            healthScore: snap.healthScore,
            lcp: snap.vitals.lcp,
            inp: snap.vitals.inp,
            cls: snap.vitals.cls,
            totalBlockingTime: snap.totalBlockingTime,
          }
        : undefined,
    };
    await useFlowStore.getState().save(flow);
    return flow;
  },
}));
