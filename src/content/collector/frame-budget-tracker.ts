import type { FrameEvent } from '@/shared/types';
import { FRAME_BUDGET } from '@/shared/constants';
import type { CollectorContext } from './context';

/**
 * Measures time between consecutive animation frames. Frames exceeding the
 * 60fps budget are emitted with their overrun. Also exposes a rolling FPS /
 * frame-health figure for the live overlay.
 */
export interface FrameTracker {
  stop: () => void;
  getFps: () => number;
  getFrameHealth: () => number;
}

export function setupFrameBudgetTracker(ctx: CollectorContext): FrameTracker {
  let last = performance.now();
  let running = true;
  let rafId = 0;

  // Rolling window of frame durations over the last ~5s.
  const recent: { t: number; dur: number }[] = [];

  const tick = (now: number) => {
    if (!running) return;
    const frameDuration = now - last;
    last = now;

    ctx.measure(() => {
      recent.push({ t: now, dur: frameDuration });
      // Trim to a 5s window.
      const cutoff = now - 5000;
      while (recent.length && recent[0].t < cutoff) recent.shift();

      if (frameDuration > FRAME_BUDGET * 1.5 && ctx.isEnabled('frame')) {
        const event: FrameEvent = {
          seq: 0,
          kind: 'frame',
          timestamp: now,
          frameDuration,
          overrun: frameDuration - FRAME_BUDGET,
        };
        ctx.emit(event);
      }
    });

    rafId = requestAnimationFrame(tick);
  };

  rafId = requestAnimationFrame(tick);

  const getFps = () => {
    if (recent.length < 2) return 60;
    const span = recent[recent.length - 1].t - recent[0].t;
    if (span <= 0) return 60;
    return Math.min(120, Math.round((recent.length / span) * 1000));
  };

  const getFrameHealth = () => {
    if (recent.length === 0) return 100;
    const good = recent.filter((f) => f.dur <= FRAME_BUDGET * 1.2).length;
    return Math.round((good / recent.length) * 100);
  };

  return {
    stop: () => {
      running = false;
      cancelAnimationFrame(rafId);
    },
    getFps,
    getFrameHealth,
  };
}
