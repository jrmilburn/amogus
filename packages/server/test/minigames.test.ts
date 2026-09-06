import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  GameState,
  Player,
  taskDurationMs,
  taskStation,
  type TaskAssignment,
} from '@mutiny/shared';
import { MapDefSchema } from '@mutiny/shared/maps';
import mapData from '@mutiny/shared/maps/the-hollow.json' with { type: 'json' };
import { RoundAssignments } from '../src/round.js';
import { TaskSessions } from '../src/tasks.js';

const map = MapDefSchema.parse(mapData);
for (const type of [
  'reroute-power',
  'calibrate-gyro',
  'data-transfer',
  'sort-samples',
  'fuel-engines',
  'clear-vents',
  'enter-access-code',
  'scan-id',
]) {
  test(`${type} enforces its duration and completes only at the assigned stage`, () => {
    const state = new GameState();
    state.phase = 'playing';
    state.roundId = 1;
    const player = Object.assign(new Player(), { id: 'crew' });
    state.players.set('crew', player);
    const source = map.tasks.find(
      (task) => task.type === type && task.stage === 1,
    )!;
    const assignment: TaskAssignment = {
      id: source.id,
      room: source.room,
      type,
      length: source.length,
      step: 1,
      steps: source.nextTaskId ? 2 : 1,
      completed: false,
    };
    const round = new RoundAssignments(map);
    round.players.set('crew', {
      role: 'crew',
      tasks: [assignment],
      killReadyAt: Infinity,
    });
    const sessions = new TaskSessions(state, map, round);
    for (let stage = 1; stage <= assignment.steps; stage++) {
      const station = taskStation(map, assignment)!;
      player.x = station.x;
      player.y = station.y;
      const now = stage * 20000;
      const session = sessions.open('crew', source.id, 1, now);
      assert.equal(session.durationMs, type === 'data-transfer' ? 8000 : 5000);
      assert.throws(() =>
        sessions.complete(
          'crew',
          source.id,
          1,
          session.token,
          now + session.durationMs - 1,
        ),
      );
      sessions.complete(
        'crew',
        source.id,
        1,
        session.token,
        now + taskDurationMs(type),
      );
      assert.equal(state.taskProgress, stage === assignment.steps ? 1 : 0);
      if (!assignment.completed)
        assert.throws(
          () => sessions.open('crew', source.id, 1, now + 9000),
          'second transfer requires walking to destination',
        );
    }
    assert.equal(assignment.completed, true);
    assert.equal(player.tasksDone, 1);
  });
}
