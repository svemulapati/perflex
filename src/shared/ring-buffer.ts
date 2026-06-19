/**
 * Fixed-size circular buffer. Caps memory in the collector hot path —
 * once full, new pushes overwrite the oldest entries.
 */
export class RingBuffer<T> {
  private readonly buffer: (T | undefined)[];
  private head = 0; // next write index
  private count = 0;

  constructor(private readonly capacity: number) {
    if (capacity <= 0) throw new Error('RingBuffer capacity must be > 0');
    this.buffer = new Array<T | undefined>(capacity);
  }

  push(item: T): void {
    this.buffer[this.head] = item;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;
  }

  get size(): number {
    return this.count;
  }

  get isFull(): boolean {
    return this.count === this.capacity;
  }

  /** Return items in insertion order (oldest first). */
  toArray(): T[] {
    const out: T[] = [];
    if (this.count === 0) return out;
    const start = this.count < this.capacity ? 0 : this.head;
    for (let i = 0; i < this.count; i++) {
      const item = this.buffer[(start + i) % this.capacity];
      if (item !== undefined) out.push(item);
    }
    return out;
  }

  /** Drain all items (oldest first) and reset the buffer. */
  drain(): T[] {
    const out = this.toArray();
    this.clear();
    return out;
  }

  clear(): void {
    this.buffer.fill(undefined);
    this.head = 0;
    this.count = 0;
  }
}
