import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
  movePlayer,
  validMovementInput,
  PLAYER_RADIUS,
  DEFAULT_SETTINGS,
} from '../src/index.js';
import { MapDefSchema, circleIntersectsRect } from '../src/maps/index.js';

const empty = { size: { width: 1000, height: 1000 }, walls: [] };
test('movement normalizes diagonals, preserves analog magnitude, and clamps map bounds', () => {
  const origin = { x: 100, y: 100 };
  const diagonal = movePlayer(origin, { dx: 1, dy: 1 }, 160, empty);
  assert.ok(
    Math.abs(Math.hypot(diagonal.x - 100, diagonal.y - 100) - 8) < 1e-9,
  );
  assert.equal(movePlayer(origin, { dx: 0.5, dy: 0 }, 160, empty).x, 104);
  assert.equal(
    movePlayer(origin, { dx: -1, dy: 0 }, 100000, empty).x,
    PLAYER_RADIUS,
  );
  assert.equal(
    movePlayer(origin, { dx: 1, dy: 0 }, 100000, empty).x,
    1000 - PLAYER_RADIUS,
  );
  assert.deepEqual(origin, { x: 100, y: 100 });
});

test('sweeps stop at thin walls, slide along them, and cannot cut corners', () => {
  const wall = { x: 200, y: 150, width: 2, height: 500 };
  const map = { ...empty, walls: [wall] };
  assert.deepEqual(
    movePlayer({ x: 100, y: 300 }, { dx: 1, dy: 0 }, 10000, map),
    { x: 176, y: 300 },
  );
  assert.equal(
    movePlayer({ x: 300, y: 300 }, { dx: -1, dy: 0 }, 10000, map).x,
    226,
  );
  const slide = movePlayer({ x: 176, y: 300 }, { dx: 1, dy: 1 }, 160, map);
  assert.equal(slide.x, 176);
  assert.ok(slide.y > 300);
  let point = { x: 180, y: 125 };
  for (let i = 0; i < 100; i++) {
    point = movePlayer(point, { dx: 1, dy: 1 }, 240, map);
    assert.equal(
      circleIntersectsRect(point, PLAYER_RADIUS - 1e-6, wall),
      false,
    );
  }
});

test('movement input rejects malformed, nonfinite, out-of-range, and forged fields', () => {
  for (const value of [
    null,
    {},
    [],
    { seq: 0, dx: 0, dy: 0 },
    { seq: 1.5, dx: 0, dy: 0 },
    { seq: 2 ** 32, dx: 0, dy: 0 },
    { seq: 1, dx: NaN, dy: 0 },
    { seq: 1, dx: 0, dy: Infinity },
    { seq: 1, dx: 2, dy: 0 },
    { seq: 1, dx: 0, dy: 0, x: 900 },
  ])
    assert.equal(validMovementInput(value), false);
  assert.equal(validMovementInput({ seq: 1, dx: -1, dy: 0.2 }), true);
});

test('the actual 24px movement body completes The Hollow outer circuit', async () => {
  const map = MapDefSchema.parse(
    JSON.parse(
      await readFile(
        new URL('../maps/the-hollow.json', import.meta.url),
        'utf8',
      ),
    ),
  );
  let position = { ...map.reviewCircuit[0]! };
  let ticks = 0;
  for (const waypoint of map.reviewCircuit.slice(1)) {
    for (let guard = 0; guard < 3000; guard++) {
      const dx = waypoint.x - position.x,
        dy = waypoint.y - position.y;
      const remaining = Math.hypot(dx, dy);
      if (remaining < 1e-6) break;
      const step = DEFAULT_SETTINGS.playerSpeed / 20;
      const divisor = Math.max(step, remaining);
      position = movePlayer(
        position,
        { dx: dx / divisor, dy: dy / divisor },
        DEFAULT_SETTINGS.playerSpeed,
        map,
      );
      ticks++;
      for (const wall of map.walls)
        assert.equal(
          circleIntersectsRect(position, PLAYER_RADIUS - 1e-6, wall),
          false,
        );
    }
    assert.ok(
      Math.hypot(position.x - waypoint.x, position.y - waypoint.y) < 1e-6,
      'waypoint reached',
    );
  }
  assert.ok(
    Math.abs(ticks / 20 - 153) < 1,
    'the compact map completes the circuit in about 2m33s',
  );
});
