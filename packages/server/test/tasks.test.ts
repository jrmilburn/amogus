import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_SETTINGS,
  GameState,
  Player,
  taskStation,
  nearestTask,
} from '@mutiny/shared';
import { MapDefSchema } from '@mutiny/shared/maps';
import mapData from '@mutiny/shared/maps/the-hollow.json' with { type: 'json' };
import { RoundAssignments } from '../src/round.js';
import { TaskSessions } from '../src/tasks.js';
import { MovementSimulation } from '../src/movement.js';

const map = MapDefSchema.parse(mapData);
test('tasks validate assignment, phase, life, range, token, minimum duration and stage order', () => {
  const state = new GameState();
  const round = new RoundAssignments(map);
  const players = Array.from({ length: 5 }, (_, i) =>
    Object.assign(new Player(), { id: String(i) }),
  );
  players.forEach((p) => state.players.set(p.id, p));
  round.start(players, DEFAULT_SETTINGS);
  state.phase = 'playing';
  state.roundId = 1;
  const sessions = new TaskSessions(state, map, round);
  const id = [...round.players].find(([, p]) => p.role === 'crew')![0];
  const player = state.players.get(id)!;
  const task = round.players.get(id)!.tasks.find((t) => t.length === 'long')!;
  const station = taskStation(map, task)!;
  Object.assign(player, { x: station.x + 81, y: station.y });
  assert.throws(() => sessions.open(id, task.id, 1));
  player.x = station.x + 80;
  assert.equal(nearestTask(map, [task], player)?.task.id, task.id);
  assert.throws(() => sessions.open(id, 'unassigned', 1));
  assert.throws(() => sessions.open(id, task.id, 0));
  state.phase = 'meeting';
  assert.throws(() => sessions.open(id, task.id, 1));
  state.phase = 'playing';
  player.alive = false;
  const ghostOpen = sessions.open(id, task.id, 1);
  sessions.cancel(id, ghostOpen.token);
  player.inVent = true;
  assert.throws(() => sessions.open(id, task.id, 1));
  player.inVent = false;
  const opened = sessions.open(id, task.id, 1, 1000);
  assert.throws(() => sessions.open(id, task.id, 1));
  assert.throws(() => sessions.complete(id, task.id, 1, 'forged', 4000));
  assert.throws(() =>
    sessions.complete(
      id,
      task.id,
      1,
      opened.token,
      1000 + opened.durationMs - 1,
    ),
  );
  const movement = new MovementSimulation(state, map, (actor) =>
    sessions.active.has(actor),
  );
  movement.enqueue(id, { seq: 1, dx: 1, dy: 0 });
  movement.tick();
  assert.equal(player.x, station.x + 80);
  assert.equal(player.lastProcessedSeq, 1);
  sessions.complete(id, task.id, 1, opened.token, 1000 + opened.durationMs);
  assert.equal(task.step, 2);
  assert.equal(task.completed, false);
  assert.equal(state.taskProgress, 0);
  assert.throws(() => sessions.complete(id, task.id, 1, opened.token, 4000));
  assert.throws(() => sessions.open(id, task.id, 1));
  const next = taskStation(map, task)!;
  Object.assign(player, { x: next.x, y: next.y });
  const cancelled = sessions.open(id, task.id, 1, 5000);
  sessions.cancel(id, cancelled.token);
  assert.throws(() => sessions.complete(id, task.id, 1, cancelled.token, 8000));
  const final = sessions.open(id, task.id, 1, 9000);
  sessions.complete(id, task.id, 1, final.token, 9000 + final.durationMs);
  assert.equal(task.completed, true);
  assert.equal(player.tasksDone, 1);
  assert.equal(
    state.taskProgress,
    1 / (4 * (DEFAULT_SETTINGS.tasksShort + DEFAULT_SETTINGS.tasksLong)),
  );
  assert.equal(nearestTask(map, [task], player), undefined);
  assert.throws(() => sessions.open(id, task.id, 1));
  const imp = [...round.players].find(([, p]) => p.role === 'impostor')!;
  const fake = imp[1].tasks[0]!;
  Object.assign(state.players.get(imp[0])!, taskStation(map, fake));
  const progress = state.taskProgress;
  const cover = sessions.open(imp[0], fake.id, 1, 1000);
  assert.throws(() =>
    sessions.complete(imp[0], fake.id, 1, cover.token, 100000),
  );
  sessions.cancel(imp[0], cover.token);
  assert.equal(fake.completed, false);
  assert.equal(fake.step, 1);
  assert.equal(state.taskProgress, progress);
  assert.equal(state.players.get(imp[0])!.tasksDone, 0);
});
