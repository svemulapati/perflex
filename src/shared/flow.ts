/**
 * User-flow model + selector generation (Feature 4). Pure and DOM-testable; the
 * collector reuses generateSelector when recording, and the panel stores/replays
 * the resulting steps. Recorded values are never stored — only their length.
 */

export type FlowAction = 'click' | 'type' | 'scroll' | 'navigate' | 'wait';

export interface FlowStep {
  action: FlowAction;
  /** CSS selector for the target (most stable available). */
  selector: string;
  /** For 'type': character count only — the raw value is never recorded. */
  valueLength?: number;
  scrollPosition?: { x: number; y: number };
  /** For 'navigate'. */
  url?: string;
  timestamp: number;
  /** Human-readable description, e.g. "Click 'Add to cart'". */
  label?: string;
}

export const FLOW_SCHEMA_VERSION = 1;

/** Performance snapshot captured when the flow was recorded, for replay diffs. */
export interface FlowBaseline {
  healthScore: number;
  lcp: number | null;
  inp: number | null;
  cls: number;
  totalBlockingTime: number;
}

export interface Flow {
  id: string;
  name: string;
  createdAt: number;
  /** Page URL the flow started on. */
  url: string;
  steps: FlowStep[];
  schemaVersion: number;
  baseline?: FlowBaseline;
}

/* ---- selector generation ---- */

function cssIdent(s: string): string {
  const g = globalThis as { CSS?: { escape?: (v: string) => string } };
  if (g.CSS?.escape) return g.CSS.escape(s);
  return s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);
}

function cssAttr(s: string): string {
  return s.replace(/["\\]/g, (c) => `\\${c}`);
}

function isUnique(selector: string, el: Element, doc: Document): boolean {
  try {
    const found = doc.querySelectorAll(selector);
    return found.length === 1 && found[0] === el;
  } catch {
    return false;
  }
}

/** Walk up to the nearest id-bearing ancestor, building an nth-of-type path. */
function nthPath(el: Element): string {
  const parts: string[] = [];
  let node: Element | null = el;
  while (node && node.nodeType === 1 && node.tagName.toLowerCase() !== 'html') {
    const tag = node.tagName.toLowerCase();
    const parent: Element | null = node.parentElement;
    if (!parent) {
      parts.unshift(tag);
      break;
    }
    const sameTag = Array.from(parent.children).filter((c) => c.tagName === node!.tagName);
    parts.unshift(sameTag.length > 1 ? `${tag}:nth-of-type(${sameTag.indexOf(node) + 1})` : tag);
    const pid = parent.getAttribute('id');
    if (pid) {
      parts.unshift(`#${cssIdent(pid)}`);
      break;
    }
    node = parent;
  }
  return parts.join(' > ');
}

/**
 * Generate the most stable unique selector for an element, in priority order:
 * #id → [data-testid] → [aria-label] → tag.class-chain → nth-of-type path.
 */
export function generateSelector(el: Element): string {
  if (!el || el.nodeType !== 1) return '';
  const doc = el.ownerDocument;
  const tag = el.tagName.toLowerCase();

  const id = el.getAttribute('id');
  if (id) {
    const s = `#${cssIdent(id)}`;
    if (isUnique(s, el, doc)) return s;
  }
  const testid = el.getAttribute('data-testid');
  if (testid) {
    const s = `[data-testid="${cssAttr(testid)}"]`;
    if (isUnique(s, el, doc)) return s;
  }
  const aria = el.getAttribute('aria-label');
  if (aria) {
    const s = `${tag}[aria-label="${cssAttr(aria)}"]`;
    if (isUnique(s, el, doc)) return s;
  }
  const classes = (el.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean);
  if (classes.length) {
    const s = `${tag}.${classes.map(cssIdent).join('.')}`;
    if (isUnique(s, el, doc)) return s;
  }
  return nthPath(el);
}

/** Privacy: keep only the length of typed input, never the value. */
export function redactValueLength(value: string): number {
  return value.length;
}

/** Short human description of a step for the replay checklist. */
export function describeStep(step: FlowStep): string {
  switch (step.action) {
    case 'click':
      return `Click ${step.label ? `"${step.label}"` : step.selector}`;
    case 'type':
      return `Type ${step.valueLength ?? 0} characters into ${step.label ?? step.selector}`;
    case 'scroll':
      return `Scroll to ${step.scrollPosition ? `${Math.round(step.scrollPosition.y)}px` : 'position'}`;
    case 'navigate':
      return `Navigate to ${step.url ?? 'a new page'}`;
    case 'wait':
      return 'Wait for the page to settle';
  }
}

/* ---- serialization ---- */

export function serializeFlow(flow: Flow): string {
  return JSON.stringify(flow, null, 2);
}

/** Parse + validate an imported flow. Throws on a malformed payload. */
export function parseFlow(json: string): Flow {
  const raw = JSON.parse(json) as Partial<Flow>;
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.steps) || typeof raw.name !== 'string') {
    throw new Error('Not a valid Perflex flow file.');
  }
  return {
    id: typeof raw.id === 'string' ? raw.id : `flow-${raw.createdAt ?? 0}`,
    name: raw.name,
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : 0,
    url: typeof raw.url === 'string' ? raw.url : '',
    steps: raw.steps.filter((s): s is FlowStep => !!s && typeof s.selector === 'string' && typeof s.action === 'string'),
    schemaVersion: typeof raw.schemaVersion === 'number' ? raw.schemaVersion : FLOW_SCHEMA_VERSION,
    baseline: raw.baseline,
  };
}
