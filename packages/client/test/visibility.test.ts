import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_SETTINGS } from '@mutiny/shared';
import { MapDefSchema } from '@mutiny/shared/maps';
import mapData from '@mutiny/shared/maps/the-hollow.json' with { type: 'json' };
import {
  BASE_VISION_RADIUS,
  VisibilityField,
  rayWall,
  visionRadius,
} from '../src/renderer/visibility.js';

test('doorways expose the corridor but not rooms around a solid corner', () => {
  const field = new VisibilityField({
    size: { width: 1000, height: 1000 },
    walls: [
      { x: 400, y: 0, width: 40, height: 450 },
      { x: 400, y: 550, width: 40, height: 450 },
    ],
  });
  field.update({ x: 300, y: 500 }, 650);
  assert.equal(field.canSee({ x: 700, y: 500 }), true);
  assert.equal(field.canSee({ x: 650, y: 200 }), false);
  assert.equal(field.canSee({ x: 650, y: 800 }), false);
  assert.equal(field.canSee({ x: 100, y: 500 }), true);
  assert.equal(field.canSee({ x: 980, y: 500 }), false);
  field.setClosedDoors([{ x: 400, y: 450, width: 40, height: 100 }]);
  assert.equal(field.update({ x: 300, y: 500 }, 650), true);
  assert.equal(field.canSee({ x: 700, y: 500 }), false);
  field.setClosedDoors([]);
  field.update({ x: 300, y: 500 }, 650);
  assert.equal(field.canSee({ x: 700, y: 500 }), true);
});
test('vision handles axis rays, world edges, corner seams, zero range and invalid positions', () => {
  const wall = { x: 400, y: 200, width: 100, height: 600 };
  assert.equal(rayWall({ x: 300, y: 500 }, 1, 0, wall, 650), 100);
  assert.equal(rayWall({ x: 300, y: 500 }, 0, 1, wall, 650), 650);
  assert.equal(rayWall({ x: 600, y: 500 }, -1, 0, wall, 650), 100);
  const field = new VisibilityField({
    size: { width: 1000, height: 1000 },
    walls: [wall],
  });
  field.update({ x: 600, y: 500 }, 800);
  assert.equal(
    field.canSee({ x: 300, y: 500 }),
    false,
    'negative-pi corner wrap cannot leak',
  );
  assert.equal(field.canSee({ x: 700, y: 500 }), true);
  assert.equal(field.canSee({ x: 1001, y: 500 }), false);
  assert.equal(
    field.update({ x: 600, y: 500 }, 800),
    false,
    'stationary mask reused',
  );
  field.update({ x: 600, y: 500 }, 0);
  assert.equal(field.canSee({ x: 600, y: 500 }), false);
  field.update({ x: 450, y: 500 }, 800);
  assert.equal(field.polygon.length, 0, 'inside wall fails closed');
  field.update({ x: NaN, y: 500 }, 800);
  assert.equal(field.polygon.length, 0);
});
test('role vision derives only from private knowledge and the selected setting', () => {
  assert.equal(visionRadius('crew', DEFAULT_SETTINGS), BASE_VISION_RADIUS);
  assert.equal(
    visionRadius('impostor', DEFAULT_SETTINGS),
    BASE_VISION_RADIUS * 1.5,
  );
  assert.equal(visionRadius(undefined, DEFAULT_SETTINGS), BASE_VISION_RADIUS);
  assert.equal(
    visionRadius('crew', { crewVision: 0.5, impostorVision: 2 }),
    BASE_VISION_RADIUS / 2,
  );
});
test('The Hollow visibility CPU benchmark includes moving views and ten entity queries', (context) => {
  const map = MapDefSchema.parse(mapData),
    field = new VisibilityField(map);
  const timings: number[] = [];
  for (let i = 0; i < 1200; i++) {
    const a = map.reviewCircuit[i % (map.reviewCircuit.length - 1)]!;
    const b = map.reviewCircuit[(i % (map.reviewCircuit.length - 1)) + 1]!;
    const amount = (i % 101) / 101;
    const origin = {
      x: a.x + (b.x - a.x) * amount,
      y: a.y + (b.y - a.y) * amount,
    };
    const start = performance.now();
    field.update(origin, [162.5, 650, 975, 3250][i % 4]!);
    for (const point of map.spawnPoints) field.canSee(point);
    if (i > 100) timings.push(performance.now() - start);
    assert.ok(field.polygon.length >= 96);
    assert.equal(field.canSee(origin), true);
  }
  timings.sort((a, b) => a - b);
  context.diagnostic(
    `Visibility CPU only: p50 ${timings[Math.floor(timings.length * 0.5)]!.toFixed(3)}ms, p95 ${timings[Math.floor(timings.length * 0.95)]!.toFixed(3)}ms; excludes render texture/filter/GPU.`,
  );
});
