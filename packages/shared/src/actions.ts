import type { Point, Rect } from './maps/geometry.js';

export const KILL_RADIUS = 120;
export const VENT_USE_RADIUS = 160;

/** Segment/slab test, including wall edges: actions cannot pass through walls. */
export function clearActionPath(a: Point, b: Point, walls: readonly Rect[]) {
  return !walls.some((wall) => {
    let near = 0;
    let far = 1;
    for (const [start, delta, min, max] of [
      [a.x, b.x - a.x, wall.x, wall.x + wall.width],
      [a.y, b.y - a.y, wall.y, wall.y + wall.height],
    ] as const) {
      if (delta === 0) {
        if (start < min || start > max) return false;
      } else {
        const first = (min - start) / delta;
        const last = (max - start) / delta;
        near = Math.max(near, Math.min(first, last));
        far = Math.min(far, Math.max(first, last));
        if (near > far) return false;
      }
    }
    return true;
  });
}
