/**
 * FNV-1a 32-bit hash. Used for stack-trace fingerprinting in the hot path —
 * we never store full stack strings during collection, only this integer.
 */

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

export function fnv1a(input: string): number {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // Multiply by the FNV prime using 32-bit overflow semantics.
    hash = Math.imul(hash, FNV_PRIME);
  }
  // Coerce to unsigned 32-bit.
  return hash >>> 0;
}

/**
 * Fingerprint the top `frames` lines of a stack trace. The first line of
 * Error().stack is the "Error" header, so we skip it.
 */
export function fingerprintStack(stack: string | undefined, frames = 4): number {
  if (!stack) return 0;
  const lines = stack.split('\n').slice(1, 1 + frames);
  return fnv1a(lines.join('|'));
}

/** Cheap, allocation-light hash of an arbitrary string body (e.g. response body). */
export function hashBody(body: string): number {
  // Cap the work: hashing megabytes of body is pointless for dedup detection.
  return fnv1a(body.length > 8192 ? body.slice(0, 8192) + ':' + body.length : body);
}
