/**
 * In-page performance overlay. Runs in the page's MAIN world (it is part of the
 * collector bundle) and renders into a CLOSED Shadow DOM with adoptedStyleSheets
 * so it neither leaks styles to the host page nor is affected by host styles.
 */

export interface OverlayStats {
  fps: number;
  frameHealth: number;
  throttle: string;
  heapMB: number;
  longTasks: number;
  activeRequests: number;
}

const STYLES = `
:host { all: initial; }
.root {
  position: fixed; bottom: 12px; right: 12px;
  z-index: 2147483647;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: #e4e4e7;
  user-select: none;
}
.pill {
  display: flex; align-items: center; gap: 6px;
  background: rgba(24,24,27,0.85); backdrop-filter: blur(6px);
  border: 1px solid #3f3f46; border-radius: 999px;
  padding: 3px 9px; font-size: 11px; cursor: pointer;
  box-shadow: 0 4px 14px rgba(0,0,0,0.4);
}
.dot { width: 8px; height: 8px; border-radius: 50%; }
.panel {
  margin-top: 6px; width: 168px;
  background: rgba(24,24,27,0.95); backdrop-filter: blur(8px);
  border: 1px solid #3f3f46; border-radius: 8px;
  padding: 8px; font-size: 11px;
  box-shadow: 0 6px 20px rgba(0,0,0,0.5);
}
.panel.hidden { display: none; }
.head { display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; }
.brand { font-weight: 700; color: #818cf8; }
.row { display:flex; justify-content:space-between; padding:2px 0; }
.row .k { color:#a1a1aa; }
.row .v { font-variant-numeric: tabular-nums; }
.bar { height:3px; background:#3f3f46; border-radius:2px; margin-top:4px; overflow:hidden; }
.bar > i { display:block; height:100%; background:#10b981; }
.warn { color:#f59e0b; }
.close { cursor:pointer; color:#71717a; }
`;

function color(fps: number): string {
  if (fps >= 55) return '#10b981';
  if (fps >= 30) return '#f59e0b';
  return '#ef4444';
}

export interface OverlayHandle {
  toggle: () => void;
  show: () => void;
  hide: () => void;
  destroy: () => void;
}

export function setupOverlay(getStats: () => OverlayStats): OverlayHandle {
  const host = document.createElement('div');
  host.setAttribute('data-perflex-overlay', '');
  const shadow = host.attachShadow({ mode: 'closed' });

  const sheet = new CSSStyleSheet();
  sheet.replaceSync(STYLES);
  shadow.adoptedStyleSheets = [sheet];

  const root = document.createElement('div');
  root.className = 'root';
  root.innerHTML = `
    <div class="pill"><span class="dot"></span><span class="fps">–</span> fps</div>
    <div class="panel hidden">
      <div class="head"><span class="brand">Perflex</span><span class="close">✕</span></div>
      <div class="row"><span class="k">FPS</span><span class="v fps">–</span></div>
      <div class="bar"><i class="fpsbar"></i></div>
      <div class="row"><span class="k">Frame health</span><span class="v fh">–</span></div>
      <div class="row"><span class="k">JS heap</span><span class="v heap">–</span></div>
      <div class="row"><span class="k">Long tasks</span><span class="v lt">–</span></div>
      <div class="row"><span class="k">Req (1s)</span><span class="v req">–</span></div>
      <div class="row throttle" style="display:none"><span class="k warn">Throttled</span><span class="v thr"></span></div>
    </div>`;
  shadow.appendChild(root);

  const pill = root.querySelector('.pill') as HTMLElement;
  const panel = root.querySelector('.panel') as HTMLElement;
  const q = (sel: string) => root.querySelectorAll(sel);
  const set = (sel: string, text: string) => q(sel).forEach((el) => ((el as HTMLElement).textContent = text));

  let visible = false;
  let expanded = false;

  const apply = () => {
    host.style.display = visible ? 'block' : 'none';
    panel.classList.toggle('hidden', !expanded);
  };

  pill.addEventListener('click', () => {
    expanded = !expanded;
    apply();
  });
  (root.querySelector('.close') as HTMLElement).addEventListener('click', (e) => {
    e.stopPropagation();
    expanded = false;
    apply();
  });

  // Draggable.
  let dragging = false;
  let sx = 0;
  let sy = 0;
  let ox = 0;
  let oy = 0;
  pill.addEventListener('pointerdown', (e) => {
    dragging = true;
    sx = e.clientX;
    sy = e.clientY;
    const rect = root.getBoundingClientRect();
    ox = rect.left;
    oy = rect.top;
    pill.setPointerCapture(e.pointerId);
  });
  pill.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    root.style.left = `${ox + (e.clientX - sx)}px`;
    root.style.top = `${oy + (e.clientY - sy)}px`;
    root.style.right = 'auto';
    root.style.bottom = 'auto';
  });
  pill.addEventListener('pointerup', () => {
    dragging = false;
  });

  const update = () => {
    const s = getStats();
    const c = color(s.fps);
    (q('.dot')[0] as HTMLElement).style.background = c;
    set('.fps', String(s.fps));
    (root.querySelector('.fpsbar') as HTMLElement).style.width = `${Math.min(100, (s.fps / 60) * 100)}%`;
    (root.querySelector('.fpsbar') as HTMLElement).style.background = c;
    set('.fh', `${s.frameHealth}%`);
    set('.heap', s.heapMB > 0 ? `${s.heapMB.toFixed(1)} MB` : 'n/a');
    set('.lt', String(s.longTasks));
    set('.req', String(s.activeRequests));
    const throttled = s.throttle !== 'none';
    (root.querySelector('.throttle') as HTMLElement).style.display = throttled ? 'flex' : 'none';
    set('.thr', s.throttle);
  };

  // Attach once the body exists.
  const mount = () => (document.body || document.documentElement).appendChild(host);
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount, { once: true });

  const interval = window.setInterval(update, 500);
  apply();

  return {
    toggle: () => {
      visible = !visible;
      if (visible) expanded = true;
      apply();
      update();
    },
    show: () => {
      visible = true;
      apply();
    },
    hide: () => {
      visible = false;
      apply();
    },
    destroy: () => {
      clearInterval(interval);
      host.remove();
    },
  };
}
