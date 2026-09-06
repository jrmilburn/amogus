import assert from 'node:assert/strict';
import { test } from 'node:test';
import { movePlayer, MOVEMENT_STEP } from '@mutiny/shared';
import { Prediction, Interpolation } from '../src/movement/prediction';

const map = {
  size: { width: 2000, height: 2000 },
  walls: [{ x: 600, y: 0, width: 10, height: 1200 }],
};
test('100ms RTT reconciliation matches authority without backwards corrections, including wall contact', () => {
  const predictor = new Prediction({ x: 100, y: 300 }, map);
  let server = { x: 100, y: 300 };
  const snapshots: { x: number; y: number; seq: number }[] = [];
  for (let tick = 1; tick <= 160; tick++) {
    const input = {
      seq: tick,
      dx: tick <= 100 ? 1 : -1,
      dy: tick < 120 ? 0 : 0.5,
    };
    predictor.push(input, 160);
    server = movePlayer(server, input, 160, map);
    snapshots.push({ ...server, seq: tick });
    // Two 50ms steps cover 100ms round-trip latency.
    if (tick > 2) {
      const acknowledgement = snapshots[tick - 3]!;
      const before = { ...predictor.position };
      predictor.reconcile(acknowledgement, acknowledgement.seq, 160);
      assert.deepEqual(predictor.position, before);
    }
  }
  predictor.reconcile(server, 160, 160);
  assert.deepEqual(predictor.position, server);
  assert.equal(predictor.pending.length, 0);
  assert.equal(MOVEMENT_STEP, 0.05);
});

test('reconciliation corrects rejected inputs and phase changes; pending work is bounded', () => {
  const predictor = new Prediction({ x: 100, y: 300 }, map);
  for (let seq = 1; seq <= 50; seq++)
    predictor.push({ seq, dx: 1, dy: 0 }, 160);
  assert.equal(predictor.pending.length, 40);
  predictor.reconcile({ x: 108, y: 300 }, 39, 160);
  assert.equal(predictor.position.x, 116);
  predictor.reconcile({ x: 108, y: 300 }, 40, 160, false);
  assert.deepEqual(predictor.position, { x: 108, y: 300 });
  assert.equal(predictor.pending.length, 0);
});

test('remote interpolation uses 100ms buffer, holds stale snapshots, and snaps teleports', () => {
  const history = new Interpolation();
  history.push({ x: 100, y: 100, facing: 1, walking: true, time: 0 });
  history.push({ x: 108, y: 100, facing: 1, walking: true, time: 50 });
  assert.equal(history.sample(125)?.x, 104);
  assert.equal(history.sample(500)?.x, 108);
  history.push({ x: 1000, y: 100, facing: -1, walking: false, time: 100 });
  assert.equal(history.sample(175)?.x, 1000);
});
