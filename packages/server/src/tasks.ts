import { randomUUID } from 'node:crypto';
import {
  taskDurationMs,
  TASK_USE_RADIUS,
  taskStation,
  type GameState,
} from '@mutiny/shared';
import type { MapDef } from '@mutiny/shared/maps';
import type { RoundAssignments } from './round.js';

/** Private interaction sessions freeze actors without exposing assigned stations. */
export class TaskSessions {
  readonly active = new Map<
    string,
    { taskId: string; roundId: number; token: string; readyAt: number }
  >();
  constructor(
    private state: GameState,
    private map: MapDef,
    private round: RoundAssignments,
  ) {}
  private validate(
    id: string,
    taskId: string,
    roundId: number,
    allowFake = false,
  ) {
    const player = this.state.players.get(id);
    const entry = this.round.players.get(id);
    const task = entry?.tasks.find((t) => t.id === taskId);
    if (
      this.state.phase !== 'playing' ||
      roundId !== this.state.roundId ||
      !player ||
      player.inVent ||
      !player.connected
    )
      throw new Error(
        'Tasks are only available while connected to the active round.',
      );
    if ((!allowFake && entry?.role !== 'crew') || !task || task.completed)
      throw new Error('That task is not an unfinished crew assignment.');
    const station = taskStation(this.map, task);
    if (
      !station ||
      Math.hypot(player.x - station.x, player.y - station.y) > TASK_USE_RADIUS
    )
      throw new Error(
        'Move within 80px of your assigned station and try again.',
      );
    return { task, player, station };
  }
  open(id: string, taskId: string, roundId: number, now = Date.now()) {
    const { task } = this.validate(id, taskId, roundId, true);
    if (this.active.has(id)) throw new Error('Close your current task first.');
    const durationMs = taskDurationMs(task.type);
    const session = {
      taskId,
      roundId,
      token: randomUUID(),
      readyAt: now + durationMs,
    };
    this.active.set(id, session);
    return { taskId, roundId, token: session.token, durationMs };
  }
  complete(
    id: string,
    taskId: string,
    roundId: number,
    token: string,
    now = Date.now(),
  ) {
    const session = this.active.get(id);
    if (
      !session ||
      session.token !== token ||
      session.taskId !== taskId ||
      session.roundId !== roundId
    )
      throw new Error('This task session expired. Open the station again.');
    const { task, player, station } = this.validate(id, taskId, roundId);
    if (now < session.readyAt)
      throw new Error('Finish the station procedure before submitting.');
    if (task.step < task.steps) {
      const next = this.map.tasks.find((t) => t.id === station.nextTaskId)!;
      task.step++;
      task.room = next.room;
    } else task.completed = true;
    this.active.delete(id);
    player.tasksDone = this.round.players
      .get(id)!
      .tasks.filter((t) => t.completed).length;
    this.state.taskProgress = this.round.progress();
  }
  cancel(id: string, token: string) {
    if (this.active.get(id)?.token === token) this.active.delete(id);
  }
}
