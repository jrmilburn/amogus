export interface Point {
  x: number;
  y: number;
}
export interface Rect extends Point {
  width: number;
  height: number;
}
const EPSILON = 1e-7;

export function pointInRect(point: Point, rect: Rect): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

/** Polygon boundaries count as inside. Works with either winding and concave polygons. */
export function pointInPolygon(
  point: Point,
  polygon: readonly Point[],
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j]!;
    const b = polygon[i]!;
    const cross = (point.x - a.x) * (b.y - a.y) - (point.y - a.y) * (b.x - a.x);
    if (
      Math.abs(cross) < EPSILON &&
      point.x >= Math.min(a.x, b.x) &&
      point.x <= Math.max(a.x, b.x) &&
      point.y >= Math.min(a.y, b.y) &&
      point.y <= Math.max(a.y, b.y)
    )
      return true;
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
  }
  return inside;
}
export function polygonArea(polygon: readonly Point[]): number {
  return (
    Math.abs(
      polygon.reduce((sum, p, i) => {
        const q = polygon[(i + 1) % polygon.length]!;
        return sum + p.x * q.y - q.x * p.y;
      }, 0),
    ) / 2
  );
}

export function circleIntersectsRect(
  point: Point,
  radius: number,
  rect: Rect,
): boolean {
  const x = Math.max(rect.x, Math.min(point.x, rect.x + rect.width));
  const y = Math.max(rect.y, Math.min(point.y, rect.y + rect.height));
  return (x - point.x) ** 2 + (y - point.y) ** 2 <= radius ** 2;
}

export interface CollisionMap {
  size: { width: number; height: number };
  walls: readonly Rect[];
}
/** Closed doors will be supplied as additional walls by the simulation in #15. */
export function isWalkable(
  map: CollisionMap,
  point: Point,
  radius = 24,
): boolean {
  return (
    point.x > radius &&
    point.y > radius &&
    point.x < map.size.width - radius &&
    point.y < map.size.height - radius &&
    !map.walls.some((wall) => circleIntersectsRect(point, radius, wall))
  );
}
export function routeLength(points: readonly Point[]): number {
  return points
    .slice(1)
    .reduce(
      (length, point, i) =>
        length + Math.hypot(point.x - points[i]!.x, point.y - points[i]!.y),
      0,
    );
}

/** Orthogonal polygons may touch adjacent edges only at their shared endpoint. */
export function isSimpleOrthogonalPolygon(points: readonly Point[]): boolean {
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!,
      b = points[(i + 1) % points.length]!;
    if ((a.x !== b.x && a.y !== b.y) || (a.x === b.x && a.y === b.y))
      return false;
    for (let j = i + 1; j < points.length; j++) {
      if (j === i + 1 || (i === 0 && j === points.length - 1)) continue;
      const c = points[j]!,
        d = points[(j + 1) % points.length]!;
      // For axis-aligned segments, bounding-box intersection is exact.
      if (
        Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)) <=
          Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) &&
        Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)) <=
          Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y))
      )
        return false;
    }
  }
  return true;
}
