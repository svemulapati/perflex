import type { ExportBundle } from '../types';

export const SCHEMA_VERSION = '1.0';

/** Full session export. Forward-compatible via schemaVersion. */
export function toJSON(bundle: ExportBundle, generatedAt = Date.now()): string {
  const { snapshot, resources, network } = bundle;
  return JSON.stringify(
    {
      schemaVersion: SCHEMA_VERSION,
      tool: 'Perflex',
      generatedAt: new Date(generatedAt).toISOString(),
      url: snapshot.url,
      session: {
        startedAt: snapshot.startedAt,
        updatedAt: snapshot.updatedAt,
        healthScore: snapshot.healthScore,
        vitals: snapshot.vitals,
        totalBlockingTime: snapshot.totalBlockingTime,
        heapSize: snapshot.heapSize,
        frameDropRate: snapshot.frameDropRate,
        networkRequestCount: snapshot.networkRequestCount,
        fps: snapshot.fps,
      },
      scripts: snapshot.scripts,
      findings: snapshot.findings,
      interactions: snapshot.interactions,
      timeline: snapshot.timeline,
      resources,
      network,
    },
    null,
    2
  );
}
