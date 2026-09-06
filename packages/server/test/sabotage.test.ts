import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  GameState,
  Player,
  DEFAULT_SETTINGS,
  collisionMap,
  closedDoorRects,
  clearActionPath,
  movePlayer,
  emergencyBlocked,
  type ServerMessages,
} from '@mutiny/shared';
import { MapDefSchema } from '@mutiny/shared/maps';
import mapData from '@mutiny/shared/maps/the-hollow.json' with { type: 'json' };
import { RoundAssignments } from '../src/round.js';
import { TaskSessions } from '../src/tasks.js';
import { SabotageSystem } from '../src/sabotage.js';

function fixture() {
  const map = MapDefSchema.parse(mapData),
    state = new GameState();
  const players = Array.from({ length: 7 }, (_, i) =>
    Object.assign(new Player(), { id: String(i), ...map.spawnPoints[0] }),
  );
  players.forEach((p) => state.players.set(p.id, p));
  state.phase = 'playing';
  state.roundId = 1;
  const round = new RoundAssignments(map);
  round.start(players, { ...DEFAULT_SETTINGS, impostors: 2 });
  const tasks = new TaskSessions(state, map, round);
  const closed: ServerMessages['repairClosed'][] = [];
  const system = new SabotageSystem(state, map, round, tasks, (_, p) =>
    closed.push(p),
  );
  system.begin(0);
  const imp = players.find(
    (p) => round.players.get(p.id)!.role === 'impostor',
  )!;
  const crew = players.filter((p) => round.players.get(p.id)!.role === 'crew');
  function activate(kind: 'lights' | 'reactor' | 'o2' | 'comms', now = 30000) {
    system.activate(imp.id, { kind, roundId: 1 }, now);
  }
  function open(kind: string, who = crew[0]!, now = 30000) {
    const point = map.sabotagePoints.find((p) => p.kind === kind)!;
    Object.assign(who, { x: point.x, y: point.y });
    return system.open(
      who.id,
      { pointId: point.id, sabotageId: state.sabotage!.id, roundId: 1 },
      now,
    );
  }
  function fix(
    who: Player,
    session: ServerMessages['repairOpened'],
    action: Record<string, unknown>,
    now = 30000,
  ) {
    const { pointId, sabotageId, roundId, token } = session;
    system.fix(who.id, { pointId, sabotageId, roundId, token, ...action }, now);
  }
  return {
    map,
    state,
    players,
    round,
    tasks,
    system,
    closed,
    imp,
    crew,
    activate,
    open,
    fix,
  };
}
test('sabotage validates actor, round, payload, phase, cooldown and active fault', () => {
  const f = fixture(),
    request = { kind: 'lights', roundId: 1 };
  for (const p of [
    null,
    {},
    { ...request, actorId: f.imp.id },
    { ...request, roundId: 0 },
    { ...request, roomId: 'commons' },
  ])
    assert.throws(() => f.system.activate(f.imp.id, p, 30000));
  assert.throws(() => f.system.activate(f.crew[0]!.id, request, 30000));
  assert.throws(() => f.activate('lights', 29999));
  for (const change of [
    { alive: false },
    { connected: false },
    { inVent: true },
  ]) {
    Object.assign(f.imp, change);
    assert.throws(() => f.activate('lights'));
    Object.assign(f.imp, { alive: true, connected: true, inVent: false });
  }
  f.state.phase = 'meeting';
  assert.throws(() => f.activate('lights'));
  f.state.phase = 'playing';
  f.activate('lights');
  assert.throws(() => f.activate('reactor', 60000));
});
test('lights requires all five shared switches; repair sessions are scoped and private', () => {
  const f = fixture();
  f.activate('lights');
  const s = f.open('lights');
  assert.throws(() => f.open('lights'));
  assert.throws(() =>
    f.fix(f.crew[1]!, s, { action: 'switch', switchIndex: 0 }),
  );
  for (const action of [
    { action: 'code', code: '12345' },
    { action: 'switch', switchIndex: 5 },
    { action: 'switch', switchIndex: 0, token: 'forged' },
    { action: 'switch', switchIndex: 0, roundId: 0 },
    { action: 'switch', switchIndex: 0, extra: true },
  ])
    assert.throws(() => f.fix(f.crew[0]!, s, action));
  for (let i = 0; i < 4; i++)
    f.fix(f.crew[0]!, s, { action: 'switch', switchIndex: i });
  assert.ok(f.state.sabotage);
  f.fix(f.crew[0]!, s, { action: 'switch', switchIndex: 4 }, 31000);
  assert.equal(f.state.sabotage, undefined);
  assert.equal(f.system.sessions.size, 0);
  assert.equal(f.closed.length, 1);
  assert.equal(f.state.sabotageReadyAt, 61000);
  assert.throws(() =>
    f.fix(f.crew[0]!, s, { action: 'switch', switchIndex: 4 }, 31000),
  );
  assert.throws(() => f.activate('lights', 60999));
  f.activate('lights', 61000);
  const impPanel = f.open('lights', f.imp, 61000);
  f.fix(f.imp, impPanel, { action: 'switch', switchIndex: 0 }, 61000);
});
test('panel open/fix rejects range, walls, expiry, death and stale sabotage IDs', () => {
  const f = fixture();
  f.activate('lights');
  const s = f.open('lights');
  f.crew[0]!.x += 81;
  assert.throws(() =>
    f.fix(f.crew[0]!, s, { action: 'switch', switchIndex: 0 }),
  );
  f.system.tick(30001);
  assert.equal(f.system.sessions.size, 0);
  const point = f.map.sabotagePoints.find((p) => p.kind === 'lights')!;
  Object.assign(f.crew[0]!, { x: point.x - 40, y: point.y });
  f.map.walls.push({ x: point.x - 20, y: point.y - 50, width: 2, height: 100 });
  assert.throws(() =>
    f.system.open(f.crew[0]!.id, {
      pointId: point.id,
      sabotageId: f.state.sabotage!.id,
      roundId: 1,
    }),
  );
  f.map.walls.pop();
  const fresh = f.open('lights');
  assert.throws(() =>
    f.fix(f.crew[0]!, fresh, { action: 'switch', switchIndex: 0 }, 90000),
  );
  f.crew[0]!.alive = false;
  f.system.tick(30002);
  assert.equal(f.system.sessions.size, 0);
  f.system.clear();
  assert.equal(f.state.sabotage, undefined);
  assert.equal(f.state.sabotageReadyAt, 0);
});
test('reactor needs two distinct players holding both panels continuously for three seconds', () => {
  const f = fixture();
  f.activate('reactor');
  assert.equal(emergencyBlocked(f.state), true);
  const a = f.open('reactor-a'),
    b = f.open('reactor-b', f.crew[1]!);
  for (let t = 30000; t <= 34000; t += 250) {
    f.fix(f.crew[0]!, a, { action: 'hold' }, t);
    f.system.tick(t);
  }
  assert.equal(f.state.sabotage!.holdProgress, 0);
  for (let t = 34000; t < 37000; t += 250) {
    f.fix(f.crew[0]!, a, { action: 'hold' }, t);
    f.fix(f.crew[1]!, b, { action: 'hold' }, t);
    f.system.tick(t);
  }
  assert.ok(f.state.sabotage);
  f.fix(f.crew[0]!, a, { action: 'hold' }, 37000);
  f.fix(f.crew[1]!, b, { action: 'hold' }, 37000);
  f.system.tick(37000);
  assert.equal(f.state.sabotage, undefined);
  assert.equal(emergencyBlocked(f.state), false);
});
test('reactor release, missing heartbeat and disconnection interrupt progress', () => {
  const f = fixture();
  f.activate('reactor');
  const a = f.open('reactor-a'),
    b = f.open('reactor-b', f.crew[1]!);
  for (let t = 30000; t <= 31000; t += 250) {
    f.fix(f.crew[0]!, a, { action: 'hold' }, t);
    f.fix(f.crew[1]!, b, { action: 'hold' }, t);
    f.system.tick(t);
  }
  assert.ok(f.state.sabotage!.holdProgress > 0);
  f.fix(f.crew[0]!, a, { action: 'release' }, 31001);
  f.system.tick(31001);
  assert.equal(f.state.sabotage!.holdProgress, 0);
  f.fix(f.crew[0]!, a, { action: 'hold' }, 31002);
  f.system.tick(31803);
  assert.equal(f.state.sabotage!.heldPoints.length, 0);
  f.crew[1]!.connected = false;
  f.system.tick(31804);
  assert.equal(f.system.sessions.has(f.crew[1]!.id), false);
});
test('O2 sends codes only to scoped panel sessions, needs both codes, rejects deadline repairs', () => {
  const f = fixture();
  f.activate('o2');
  const a = f.open('o2-a');
  assert.match(a.code!, /^\d{5}$/);
  assert.equal(Object.hasOwn(f.state.sabotage!, 'code'), false);
  assert.throws(() => f.fix(f.crew[0]!, a, { action: 'code', code: 'wrong' }));
  f.fix(f.crew[0]!, a, { action: 'code', code: a.code });
  assert.equal(f.state.sabotage!.fixedPoints.length, 1);
  const b = f.open('o2-b');
  f.fix(f.crew[0]!, b, { action: 'code', code: b.code });
  assert.equal(f.state.sabotage, undefined);
  f.activate('o2', 60000);
  const c = f.open('o2-a', f.crew[0]!, 60000);
  assert.throws(() =>
    f.fix(f.crew[0]!, c, { action: 'code', code: c.code }, 105000),
  );
  assert.equal(f.system.tick(105000), 'o2');
  assert.equal(f.state.phase, 'ended');
  assert.equal(f.state.winner, 'impostor');
  assert.equal(f.state.endReason, 'o2');
  assert.equal(f.system.tick(105001), undefined);
});
test('comms restores after five continuous seconds and reactor expires after 45 seconds', () => {
  const f = fixture();
  f.activate('comms');
  const a = f.open('comms');
  for (let t = 30000; t < 35000; t += 250) {
    f.fix(f.crew[0]!, a, { action: 'hold' }, t);
    f.system.tick(t);
  }
  assert.ok(f.state.sabotage);
  f.fix(f.crew[0]!, a, { action: 'hold' }, 35000);
  f.system.tick(35000);
  assert.equal(f.state.sabotage, undefined);
  f.activate('reactor', 65000);
  assert.equal(f.system.tick(109999), undefined);
  assert.equal(f.system.tick(110000), 'reactor');
  assert.equal(f.state.phase, 'ended');
  assert.equal(f.state.closedDoors.size, 0);
});
test('doors have independent cooldown, block collision and sight, reject occupied thresholds, and reopen', () => {
  const f = fixture(),
    door = f.map.doors[0]!,
    request = { kind: 'doors', roomId: door.room, roundId: 1 };
  Object.assign(f.crew[0]!, {
    x: door.x + door.width / 2,
    y: door.y + door.height / 2,
  });
  assert.throws(() => f.system.activate(f.imp.id, request, 0));
  Object.assign(f.crew[0]!, f.map.spawnPoints[0]);
  f.system.activate(f.imp.id, request, 0);
  assert.ok(closedDoorRects(f.map, f.state).length > 0);
  assert.equal(f.state.closedDoors.get(door.room), 10000);
  const start = { x: door.x - 30, y: door.y + door.height / 2 },
    end = { x: door.x + door.width + 30, y: start.y };
  assert.equal(
    clearActionPath(start, end, collisionMap(f.map, f.state).walls),
    false,
  );
  assert.ok(
    movePlayer(start, { dx: 1, dy: 0 }, 1000, collisionMap(f.map, f.state), 1)
      .x < door.x,
  );
  assert.throws(() => f.system.activate(f.imp.id, request, 14999));
  f.system.tick(10000);
  assert.equal(f.state.closedDoors.size, 0);
  f.system.activate(f.imp.id, request, 15000);
  f.activate('lights');
  assert.ok(f.state.sabotage);
  f.system.clear();
  assert.equal(f.state.closedDoors.size, 0);
  assert.equal(f.state.doorsReadyAt, 0);
});
