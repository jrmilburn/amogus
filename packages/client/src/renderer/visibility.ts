import {
  pointInPolygon,
  type MapDef,
  type Point,
  type Rect,
} from '@mutiny/shared/maps';
import type { SettingsValues } from '@mutiny/shared';

export const BASE_VISION_RADIUS = 650;
export function visionRadius(
  role: 'crew' | 'impostor' | undefined,
  settings: Pick<SettingsValues, 'crewVision' | 'impostorVision'>,
) {
  return (
    BASE_VISION_RADIUS *
    (role === 'impostor' ? settings.impostorVision : settings.crewVision)
  );
}
/** Slab intersection against closed wall rectangles, including axis-aligned rays. */
export function rayWall(
  origin: Point,
  dx: number,
  dy: number,
  wall: Rect,
  limit: number,
) {
  let near = 0,
    far = limit;
  for (const [p, d, min, max] of [
    [origin.x, dx, wall.x, wall.x + wall.width],
    [origin.y, dy, wall.y, wall.y + wall.height],
  ]) {
    if (Math.abs(d!) < 1e-12) {
      if (p! < min! || p! > max!) return limit;
      continue;
    }
    const a = (min! - p!) / d!,
      b = (max! - p!) / d!;
    near = Math.max(near, Math.min(a, b));
    far = Math.min(far, Math.max(a, b));
    if (near > far) return limit;
  }
  return near;
}

/** Fixed circle samples plus rays on both sides of every nearby wall corner. */
export class VisibilityField {
  polygon: Point[] = [];
  origin: Point = { x: 0, y: 0 };
  radius = 0;
  private revision = 0;
  private computedRevision = -1;
  private extraWalls: Rect[] = [];
  constructor(private map: Pick<MapDef, 'walls' | 'size'>) {}
  setClosedDoors(walls: readonly Rect[]) {
    this.extraWalls = walls.map((wall) => ({ ...wall }));
    this.revision++;
  }
  update(origin: Point, radius: number) {
    if (
      origin.x === this.origin.x &&
      origin.y === this.origin.y &&
      radius === this.radius &&
      this.computedRevision === this.revision
    )
      return false;
    this.computedRevision = this.revision;
    this.origin = { ...origin };
    this.radius = radius;
    if (
      !Number.isFinite(origin.x) ||
      !Number.isFinite(origin.y) ||
      !Number.isFinite(radius) ||
      radius <= 0 ||
      origin.x < 0 ||
      origin.y < 0 ||
      origin.x > this.map.size.width ||
      origin.y > this.map.size.height
    ) {
      this.polygon = [];
      return true;
    }
    const walls = [...this.map.walls, ...this.extraWalls].filter(
      (wall) =>
        wall.x <= origin.x + radius &&
        wall.x + wall.width >= origin.x - radius &&
        wall.y <= origin.y + radius &&
        wall.y + wall.height >= origin.y - radius,
    );
    if (
      walls.some(
        (w) =>
          origin.x >= w.x &&
          origin.x <= w.x + w.width &&
          origin.y >= w.y &&
          origin.y <= w.y + w.height,
      )
    ) {
      this.polygon = [];
      return true;
    }
    const angles = Array.from(
      { length: 96 },
      (_, i) => -Math.PI + (i * 2 * Math.PI) / 96,
    );
    for (const wall of walls)
      for (const x of [wall.x, wall.x + wall.width])
        for (const y of [wall.y, wall.y + wall.height]) {
          const angle = Math.atan2(y - origin.y, x - origin.x);
          angles.push(angle - 0.00001, angle, angle + 0.00001);
        }
    for (let i = 0; i < angles.length; i++)
      angles[i] = Math.atan2(Math.sin(angles[i]!), Math.cos(angles[i]!));
    angles.sort((a, b) => a - b);
    this.polygon = angles.map((angle) => {
      const dx = Math.cos(angle),
        dy = Math.sin(angle);
      let length = radius;
      if (dx > 1e-12)
        length = Math.min(length, (this.map.size.width - origin.x) / dx);
      if (dx < -1e-12) length = Math.min(length, -origin.x / dx);
      if (dy > 1e-12)
        length = Math.min(length, (this.map.size.height - origin.y) / dy);
      if (dy < -1e-12) length = Math.min(length, -origin.y / dy);
      for (const wall of walls)
        length = Math.min(length, rayWall(origin, dx, dy, wall, length));
      return { x: origin.x + dx * length, y: origin.y + dy * length };
    });
    return true;
  }
  canSee(point: Point) {
    return (
      this.polygon.length >= 3 &&
      Math.hypot(point.x - this.origin.x, point.y - this.origin.y) <=
        this.radius &&
      pointInPolygon(point, this.polygon)
    );
  }
}
