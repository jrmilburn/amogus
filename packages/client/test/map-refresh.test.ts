import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import mapData from '@mutiny/shared/maps/the-hollow.json' with { type: 'json' };
import { MapDefSchema } from '@mutiny/shared/maps';
import {
  ROOM_THEMES,
  roomFixtures,
  roomBounds,
  TASK_ART,
} from '../src/renderer/roomThemes.js';
import { minimapPoint } from '../src/preview/minimap-model.js';
const map = MapDefSchema.parse(mapData);

test('every compact room keeps its purpose-specific artwork clear of interaction and spawn footprints', async () => {
  const atlas = JSON.parse(
    await readFile(
      new URL('../public/assets/station/station.json', import.meta.url),
      'utf8',
    ),
  ) as { frames: Record<string, unknown> };
  for (const room of map.rooms) {
    assert.ok(ROOM_THEMES[room.id]?.purpose);
    const fixtures = roomFixtures(map, room);
    assert.ok(
      fixtures.length >= 1,
      `${room.id} has visible room-specific equipment`,
    );
    const b = roomBounds(room);
    for (const f of fixtures) {
      assert.ok(atlas.frames[f.art], f.art);
      assert.ok(
        f.x - f.width / 2 >= b.x &&
          f.x + f.width / 2 <= b.x + b.width &&
          f.y - f.height / 2 >= b.y &&
          f.y + f.height / 2 <= b.y + b.height,
        `${room.id} fixture stays inside its room`,
      );
      for (const point of [
        ...map.tasks,
        ...map.vents,
        ...map.sabotagePoints,
        ...map.spawnPoints,
        map.emergencyButton,
      ]) {
        assert.ok(
          Math.hypot(
            Math.max(0, Math.abs(point.x - f.x) - f.width / 2),
            Math.max(0, Math.abs(point.y - f.y) - f.height / 2),
          ) >= 90,
        );
      }
    }
  }
  const art = (id: string) =>
    roomFixtures(
      map,
      map.rooms.find((r) => r.id === id)!,
    ).map((f) => f.art);
  assert.ok(art('engine').includes('engine'));
  assert.ok(art('relay').includes('relay'));
  assert.ok(art('stores').includes('suits'));
  assert.ok(art('scrubber').includes('cleaning'));
  assert.equal(art('cryo').filter((a) => a === 'cryopod').length, 3);
  assert.equal(art('archive').filter((a) => a === 'files').length, 3);
  for (const task of map.tasks) assert.ok(atlas.frames[TASK_ART[task.type]!]);
});

test('resized stations and vents have enough separation for their visible instruments', () => {
  const points = [...map.tasks, ...map.vents, ...map.sabotagePoints];
  for (const [i, a] of points.entries())
    for (const b of points.slice(i + 1))
      assert.ok(
        Math.hypot(a.x - b.x, a.y - b.y) >= 155,
        `${a.id} overlaps ${b.id}`,
      );
});

test('minimap projection tracks local world coordinates and clamps to the chart', () => {
  assert.deepEqual(minimapPoint(map, { x: 0, y: 0 }), { x: 8, y: 8 });
  assert.deepEqual(
    minimapPoint(map, { x: map.size.width, y: map.size.height }),
    { x: 232, y: 198 },
  );
  assert.deepEqual(
    minimapPoint(map, { x: map.size.width / 2, y: map.size.height / 2 }),
    { x: 120, y: 103 },
  );
  assert.deepEqual(minimapPoint(map, { x: -10, y: 1e6 }), { x: 8, y: 198 });
});
