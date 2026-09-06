import type { MapDef, Point } from '@mutiny/shared/maps';

/** Static public map geometry and one local point only; deliberately no room/player state. */
export function minimapPoint(map: Pick<MapDef, 'size'>, point: Point) {
  return {
    x:
      8 +
      (Math.max(0, Math.min(map.size.width, point.x)) / map.size.width) * 224,
    y:
      8 +
      (Math.max(0, Math.min(map.size.height, point.y)) / map.size.height) * 190,
  };
}
