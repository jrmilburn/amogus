import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { MAP_IDS } from '../src/constants.js';
import {
  MapDefSchema,
  isSimpleOrthogonalPolygon,
  TASK_TYPES,
  buildCollisionWalls,
  isWalkable,
  pointInPolygon,
  routeLength,
  type MapDef,
  type Point,
} from '../src/maps/index.js';

const raw: unknown = JSON.parse(
  await readFile(new URL('../maps/the-hollow.json', import.meta.url), 'utf8'),
);
const map = MapDefSchema.parse(raw);

test('The Hollow validates, has reciprocal vents, contained tasks, and three complete long assignments', () => {
  assert.ok(MAP_IDS.includes(map.id as (typeof MAP_IDS)[number]));
  assert.equal(map.rooms.length, 10);
  assert.equal(map.rooms.filter((r) => r.kind === 'hub').length, 2);
  assert.equal(map.rooms.filter((r) => r.kind === 'dead-end').length, 2);
  assert.equal(map.spawnPoints.length, 10);
  assert.equal(
    new Set(map.tasks.map((task) => task.type)).size,
    TASK_TYPES.length,
  );
  for (const vent of map.vents) {
    for (const link of vent.links) {
      assert.ok(
        map.vents.find((target) => target.id === link)?.links.includes(vent.id),
        `${vent.id} → ${link}`,
      );
    }
  }
  for (const task of map.tasks) {
    const room = map.rooms.find((room) => room.id === task.room)!;
    assert.ok(
      pointInPolygon(task, room.polygon),
      `${task.id} is in ${task.room}`,
    );
  }
  const long = map.tasks.filter(
    (task) => task.length === 'long' && task.stage === 1,
  );
  assert.equal(long.length, 3);
  for (const start of long) {
    const finish = map.tasks.find((task) => task.id === start.nextTaskId)!;
    assert.equal(finish.stage, 2);
    assert.notEqual(finish.room, start.room);
    assert.equal(finish.type, start.type);
  }
});

test('collision rectangles match the compact floor plan and its shorter circuit', () => {
  assert.deepEqual(
    map.walls,
    buildCollisionWalls(map),
    'Regenerate walls with pnpm map:walls after changing floors.',
  );
  // User-requested compact pass: 25% shorter than the original 40,800px circuit.
  assert.equal(routeLength(map.reviewCircuit), 30600);
  const seconds = routeLength(map.reviewCircuit) / 200;
  assert.equal(seconds, 153);
  // Sample entire segments, not only their endpoints, with the planned 24px body radius.
  for (let i = 1; i < map.reviewCircuit.length; i++) {
    const a = map.reviewCircuit[i - 1]!,
      b = map.reviewCircuit[i]!;
    const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 16);
    for (let step = 0; step <= steps; step++) {
      const p = {
        x: a.x + ((b.x - a.x) * step) / steps,
        y: a.y + ((b.y - a.y) * step) / steps,
      };
      assert.ok(
        isWalkable(map, p),
        `Circuit hits a wall at ${JSON.stringify(p)}`,
      );
    }
  }
  assert.equal(isWalkable(map, { x: 0, y: 0 }), false);
  assert.equal(
    isWalkable(map, { x: 5400, y: 2925 }),
    false,
    'Central void is solid.',
  );
});

/** Independent coarse flood fill: 80px grid, 24px radius, no diagonal corner cutting. */
function reachable(collision: Pick<MapDef, 'size' | 'walls'>, start: Point) {
  const step = 80,
    columns = Math.ceil(collision.size.width / step),
    rows = Math.ceil(collision.size.height / step);
  const grid = new Uint8Array(columns * rows);
  const visited = new Uint8Array(grid.length);
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < columns; x++) {
      grid[y * columns + x] = Number(
        isWalkable(collision, { x: x * step, y: y * step }),
      );
    }
  const first =
    Math.round(start.y / step) * columns + Math.round(start.x / step);
  assert.equal(grid[first], 1);
  const queue = [first];
  visited[first] = 1;
  for (let head = 0; head < queue.length; head++) {
    const index = queue[head]!,
      x = index % columns,
      y = Math.floor(index / columns);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx!,
        ny = y + dy!;
      if (nx < 0 || nx >= columns || ny < 0 || ny >= rows) continue;
      const next = ny * columns + nx;
      if (
        !visited[next] &&
        grid[next] &&
        isWalkable(collision, {
          x: ((x + nx) * step) / 2,
          y: ((y + ny) * step) / 2,
        })
      ) {
        visited[next] = 1;
        queue.push(next);
      }
    }
  }
  return (point: Point) => {
    const x = Math.round(point.x / step),
      y = Math.round(point.y / step);
    if (!visited[y * columns + x]) return false;
    for (let i = 0; i <= 8; i++) {
      if (
        !isWalkable(collision, {
          x: point.x + ((x * step - point.x) * i) / 8,
          y: point.y + ((y * step - point.y) * i) / 8,
        })
      )
        return false;
    }
    return true;
  };
}

test('all interactables and spawn points are reachable from Commons with doors open', () => {
  const canReach = reachable(map, map.emergencyButton);
  const points = [
    ...map.spawnPoints,
    ...map.tasks,
    ...map.vents,
    ...map.sabotagePoints,
    ...(map.cameras ?? []),
    map.emergencyButton,
  ];
  for (const point of points)
    assert.ok(canReach(point), `Unreachable ${JSON.stringify(point)}`);
});

test('dead-end room doors seal their only walking exit when closed', () => {
  for (const room of map.rooms.filter((room) => room.kind === 'dead-end')) {
    const doors = map.doors.filter((door) => door.room === room.id);
    assert.equal(doors.length, 1);
    const task = map.tasks.find((task) => task.room === room.id)!;
    const canReach = reachable(
      { size: map.size, walls: [...map.walls, ...doors] },
      task,
    );
    assert.equal(
      canReach(map.emergencyButton),
      false,
      `${room.id} has an unintended escape around its door.`,
    );
  }
});

test('bad map edits are rejected with useful paths', () => {
  const cases: [string, (map: MapDef) => void, string][] = [
    [
      'one-way vent',
      (m) => {
        m.vents[0]!.links = [];
      },
      'vents',
    ],
    [
      'unknown vent',
      (m) => {
        m.vents[0]!.links.push('missing');
      },
      'vents',
    ],
    [
      'task outside room',
      (m) => {
        m.tasks[0]!.x = 7000;
      },
      'tasks',
    ],
    [
      'unknown room',
      (m) => {
        m.tasks[0]!.room = 'missing';
      },
      'tasks',
    ],
    [
      'duplicate ID',
      (m) => {
        m.tasks[1]!.id = m.tasks[0]!.id;
      },
      'tasks',
    ],
    [
      'spawn in wall',
      (m) => {
        m.spawnPoints[0] = { x: 100, y: 100 };
      },
      'spawnPoints',
    ],
    [
      'overlapping spawns',
      (m) => {
        m.spawnPoints[0] = { ...m.spawnPoints[1]! };
      },
      'spawnPoints',
    ],
    [
      'wall out of bounds',
      (m) => {
        m.walls[0]!.width = m.size.width + 1;
      },
      'walls',
    ],
    [
      'missing second stage',
      (m) => {
        m.tasks.find((t) => t.nextTaskId)!.nextTaskId = 'missing';
      },
      'tasks',
    ],
    [
      'missing sabotage panel',
      (m) => {
        m.sabotagePoints.pop();
      },
      'sabotagePoints',
    ],
  ];
  for (const [name, mutate, path] of cases) {
    const edited = structuredClone(map);
    mutate(edited);
    const result = MapDefSchema.safeParse(edited);
    assert.equal(result.success, false, name);
    if (!result.success)
      assert.ok(
        result.error.issues.some((issue) => issue.path[0] === path),
        name,
      );
  }
});

test('polygon containment handles edges, winding, and concave notches', () => {
  const polygon = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 4 },
    { x: 4, y: 4 },
    { x: 4, y: 10 },
    { x: 0, y: 10 },
  ];
  for (const points of [polygon, [...polygon].reverse()]) {
    assert.equal(pointInPolygon({ x: 2, y: 8 }, points), true);
    assert.equal(pointInPolygon({ x: 4, y: 8 }, points), true);
    assert.equal(pointInPolygon({ x: 8, y: 8 }, points), false);
    assert.equal(pointInPolygon({ x: -1, y: 0 }, points), false);
  }
});

test('orthogonal polygon validation rejects self-crossings and repeated vertices', () => {
  assert.equal(
    isSimpleOrthogonalPolygon([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]),
    true,
  );
  assert.equal(
    isSimpleOrthogonalPolygon([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 5, y: 10 },
      { x: 5, y: 0 },
      { x: 0, y: 0 },
    ]),
    false,
  );
});
