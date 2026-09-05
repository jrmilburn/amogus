import { pointInPolygon, pointInRect, type MapDef } from '@mutiny/shared/maps';
export interface Boundary {
  x: number;
  y: number;
  length: number;
  axis: 'horizontal' | 'vertical';
  outward: -1 | 1;
}
/** Merge exposed floor edges, so overlapping room/corridor footprints have no false walls. */
export function floorBoundaries(map: MapDef): Boundary[] {
  const xs = new Set([0, map.size.width]),
    ys = new Set([0, map.size.height]);
  for (const room of map.rooms)
    for (const point of room.polygon) {
      xs.add(point.x);
      ys.add(point.y);
    }
  for (const r of map.corridors) {
    xs.add(r.x);
    xs.add(r.x + r.width);
    ys.add(r.y);
    ys.add(r.y + r.height);
  }
  const x = [...xs].sort((a, b) => a - b),
    y = [...ys].sort((a, b) => a - b);
  const rows = y.length - 1,
    columns = x.length - 1;
  const floor = Array.from({ length: rows }, (_, j) =>
    Array.from({ length: columns }, (_, i) => {
      const p = { x: (x[i]! + x[i + 1]!) / 2, y: (y[j]! + y[j + 1]!) / 2 };
      return (
        map.rooms.some((r) => pointInPolygon(p, r.polygon)) ||
        map.corridors.some((r) => pointInRect(p, r))
      );
    }),
  );
  const edges: Boundary[] = [];
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < columns; i++) {
      if (!floor[j]![i]) continue;
      if (!floor[j - 1]?.[i])
        edges.push({
          x: x[i]!,
          y: y[j]!,
          length: x[i + 1]! - x[i]!,
          axis: 'horizontal',
          outward: -1,
        });
      if (!floor[j + 1]?.[i])
        edges.push({
          x: x[i]!,
          y: y[j + 1]!,
          length: x[i + 1]! - x[i]!,
          axis: 'horizontal',
          outward: 1,
        });
      if (!floor[j]?.[i - 1])
        edges.push({
          x: x[i]!,
          y: y[j]!,
          length: y[j + 1]! - y[j]!,
          axis: 'vertical',
          outward: -1,
        });
      if (!floor[j]?.[i + 1])
        edges.push({
          x: x[i + 1]!,
          y: y[j]!,
          length: y[j + 1]! - y[j]!,
          axis: 'vertical',
          outward: 1,
        });
    }
  const groups = new Map<string, Boundary[]>();
  for (const edge of edges) {
    const key = `${edge.axis}:${edge.outward}:${edge.axis === 'horizontal' ? edge.y : edge.x}`;
    const group = groups.get(key) ?? [];
    group.push(edge);
    groups.set(key, group);
  }
  const result: Boundary[] = [];
  for (const group of groups.values()) {
    const axis = group[0]!.axis === 'horizontal' ? 'x' : 'y';
    group.sort((a, b) => a[axis] - b[axis]);
    let last: Boundary | undefined;
    for (const edge of group) {
      if (last && last[axis] + last.length === edge[axis])
        last.length += edge.length;
      else {
        last = { ...edge };
        result.push(last);
      }
    }
  }
  return result;
}
