import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GameState, SabotageState } from '@mutiny/shared';
import { MapDefSchema } from '@mutiny/shared/maps';
import mapData from '@mutiny/shared/maps/the-hollow.json' with { type: 'json' };
import { repairCandidate, secondsLeft } from '../src/sabotage/model.js';

test('repair targeting matches active panels, rejects distance, walls and completed panels', () => {
  const map = MapDefSchema.parse(mapData),
    state = new GameState(),
    point = map.sabotagePoints.find((p) => p.kind === 'o2-a')!;
  assert.equal(repairCandidate(map, state, point), undefined);
  state.sabotage = Object.assign(new SabotageState(), { kind: 'o2' });
  assert.equal(repairCandidate(map, state, point)?.id, point.id);
  assert.equal(
    repairCandidate(map, state, { x: point.x + 81, y: point.y }),
    undefined,
  );
  map.walls.push({ x: point.x + 20, y: point.y - 50, width: 2, height: 100 });
  assert.equal(
    repairCandidate(map, state, { x: point.x + 40, y: point.y }),
    undefined,
  );
  map.walls.pop();
  state.sabotage.fixedPoints.push(point.id);
  assert.equal(repairCandidate(map, state, point), undefined);
  state.sabotage.kind = 'lights';
  assert.equal(repairCandidate(map, state, point), undefined);
});
test('countdowns use authoritative server time, ceil remaining seconds and stop at zero', () => {
  assert.equal(secondsLeft(45000, 0), 45);
  assert.equal(secondsLeft(45000, 44999), 1);
  assert.equal(secondsLeft(45000, 45000), 0);
  assert.equal(secondsLeft(45000, 50000), 0);
});
