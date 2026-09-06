import { randomInt } from 'node:crypto';
import type {
  Player,
  PrivatePlayerState,
  SettingsValues,
  TaskAssignment,
} from '@mutiny/shared';
import type { MapDef } from '@mutiny/shared/maps';

interface RoundPlayer extends PrivatePlayerState {
  killReadyAt: number;
}
function shuffled<T>(values: readonly T[]): T[] {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

/** Server-only records. This object is never attached to a synchronized Schema. */
export class RoundAssignments {
  readonly players = new Map<string, RoundPlayer>();
  constructor(private readonly map: MapDef) {}

  start(players: Player[], settings: SettingsValues) {
    const short = this.map.tasks.filter(
      (task) => task.stage === 1 && task.length === 'short',
    );
    const long = this.map.tasks.filter(
      (task) => task.stage === 1 && task.length === 'long',
    );
    if (settings.tasksShort > short.length || settings.tasksLong > long.length)
      throw new Error(
        'The map does not have enough unique task assignments for these settings.',
      );
    if (settings.impostors >= players.length)
      throw new Error('Not enough crew for this round.');
    const impostors = new Set(
      shuffled(players)
        .slice(0, settings.impostors)
        .map((player) => player.id),
    );
    const assigned = new Map<string, RoundPlayer>();
    for (const player of players) {
      const tasks: TaskAssignment[] = [
        ...shuffled(short).slice(0, settings.tasksShort),
        ...shuffled(long).slice(0, settings.tasksLong),
      ].map((task) => {
        let steps = 1;
        let next = task.nextTaskId;
        while (next) {
          const stage = this.map.tasks.find((entry) => entry.id === next)!;
          steps++;
          next = stage.nextTaskId;
        }
        return {
          id: task.id,
          type: task.type,
          room: task.room,
          length: task.length,
          step: 1,
          steps,
          completed: false,
        };
      });
      assigned.set(player.id, {
        role: impostors.has(player.id) ? 'impostor' : 'crew',
        tasks,
        killReadyAt: Infinity,
      });
    }
    this.players.clear();
    assigned.forEach((entry, id) => this.players.set(id, entry));
  }

  beginPlaying(now: number, cooldownSeconds: number) {
    for (const player of this.players.values())
      player.killReadyAt =
        player.role === 'impostor' ? now + cooldownSeconds * 1000 : Infinity;
  }

  progress() {
    let done = 0,
      total = 0;
    for (const player of this.players.values()) {
      if (player.role !== 'crew') continue;
      total += player.tasks.length;
      done += player.tasks.filter((task) => task.completed).length;
    }
    return total ? done / total : 0;
  }
  clear() {
    this.players.clear();
  }
}
