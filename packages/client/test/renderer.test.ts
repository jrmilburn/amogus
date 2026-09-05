import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { MapDefSchema, pointInPolygon, pointInRect } from '@mutiny/shared/maps';
import {
  Camera,
  WORLD_VIEW,
  letterbox,
  overlaps,
} from '../src/renderer/Camera';
import { floorBoundaries } from '../src/renderer/boundaries';
const map = MapDefSchema.parse(
  JSON.parse(
    await readFile(
      new URL('../../shared/maps/the-hollow.json', import.meta.url),
      'utf8',
    ),
  ),
);

test('camera clamps all map edges, follows live targets, and converges without overshooting', () => {
  const camera = new Camera(map.size),
    target = { x: 4800, y: 6200 };
  camera.follow(target, true);
  assert.equal(camera.x, 4800);
  assert.equal(camera.y, 6200);
  target.x = 7000;
  camera.update(1 / 60);
  assert.ok(camera.x > 4800 && camera.x < 7000);
  for (let i = 0; i < 180; i++) camera.update(1 / 60);
  assert.ok(Math.abs(camera.x - 7000) < 0.01);
  target.x = -10000;
  target.y = -10000;
  camera.update(1, true);
  assert.equal(camera.x, WORLD_VIEW.width / 2);
  assert.equal(camera.y, WORLD_VIEW.height / 2);
  target.x = 100000;
  target.y = 100000;
  camera.update(1, true);
  assert.equal(camera.x, map.size.width - WORLD_VIEW.width / 2);
  assert.equal(camera.y, map.size.height - WORLD_VIEW.height / 2);
  const small = new Camera({ width: 400, height: 300 });
  small.follow({ x: 9999, y: 9999 }, true);
  assert.equal(small.x, 200);
  assert.equal(small.y, 150);
});

test('letterboxing preserves world scale and screen-to-world mapping across device shapes', () => {
  const camera = new Camera(map.size);
  camera.follow(map.emergencyButton, true);
  for (const screen of [
    { width: 1440, height: 900 },
    { width: 844, height: 390 },
    { width: 360, height: 740 },
  ]) {
    const box = letterbox(screen);
    assert.ok(box.width <= screen.width && box.height <= screen.height);
    assert.ok(Math.abs(box.width / box.scale - WORLD_VIEW.width) < 1e-9);
    assert.ok(Math.abs(box.height / box.scale - WORLD_VIEW.height) < 1e-9);
    assert.deepEqual(
      camera.screenToWorld(
        { x: screen.width / 2, y: screen.height / 2 },
        screen,
      ),
      map.emergencyButton,
    );
    const origin = camera.screenToWorld({ x: box.x, y: box.y }, screen);
    assert.equal(origin.x, camera.bounds().x);
    assert.equal(origin.y, camera.bounds().y);
  }
  assert.equal(
    overlaps(
      { x: 0, y: 0, width: 20, height: 20 },
      { x: 20, y: 10, width: 20, height: 20 },
    ),
    true,
  );
  assert.equal(
    overlaps(
      { x: 0, y: 0, width: 20, height: 20 },
      { x: 21, y: 10, width: 20, height: 20 },
    ),
    false,
  );
});

test('rendered wall faces only border actual walkable floor, including room/corridor joins', () => {
  const edges = floorBoundaries(map);
  assert.ok(edges.length > 0);
  const onFloor = (p: { x: number; y: number }) =>
    map.rooms.some((room) => pointInPolygon(p, room.polygon)) ||
    map.corridors.some((corridor) => pointInRect(p, corridor));
  for (const edge of edges) {
    const horizontal = edge.axis === 'horizontal';
    for (let distance = 4; distance < edge.length; distance += 40) {
      const center = {
        x: edge.x + (horizontal ? distance : 0),
        y: edge.y + (horizontal ? 0 : distance),
      };
      const inward = {
        x: center.x - (horizontal ? 0 : edge.outward * 2),
        y: center.y - (horizontal ? edge.outward * 2 : 0),
      };
      const outward = {
        x: center.x + (horizontal ? 0 : edge.outward * 2),
        y: center.y + (horizontal ? edge.outward * 2 : 0),
      };
      assert.equal(onFloor(inward), true, JSON.stringify(edge));
      assert.equal(onFloor(outward), false, JSON.stringify(edge));
    }
  }
});
