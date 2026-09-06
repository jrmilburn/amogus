export class FuelMeter {
  filledMs = 0;
  advance(ms: number, held: boolean) {
    if (held) this.filledMs = Math.min(5000, this.filledMs + Math.max(0, ms));
    return this.filledMs / 5000;
  }
}
export class DebrisField {
  readonly removed = new Set<number>();
  remove(id: number, outside: boolean) {
    if (
      !outside ||
      id < 0 ||
      id >= 5 ||
      !Number.isInteger(id) ||
      this.removed.has(id)
    )
      return false;
    this.removed.add(id);
    return true;
  }
  get complete() {
    return this.removed.size === 5;
  }
}
export class AccessSequence {
  input = '';
  private shownAt?: number;
  constructor(readonly code: string) {
    if (!/^\d{5}$/.test(code))
      throw new Error('Code must contain five digits.');
  }
  reveal(now: number) {
    this.input = '';
    this.shownAt = now;
  }
  visible(now: number) {
    return this.shownAt !== undefined && now - this.shownAt < 2000;
  }
  canEnter(now: number) {
    return this.shownAt !== undefined && !this.visible(now);
  }
  digit(digit: string, now: number) {
    if (this.canEnter(now) && /^\d$/.test(digit) && this.input.length < 5)
      this.input += digit;
  }
  submit(now: number) {
    return this.canEnter(now) && this.input === this.code;
  }
  erase() {
    this.input = this.input.slice(0, -1);
  }
}
export class CardSwipe {
  position = 0;
  private started?: number;
  private reversed = false;
  private furthest = 0;
  begin(now: number) {
    this.started = now;
    this.position = 0;
    this.furthest = 0;
    this.reversed = false;
  }
  move(position: number) {
    if (this.started === undefined || !Number.isFinite(position)) return;
    if (position < this.furthest - 0.08) this.reversed = true;
    this.position = Math.max(0, Math.min(1, position));
    this.furthest = Math.max(this.furthest, this.position);
  }
  finish(now: number): 'ok' | 'incomplete' | 'reversed' | 'fast' | 'slow' {
    const start = this.started;
    this.started = undefined;
    if (start === undefined || this.position < 0.95) return 'incomplete';
    if (this.reversed) return 'reversed';
    const duration = now - start;
    return duration < 800 ? 'fast' : duration > 1600 ? 'slow' : 'ok';
  }
  cancel() {
    this.started = undefined;
    this.position = 0;
  }
}
