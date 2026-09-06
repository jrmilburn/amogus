import assert from 'node:assert/strict';
import test from 'node:test';
import { BOARDING_MAP, movePlayer, PLAYER_RADIUS } from '../src/index.js';
import { isWalkable } from '../src/maps/geometry.js';

test('boarding has ten separate walkable spawns and no gameplay interactables', () => {
  assert.equal(BOARDING_MAP.spawnPoints.length, 10);
  assert.equal(
    new Set(BOARDING_MAP.spawnPoints.map((p) => `${p.x}:${p.y}`)).size,
    10,
  );
  for (const spawn of BOARDING_MAP.spawnPoints)
    assert.ok(isWalkable(BOARDING_MAP, spawn));
  for (const field of ['tasks', 'vents', 'doors', 'sabotagePoints'] as const)
    assert.equal(BOARDING_MAP[field].length, 0);
});

test('boarding walls contain all four directions at the 800px/s maximum', () => {
  for (const input of [
    { dx: 1, dy: 0 },
    { dx: -1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: 0, dy: -1 },
  ]) {
    let position = { ...BOARDING_MAP.spawnPoints[0]! };
    for (let tick = 0; tick < 100; tick++)
      position = movePlayer(position, input, 800, BOARDING_MAP);
    assert.ok(
      position.x >= 120 + PLAYER_RADIUS && position.x <= 1800 - PLAYER_RADIUS,
    );
    assert.ok(
      position.y >= 120 + PLAYER_RADIUS && position.y <= 960 - PLAYER_RADIUS,
    );
  }
});
