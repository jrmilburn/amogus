import { z } from 'zod';
import { MAX_PLAYERS } from '../constants.js';
import {
  isSimpleOrthogonalPolygon,
  isWalkable,
  pointInPolygon,
  polygonArea,
} from './geometry.js';

const id = z.string().regex(/^[a-z][a-z0-9-]*$/);
const coordinate = z.number().finite().nonnegative();
const point = z.strictObject({ x: coordinate, y: coordinate });
const rect = point.extend({
  width: z.number().positive(),
  height: z.number().positive(),
});
const polygon = z
  .array(point)
  .min(3)
  .refine((points) => polygonArea(points) > 0, 'Polygon must enclose an area.');
export const TASK_TYPES = [
  'reroute-power',
  'calibrate-gyro',
  'data-transfer',
  'sort-samples',
  'fuel-engines',
  'clear-vents',
  'enter-access-code',
  'scan-id',
] as const;
export type TaskType = (typeof TASK_TYPES)[number];
export const SABOTAGE_POINT_KINDS = [
  'lights',
  'reactor-a',
  'reactor-b',
  'o2-a',
  'o2-b',
  'comms',
] as const;

export const MapStructureSchema = z.strictObject({
  id,
  name: z.string().min(1),
  version: z.literal(1),
  size: z.strictObject({
    width: z.number().positive(),
    height: z.number().positive(),
  }),
  spawnPoints: z.array(point).min(MAX_PLAYERS),
  walls: z.array(rect).min(1),
  rooms: z
    .array(
      z.strictObject({
        id,
        name: z.string().min(1),
        polygon,
        kind: z.enum(['ring', 'hub', 'dead-end']),
      }),
    )
    .min(1),
  // Explicit walkable corridor footprints allow floor rendering without guessing from walls.
  corridors: z.array(rect.extend({ id })).min(1),
  tasks: z
    .array(
      point.extend({
        id,
        type: z.enum(TASK_TYPES),
        room: id,
        length: z.enum(['short', 'long']),
        stage: z.union([z.literal(1), z.literal(2)]),
        nextTaskId: id.optional(),
      }),
    )
    .min(1),
  vents: z.array(point.extend({ id, room: id, links: z.array(id).min(1) })),
  doors: z.array(rect.extend({ id, room: id })),
  sabotagePoints: z.array(
    point.extend({ id, room: id, kind: z.enum(SABOTAGE_POINT_KINDS) }),
  ),
  emergencyButton: point,
  cameras: z
    .array(
      point.extend({
        id,
        room: id,
        facing: z.number().min(-Math.PI).max(Math.PI),
      }),
    )
    .optional(),
  // A measured review route, not navigation or pathfinding data for gameplay.
  reviewCircuit: z.array(point).min(4),
});
export type MapDef = z.infer<typeof MapStructureSchema>;

export const MapDefSchema = MapStructureSchema.superRefine((map, context) => {
  const issue = (path: (string | number)[], message: string) =>
    context.addIssue({ code: 'custom', path, message });
  for (const key of [
    'rooms',
    'corridors',
    'tasks',
    'vents',
    'doors',
    'sabotagePoints',
    'cameras',
  ] as const) {
    const seen = new Set<string>();
    (map[key] ?? []).forEach((entry, index) => {
      if (seen.has(entry.id))
        issue([key, index, 'id'], 'IDs must be unique within each collection.');
      seen.add(entry.id);
    });
  }
  const inBounds = (p: { x: number; y: number }) =>
    p.x <= map.size.width && p.y <= map.size.height;
  for (const key of ['walls', 'corridors', 'doors'] as const) {
    map[key].forEach((r, i) => {
      if (!inBounds({ x: r.x + r.width, y: r.y + r.height }))
        issue([key, i], 'Rectangle exceeds map bounds.');
    });
  }
  map.rooms.forEach((room, i) => {
    if (room.polygon.some((p) => !inBounds(p)))
      issue(['rooms', i, 'polygon'], 'Room exceeds map bounds.');
    // Current collision tooling intentionally supports simple orthogonal polygons.
    if (!isSimpleOrthogonalPolygon(room.polygon))
      issue(
        ['rooms', i, 'polygon'],
        'Room polygon must be simple and orthogonal.',
      );
    room.polygon.forEach((a, j) => {
      const b = room.polygon[(j + 1) % room.polygon.length]!;
      if ((a.x !== b.x && a.y !== b.y) || (a.x === b.x && a.y === b.y))
        issue(
          ['rooms', i, 'polygon', j],
          'Room edges must be nonzero and axis-aligned.',
        );
    });
  });
  for (const key of ['tasks', 'vents', 'sabotagePoints', 'cameras'] as const) {
    (map[key] ?? []).forEach((entry, i) => {
      const room = map.rooms.find((r) => r.id === entry.room);
      if (!room || !pointInPolygon(entry, room.polygon))
        issue([key, i, 'room'], 'Point must be inside its referenced room.');
      if (!isWalkable(map, entry))
        issue([key, i], 'Point needs 24px of collision clearance.');
    });
  }
  map.doors.forEach((door, i) => {
    const room = map.rooms.find((r) => r.id === door.room);
    const center = { x: door.x + door.width / 2, y: door.y + door.height / 2 };
    if (!room || !pointInPolygon(center, room.polygon))
      issue(
        ['doors', i, 'room'],
        'Door center must lie on or inside its room.',
      );
    if (!isWalkable(map, center))
      issue(['doors', i], 'Open door is blocked by a static wall.');
  });
  for (const [i, spawn] of map.spawnPoints.entries()) {
    if (!isWalkable(map, spawn))
      issue(['spawnPoints', i], 'Spawn needs 24px of collision clearance.');
    if (
      map.spawnPoints
        .slice(0, i)
        .some((other) => Math.hypot(other.x - spawn.x, other.y - spawn.y) < 48)
    )
      issue(['spawnPoints', i], 'Spawn circles overlap.');
  }
  if (!isWalkable(map, map.emergencyButton))
    issue(['emergencyButton'], 'Emergency button must be walkable.');
  const first = map.reviewCircuit[0]!;
  const last = map.reviewCircuit.at(-1)!;
  if (first.x !== last.x || first.y !== last.y)
    issue(['reviewCircuit'], 'Review circuit must be closed.');
  map.reviewCircuit.forEach((p, i) => {
    if (!isWalkable(map, p))
      issue(['reviewCircuit', i], 'Circuit point must be walkable.');
  });
  map.vents.forEach((vent, i) => {
    if (new Set(vent.links).size !== vent.links.length)
      issue(['vents', i, 'links'], 'Duplicate vent links.');
    for (const link of vent.links) {
      const target = map.vents.find((v) => v.id === link);
      if (link === vent.id || !target?.links.includes(vent.id))
        issue(
          ['vents', i, 'links'],
          'Vent links must exist, be reciprocal, and not self-link.',
        );
    }
  });
  map.tasks.forEach((task, i) => {
    const isLong =
      task.type === 'data-transfer' || task.type === 'fuel-engines';
    if ((task.length === 'long') !== isLong)
      issue(
        ['tasks', i, 'length'],
        'Task length must match its minigame type.',
      );
    if (task.length === 'short' && (task.stage !== 1 || task.nextTaskId))
      issue(['tasks', i], 'Short tasks have one stage.');
    if (isLong && task.stage === 1) {
      const next = map.tasks.find((t) => t.id === task.nextTaskId);
      if (
        !next ||
        next.stage !== 2 ||
        next.type !== task.type ||
        next.room === task.room
      )
        issue(
          ['tasks', i, 'nextTaskId'],
          'Long tasks need a matching second stage in another room.',
        );
    }
    if (isLong && task.stage === 2) {
      if (
        task.nextTaskId ||
        map.tasks.filter((t) => t.nextTaskId === task.id).length !== 1
      )
        issue(
          ['tasks', i],
          'Second stages must have exactly one predecessor and no next stage.',
        );
    }
  });
  for (const kind of SABOTAGE_POINT_KINDS) {
    if (map.sabotagePoints.filter((point) => point.kind === kind).length !== 1)
      issue(['sabotagePoints'], `Expected exactly one ${kind} panel.`);
  }
});
