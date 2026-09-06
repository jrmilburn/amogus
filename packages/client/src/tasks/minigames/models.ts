/** Matching is keyed by labels, never colour or display order. */
export class MatchBoard {
  readonly matched = new Set<string>();
  constructor(readonly labels: readonly string[]) {}
  connect(source: string, destination: string) {
    if (
      source !== destination ||
      !this.labels.includes(source) ||
      this.matched.has(source)
    )
      return false;
    this.matched.add(source);
    return true;
  }
  get complete() {
    return this.matched.size === this.labels.length;
  }
}
export class GyroCalibration {
  hits = 0;
  private lastPass = -1;
  constructor(readonly sweepMs = 2400) {}
  position(elapsed: number) {
    const phase = (Math.max(0, elapsed) / this.sweepMs) % 2;
    return phase <= 1 ? phase : 2 - phase;
  }
  inBand(elapsed: number) {
    return Math.abs(this.position(elapsed) - 0.5) <= 0.12;
  }
  tap(elapsed: number) {
    const pass = Math.floor(elapsed / this.sweepMs);
    if (this.hits >= 3 || !this.inBand(elapsed) || pass === this.lastPass)
      return false;
    this.lastPass = pass;
    this.hits++;
    return true;
  }
}
/** Only visible/focused elapsed time advances a station's local simulation. */
export class ActiveClock {
  elapsed = 0;
  private previous?: number;
  private wasActive = false;
  tick(now: number, active: boolean) {
    if (this.previous !== undefined && active && this.wasActive)
      this.elapsed += Math.max(0, Math.min(100, now - this.previous));
    this.previous = now;
    this.wasActive = active;
    return this.elapsed;
  }
}
export class TransferProgress {
  private startedAt?: number;
  start(elapsed: number) {
    if (this.startedAt !== undefined) return false;
    this.startedAt = elapsed;
    return true;
  }
  progress(elapsed: number) {
    return this.startedAt === undefined
      ? 0
      : Math.max(0, Math.min(8000, elapsed - this.startedAt));
  }
}
