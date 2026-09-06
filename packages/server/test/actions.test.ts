import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  GameState,
  Player,
  DEFAULT_SETTINGS,
  taskStation,
  clearActionPath,
  KILL_RADIUS,
  VENT_USE_RADIUS,
} from '@mutiny/shared';
import { MapDefSchema } from '@mutiny/shared/maps';
import mapData from '@mutiny/shared/maps/the-hollow.json' with { type: 'json' };
import { RoundAssignments } from '../src/round.js';
import { TaskSessions } from '../src/tasks.js';
import { ImpostorActions } from '../src/actions.js';

function fixture() {
  const map = MapDefSchema.parse(mapData);
  const state = new GameState();
  const players = Array.from({ length: 7 }, (_, i) =>
    Object.assign(new Player(), {
      id: String(i),
      name: `Player ${i}`,
      ...map.spawnPoints[0],
    }),
  );
  players.forEach((p) => state.players.set(p.id, p));
  const round = new RoundAssignments(map);
  round.start(players, { ...DEFAULT_SETTINGS, impostors: 2 });
  round.beginPlaying(1000, 30);
  state.phase = 'playing';
  state.roundId = 1;
  const tasks = new TaskSessions(state, map, round);
  const actions = new ImpostorActions(state, map, round, tasks);
  const imps = players.filter(
    (p) => round.players.get(p.id)!.role === 'impostor',
  );
  const crew = players.filter((p) => round.players.get(p.id)!.role === 'crew');
  return {
    state,
    map,
    round,
    tasks,
    actions,
    imp: imps[0]!,
    mate: imps[1]!,
    victim: crew[0]!,
    next: crew[1]!,
  };
}

test('kill validates role, phase, life, round, cooldown, distance and walls before creating one body', () => {
  const { state, map, actions, imp, mate, victim, next, round } = fixture();
  const request = { targetId: victim.id, roundId: 1 };
  for (const malformed of [
    null,
    {},
    { ...request, actorId: imp.id },
    { ...request, roundId: 0 },
    { ...request, targetId: 42 },
  ])
    assert.throws(() => actions.kill(imp.id, malformed, 31000));
  assert.throws(() => actions.kill(victim.id, request, 31000));
  assert.throws(() => actions.kill(imp.id, request, 30999));
  assert.throws(() =>
    actions.kill(imp.id, { ...request, targetId: mate.id }, 31000),
  );
  assert.throws(() =>
    actions.kill(imp.id, { ...request, targetId: imp.id }, 31000),
  );
  for (const change of [
    { alive: false },
    { connected: false },
    { inVent: true },
  ]) {
    Object.assign(imp, change);
    assert.throws(() => actions.kill(imp.id, request, 31000));
    Object.assign(imp, { alive: true, connected: true, inVent: false });
    Object.assign(victim, change);
    assert.throws(() => actions.kill(imp.id, request, 31000));
    Object.assign(victim, { alive: true, connected: true, inVent: false });
  }
  state.phase = 'meeting';
  assert.throws(() => actions.kill(imp.id, request, 31000));
  state.phase = 'playing';
  victim.x = imp.x + KILL_RADIUS + 1;
  assert.throws(() => actions.kill(imp.id, request, 31000));
  victim.x = imp.x + KILL_RADIUS;
  map.walls.push({ x: imp.x + 29, y: imp.y - 50, width: 2, height: 100 });
  assert.throws(() => actions.kill(imp.id, request, 31000));
  map.walls.pop();
  assert.equal(state.bodies.size, 0);
  const result = actions.kill(imp.id, request, 31000);
  assert.equal(victim.alive, false);
  assert.equal(imp.x, victim.x);
  assert.equal(imp.y, victim.y);
  assert.equal(state.bodies.size, 1);
  assert.equal(state.bodies.get(result.bodyId)!.color, victim.color);
  assert.equal(state.bodies.get(result.bodyId)!.victimId, victim.id);
  assert.equal(round.players.get(imp.id)!.killReadyAt, 61000);
  assert.throws(
    () => actions.kill(imp.id, request, 61000),
    'dead victim cannot produce a second body',
  );
  Object.assign(next, { x: imp.x, y: imp.y });
  assert.throws(() =>
    actions.kill(imp.id, { targetId: next.id, roundId: 1 }, 60999),
  );
  actions.kill(imp.id, { targetId: next.id, roundId: 1 }, 61000);
  assert.equal(state.bodies.size, 2);
  assert.equal(actions.status(victim.id), undefined);
  actions.clear();
  assert.equal(state.bodies.size, 0);
});

test('vents validate proximity, links, exit location, life and role; task sessions block both actions', () => {
  const { state, map, actions, imp, victim, round, tasks } = fixture();
  const vent = map.vents[0]!;
  const enter = { action: 'enter', ventId: vent.id, roundId: 1 };
  assert.throws(() => actions.vent(imp.id, enter));
  Object.assign(imp, { x: vent.x, y: vent.y });
  Object.assign(victim, { x: vent.x, y: vent.y });
  assert.throws(() => actions.vent(victim.id, enter));
  for (const payload of [
    null,
    { ...enter, action: 'teleport' },
    { ...enter, roundId: 0 },
    { ...enter, ventId: 'missing' },
    { ...enter, extra: true },
    { ...enter, action: 'exit' },
  ])
    assert.throws(() => actions.vent(imp.id, payload));
  actions.vent(imp.id, enter);
  assert.equal(imp.inVent, true);
  assert.equal(actions.status(imp.id)!.ventId, vent.id);
  assert.throws(() => actions.vent(imp.id, enter));
  assert.throws(() =>
    actions.kill(imp.id, { targetId: victim.id, roundId: 1 }, 31000),
  );
  const unlinked = map.vents.find(
    (v) => v.id !== vent.id && !vent.links.includes(v.id),
  )!;
  assert.throws(() =>
    actions.vent(imp.id, { ...enter, action: 'move', ventId: unlinked.id }),
  );
  assert.throws(() =>
    actions.vent(imp.id, { ...enter, action: 'exit', ventId: vent.links[0] }),
  );
  const linked = map.vents.find((v) => v.id === vent.links[0])!;
  actions.vent(imp.id, { ...enter, action: 'move', ventId: linked.id });
  assert.equal(imp.x, linked.x);
  assert.equal(imp.y, linked.y);
  assert.equal(imp.inVent, true);
  actions.vent(imp.id, { ...enter, action: 'exit', ventId: linked.id });
  assert.equal(imp.inVent, false);
  assert.equal(actions.status(imp.id)!.ventId, null);
  imp.alive = false;
  assert.throws(() => actions.vent(imp.id, { ...enter, ventId: linked.id }));
  imp.alive = true;
  const fake = round.players.get(imp.id)!.tasks[0]!;
  const station = taskStation(map, fake)!;
  Object.assign(imp, { x: station.x, y: station.y });
  const opened = tasks.open(imp.id, fake.id, 1);
  assert.throws(
    () => actions.kill(imp.id, { targetId: victim.id, roundId: 1 }, 31000),
    /Close your task/,
  );
  assert.throws(() => actions.vent(imp.id, enter), /Close your task/);
  tasks.cancel(imp.id, opened.token);
  actions.clear();
  assert.equal(actions.vents.size, 0);
  assert.equal(state.taskProgress, 0);
});

test('expanded vent reach accepts the boundary but still rejects walls and excess distance', () => {
  const { map, actions, imp } = fixture();
  const vent = map.vents[0]!;
  // Isolate reach from the station's decorative placement and wall layout.
  map.walls = [];
  Object.assign(vent, { x: 1000, y: 1000 });
  Object.assign(imp, { x: vent.x + VENT_USE_RADIUS + 1, y: vent.y });
  const request = { action: 'enter', ventId: vent.id, roundId: 1 };
  assert.throws(() => actions.vent(imp.id, request), /160px/);
  imp.x = vent.x + VENT_USE_RADIUS;
  map.walls.push({ x: vent.x + 40, y: vent.y - 20, width: 2, height: 40 });
  assert.throws(() => actions.vent(imp.id, request));
  map.walls.pop();
  actions.vent(imp.id, request);
  assert.equal(imp.inVent, true);
  assert.equal(imp.x, vent.x);
});

test('action wall test covers parallel rays, corner touching and unobstructed endpoints', () => {
  const walls = [{ x: 10, y: 10, width: 10, height: 10 }];
  assert.equal(
    clearActionPath({ x: 0, y: 15 }, { x: 30, y: 15 }, walls),
    false,
  );
  assert.equal(
    clearActionPath({ x: 15, y: 0 }, { x: 15, y: 30 }, walls),
    false,
  );
  assert.equal(clearActionPath({ x: 0, y: 0 }, { x: 10, y: 10 }, walls), false);
  assert.equal(clearActionPath({ x: 0, y: 5 }, { x: 30, y: 5 }, walls), true);
  assert.equal(clearActionPath({ x: 5, y: 5 }, { x: 5, y: 5 }, walls), true);
});
