import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  Body,
  GameState,
  Player,
  SabotageState,
  emergencyUnavailable,
  nearestBody,
} from '@mutiny/shared';
import { MapDefSchema } from '@mutiny/shared/maps';
import data from '@mutiny/shared/maps/the-hollow.json' with { type: 'json' };
import { MeetingSystem } from '../src/meetings.js';
function fixture() {
  const map = MapDefSchema.parse(data),
    state = new GameState();
  state.phase = 'playing';
  state.roundId = 1;
  const players = Array.from({ length: 4 }, (_, i) =>
    Object.assign(new Player(), {
      id: String(i),
      name: `Caller ${i}`,
      color: 'coral',
      ...map.spawnPoints[i],
    }),
  );
  players.forEach((p) => state.players.set(p.id, p));
  const busy = new Set<string>(),
    meetings = new MeetingSystem(state, map, (id) => busy.has(id));
  meetings.beginPlaying(0);
  const body = Object.assign(new Body(), {
    id: 'body',
    victimId: players[3]!.id,
    color: 'mint',
    ...map.emergencyButton,
  });
  state.bodies.set(body.id, body);
  players[3]!.alive = false;
  const own = players[0]!;
  Object.assign(own, map.emergencyButton);
  return { state, map, players, own, body, meetings, busy };
}
test('report validates strict payload, phase, round, life, vent, range, wall and single transition', () => {
  const f = fixture(),
    request = { bodyId: 'body', roundId: 1 };
  for (const payload of [
    null,
    {},
    { ...request, roundId: 0 },
    { ...request, callerId: '2' },
    { ...request, bodyId: 'missing' },
  ])
    assert.throws(() => f.meetings.report(f.own.id, payload, 1));
  for (const change of [
    { alive: false },
    { connected: false },
    { inVent: true },
  ]) {
    Object.assign(f.own, change);
    assert.throws(() => f.meetings.report(f.own.id, request, 1));
    Object.assign(f.own, { alive: true, connected: true, inVent: false });
  }
  f.busy.add(f.own.id);
  assert.throws(() => f.meetings.report(f.own.id, request, 1));
  f.busy.clear();
  f.own.x += 101;
  assert.throws(() => f.meetings.report(f.own.id, request, 1));
  f.own.x -= 61;
  f.map.walls.push({ x: f.own.x - 20, y: f.own.y - 50, width: 2, height: 100 });
  assert.throws(() => f.meetings.report(f.own.id, request, 1));
  f.map.walls.pop();
  f.state.phase = 'starting';
  assert.throws(() => f.meetings.report(f.own.id, request, 1));
  f.state.phase = 'playing';
  f.players[1]!.inVent = true;
  f.players.forEach((p) => (p.walking = true));
  const result = f.meetings.report(f.own.id, request, 1);
  assert.equal(result.reason, 'report');
  assert.equal(result.bodyColor, 'mint');
  assert.equal(result.location, 'Commons');
  assert.equal(result.roundId, 1);
  assert.equal(f.state.bodies.size, 0);
  assert.equal(f.state.phase, 'meeting');
  assert.equal(f.state.meeting!.callerName, f.own.name);
  f.players.forEach((p, i) => {
    assert.equal(p.x, f.map.spawnPoints[i]!.x);
    assert.equal(p.y, f.map.spawnPoints[i]!.y);
    assert.equal(p.inVent, false);
    assert.equal(p.walking, false);
  });
  assert.equal(f.players[3]!.alive, false);
  assert.equal(f.own.emergenciesUsed, 0);
  assert.throws(() => f.meetings.report(f.own.id, request, 2));
  f.state.players.delete(f.own.id);
  assert.equal(f.state.meeting!.callerName, 'Caller 0');
});
test('emergency enforces per-player allowance, 15-second start/resume cooldown and proximity', () => {
  const f = fixture(),
    request = { roundId: 1 };
  assert.throws(() => f.meetings.emergency(f.own.id, {}, 15000));
  assert.throws(() =>
    f.meetings.emergency(f.own.id, { ...request, callerId: '2' }, 15000),
  );
  assert.throws(() => f.meetings.emergency(f.own.id, request, 14999));
  f.own.x += 81;
  assert.throws(() => f.meetings.emergency(f.own.id, request, 15000));
  f.own.x -= 81;
  const result = f.meetings.emergency(f.own.id, request, 15000);
  assert.equal(result.reason, 'emergency');
  assert.equal(result.bodyColor, undefined);
  assert.equal(f.own.emergenciesUsed, 1);
  f.state.phase = 'playing';
  f.meetings.beginPlaying(20000);
  Object.assign(f.own, f.map.emergencyButton);
  assert.throws(() => f.meetings.emergency(f.own.id, request, 35000));
  const other = f.players[1]!;
  Object.assign(other, f.map.emergencyButton);
  assert.throws(() => f.meetings.emergency(other.id, request, 34999));
  f.meetings.emergency(other.id, request, 35000);
  assert.equal(other.emergenciesUsed, 1);
  f.meetings.clear();
  assert.equal(f.state.meeting, undefined);
  assert.equal(f.own.emergenciesUsed, 0);
  assert.equal(f.state.emergencyReadyAt, 0);
});
test('crises block emergencies but allow reports before, never at or after, their failure deadline', () => {
  for (const kind of ['reactor', 'o2'] as const) {
    const f = fixture();
    f.state.sabotage = Object.assign(new SabotageState(), {
      kind,
      endsAt: 45000,
    });
    assert.throws(() => f.meetings.emergency(f.own.id, { roundId: 1 }, 15000));
    assert.equal(f.own.emergenciesUsed, 0);
    assert.throws(() =>
      f.meetings.report(f.own.id, { bodyId: 'body', roundId: 1 }, 45000),
    );
    assert.equal(f.state.phase, 'playing');
    f.meetings.report(f.own.id, { bodyId: 'body', roundId: 1 }, 44999);
    assert.equal(f.state.phase, 'meeting');
  }
});
test('shared targeting chooses nearest clear body and explains emergency cooldown and allowance', () => {
  const f = fixture();
  assert.equal(nearestBody(f.map, f.state, f.own)?.id, 'body');
  assert.match(emergencyUnavailable(f.map, f.state, f.own, 0)!, /15s/);
  f.state.settings.emergencyMeetings = 0;
  assert.match(
    emergencyUnavailable(f.map, f.state, f.own, 15000)!,
    /No emergency/,
  );
  f.own.x += 101;
  assert.equal(nearestBody(f.map, f.state, f.own), undefined);
});
