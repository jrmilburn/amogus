import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RoundInfo } from '../src/round/RoundInfo.js';
test('reconnected private knowledge restores during meetings/results but never in lobby', () => {
  for (const phase of ['meeting', 'voting', 'ejection', 'ended'] as const) {
    const info = new RoundInfo();
    info.reveal(
      { roundId: 3, role: 'crew', teammates: [], durationMs: 0 },
      phase,
      3,
    );
    info.assign({ roundId: 3, tasks: [], fake: false }, phase, 3);
    assert.equal(info.role, 'crew');
    assert.equal(info.roundId, 3);
    info.reveal(
      { roundId: 2, role: 'impostor', teammates: [], durationMs: 0 },
      phase,
      3,
    );
    assert.equal(info.role, 'crew');
  }
});

test('impostor cooldown tolerates clock skew, persists vent location, and discards stale action events', () => {
  const info = new RoundInfo();
  info.reveal(
    { roundId: 1, role: 'impostor', teammates: [], durationMs: 3000 },
    'starting',
    1,
  );
  const status = {
    roundId: 1,
    killReadyAt: 31000,
    serverNow: 1000,
    ventId: 'commons-vent',
  };
  info.actionStatus(status, 'playing', 1, 500000);
  assert.equal(info.killReadyAt, 530000);
  assert.equal(info.ventId, 'commons-vent');
  info.actionStatus({ ...status, roundId: 0, ventId: null }, 'playing', 1, 0);
  assert.equal(info.ventId, 'commons-vent');
  const kill = { roundId: 1, victimId: 'victim', bodyId: 'body', x: 1, y: 2 };
  info.killed(kill, 'playing', 1);
  assert.equal(info.lastKill?.payload.victimId, 'victim');
  info.clear();
  info.actionStatus(status, 'lobby', 1);
  info.killed(kill, 'lobby', 1);
  assert.equal(info.killReadyAt, Infinity);
  assert.equal(info.ventId, null);
  assert.equal(info.lastKill, undefined);
  info.reveal(
    { roundId: 2, role: 'crew', teammates: [], durationMs: 3000 },
    'playing',
    2,
  );
  info.actionStatus({ ...status, roundId: 2 }, 'playing', 2);
  assert.equal(info.killReadyAt, Infinity);
});

test('private round info rejects stale deliveries, handles either message order, and clears secrets', () => {
  const info = new RoundInfo();
  const payload = {
    roundId: 1,
    role: 'impostor' as const,
    teammates: [{ id: 'peer', name: 'Peer' }],
    durationMs: 3000,
  };
  info.reveal(payload, 'lobby', 1);
  assert.equal(info.role, undefined);
  info.assign({ roundId: 1, tasks: [], fake: true }, 'starting', 1);
  info.reveal(payload, 'starting', 1);
  payload.teammates[0]!.name = 'Changed';
  assert.equal(info.teammates[0]!.name, 'Peer');
  assert.ok(info.teammateIds.has('peer'));
  assert.equal(info.fake, true);
  info.reveal({ ...payload, roundId: 2, role: 'crew' }, 'starting', 2);
  assert.equal(info.fake, false);
  assert.equal(info.teammateIds.size, 0);
  info.reveal(payload, 'playing', 2);
  info.assign({ roundId: 1, tasks: [], fake: true }, 'playing', 2);
  assert.equal(info.role, 'crew');
  assert.equal(info.fake, false);
  info.clear();
  assert.equal(info.role, undefined);
  assert.equal(info.roundId, 0);
  assert.equal(info.tasks.length, 0);
});
