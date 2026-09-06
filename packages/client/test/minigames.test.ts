import assert from 'node:assert/strict';
import { test } from 'node:test';
import { taskDurationMs } from '@mutiny/shared';
import {
  MatchBoard,
  GyroCalibration,
  ActiveClock,
  TransferProgress,
} from '../src/tasks/minigames/models.js';

test('archive transfer waits for Start and a full eight seconds; a new attempt resets it', () => {
  const transfer = new TransferProgress();
  assert.equal(transfer.progress(9000), 0);
  assert.equal(transfer.start(9000), true);
  assert.equal(transfer.start(10000), false);
  assert.equal(transfer.progress(16999), 7999);
  assert.equal(transfer.progress(17000), 8000);
  assert.equal(transfer.progress(20000), 8000);
  assert.equal(new TransferProgress().progress(20000), 0);
});

test('matching accepts labels only once, refuses mismatches and needs every cable or specimen', () => {
  for (const labels of [
    ['A1', 'B2', 'C3', 'D4'],
    ['ION', 'MOSS', 'SALT', 'IRON', 'ICE', 'SPORE'],
  ]) {
    const board = new MatchBoard(labels);
    assert.equal(board.connect(labels[0]!, labels[1]!), false);
    assert.equal(board.connect('forged', 'forged'), false);
    assert.equal(board.complete, false);
    for (const label of [...labels].reverse()) {
      assert.equal(board.connect(label, label), true);
      assert.equal(board.connect(label, label), false);
    }
    assert.equal(board.complete, true);
  }
});
test('gyro needs three separate centre crossings and cannot be click-spammed', () => {
  for (const sweep of [2400, 3600]) {
    const gyro = new GyroCalibration(sweep);
    assert.equal(gyro.tap(0), false);
    assert.equal(gyro.position(sweep), 1);
    assert.equal(gyro.position(sweep * 2), 0);
    for (let pass = 0; pass < 3; pass++) {
      const centre = sweep * (pass + 0.5);
      assert.equal(gyro.inBand(centre), true);
      assert.equal(gyro.tap(centre), true);
      assert.equal(gyro.tap(centre + 1), false);
    }
    assert.equal(gyro.hits, 3);
    assert.equal(gyro.tap(sweep * 3.5), false);
  }
});
test('active time pauses across hidden windows, caps stalls and minimum durations are shared', () => {
  const clock = new ActiveClock();
  assert.equal(clock.tick(100, true), 0);
  assert.equal(clock.tick(150, true), 50);
  assert.equal(clock.tick(200, false), 50);
  assert.equal(clock.tick(10000, false), 50);
  assert.equal(clock.tick(20000, true), 50);
  assert.equal(clock.tick(20050, true), 100);
  assert.equal(clock.tick(30000, true), 200);
  assert.equal(taskDurationMs('data-transfer'), 8000);
  for (const type of ['reroute-power', 'calibrate-gyro', 'sort-samples'])
    assert.equal(taskDurationMs(type), 5000);
  for (const type of [
    'fuel-engines',
    'clear-vents',
    'enter-access-code',
    'scan-id',
  ])
    assert.equal(taskDurationMs(type), 5000);
});
