import { pointInPolygon, pointInRect, type Rect } from './geometry.js';
import type { MapDef } from './schema.js';

/** Exact complement of orthogonal floor footprints, merged into collision AABBs.
 * Author rooms/corridors first, then regenerate walls. No raster approximation.
 */
export function buildCollisionWalls(
  map: Pick<MapDef, 'size' | 'rooms' | 'corridors'>,
): Rect[] {
  const xs = new Set([0, map.size.width]);
  const ys = new Set([0, map.size.height]);
  for (const room of map.rooms) {
    room.polygon.forEach((p, i) => {
      const q = room.polygon[(i + 1) % room.polygon.length]!;
      if (p.x !== q.x && p.y !== q.y)
        throw new Error('Wall generation requires orthogonal room polygons.');
      xs.add(p.x);
      ys.add(p.y);
    });
  }
  for (const r of map.corridors) {
    xs.add(r.x);
    xs.add(r.x + r.width);
    ys.add(r.y);
    ys.add(r.y + r.height);
  }
  const x = [...xs].sort((a, b) => a - b);
  const y = [...ys].sort((a, b) => a - b);
  const result: Rect[] = [];
  let previous = new Map<string, Rect>();
  for (let j = 0; j < y.length - 1; j++) {
    const current = new Map<string, Rect>();
    let start: number | undefined;
    for (let i = 0; i < x.length; i++) {
      const center = {
        x: (x[i]! + (x[i + 1] ?? x[i]!)) / 2,
        y: (y[j]! + y[j + 1]!) / 2,
      };
      const solid =
        i < x.length - 1 &&
        !map.rooms.some((room) => pointInPolygon(center, room.polygon)) &&
        !map.corridors.some((corridor) => pointInRect(center, corridor));
      if (solid && start === undefined) start = x[i]!;
      if (!solid && start !== undefined) {
        const width = x[i]! - start;
        const key = `${start}:${width}`;
        const existing = previous.get(key);
        const wall = existing ?? { x: start, y: y[j]!, width, height: 0 };
        wall.height += y[j + 1]! - y[j]!;
        if (!existing) result.push(wall);
        current.set(key, wall);
        start = undefined;
      }
    }
    previous = current;
  }
  return result;
}
