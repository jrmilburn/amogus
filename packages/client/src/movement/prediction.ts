import {
  movePlayer,
  type CollisionMap,
  type MovementInput,
} from '@mutiny/shared';
import type { Point } from '@mutiny/shared/maps';

export class Prediction {
  position: Point;
  pending: MovementInput[] = [];
  constructor(
    position: Point,
    private readonly map: CollisionMap,
  ) {
    this.position = { x: position.x, y: position.y };
  }
  push(input: MovementInput, speed: number) {
    // Stop predicting if the server has not acknowledged two seconds of input.
    if (this.pending.length >= 40) return false;
    this.pending.push(input);
    this.position = movePlayer(this.position, input, speed, this.map);
    return true;
  }
  reconcile(
    position: Point,
    acknowledged: number,
    speed: number,
    enabled = true,
  ) {
    this.pending = enabled
      ? this.pending.filter((input) => input.seq > acknowledged)
      : [];
    this.position = { x: position.x, y: position.y };
    for (const input of this.pending)
      this.position = movePlayer(this.position, input, speed, this.map);
  }
}

export interface Snapshot extends Point {
  time: number;
  facing: number;
  walking: boolean;
}
export class Interpolation {
  private samples: Snapshot[] = [];
  push(snapshot: Snapshot) {
    this.samples.push({ ...snapshot });
    if (this.samples.length > 30) this.samples.shift();
  }
  sample(now: number): Snapshot | undefined {
    const time = now - 100;
    while (this.samples.length > 2 && this.samples[1]!.time <= time)
      this.samples.shift();
    const a = this.samples[0];
    const b = this.samples[1];
    if (!a || !b || time <= a.time) return a;
    const amount = Math.max(
      0,
      Math.min(1, (time - a.time) / (b.time - a.time || 1)),
    );
    // Teleports must not interpolate through the station's walls.
    if (Math.hypot(b.x - a.x, b.y - a.y) > 200) return b;
    return {
      ...b,
      x: a.x + (b.x - a.x) * amount,
      y: a.y + (b.y - a.y) * amount,
    };
  }
}
