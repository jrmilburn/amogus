import type { Phase, ServerMessages, TaskAssignment } from '@mutiny/shared';
import type { PrivateAppearance } from '../characters/animations';

/** Private to this connection; never copied into public state or browser storage. */
export class RoundInfo implements PrivateAppearance {
  role?: 'crew' | 'impostor';
  teammateIds: ReadonlySet<string> = new Set();
  teammates: { id: string; name: string }[] = [];
  tasks: TaskAssignment[] = [];
  fake = false;
  roundId = 0;
  trackedTaskId?: string;
  ghostMessages: ServerMessages['ghostHistory']['messages'] = [];
  killReadyAt = Infinity;
  ventId: string | null = null;
  lastKill?: { payload: ServerMessages['killed']; receivedAt: number };
  actionStatus(
    payload: ServerMessages['impostorStatus'],
    phase: Phase,
    roundId: number,
    now = Date.now(),
  ) {
    if (
      phase !== 'playing' ||
      payload.roundId !== roundId ||
      this.roundId !== roundId ||
      this.role !== 'impostor'
    )
      return;
    this.killReadyAt =
      now + Math.max(0, payload.killReadyAt - payload.serverNow);
    this.ventId = payload.ventId;
  }
  killed(payload: ServerMessages['killed'], phase: Phase, roundId: number) {
    if (
      phase === 'playing' &&
      payload.roundId === roundId &&
      this.roundId === roundId
    )
      this.lastKill = { payload, receivedAt: Date.now() };
  }
  reveal(payload: ServerMessages['roleReveal'], phase: Phase, roundId: number) {
    if (phase === 'lobby' || payload.roundId !== roundId) return;
    if (this.roundId !== roundId) this.clear();
    this.roundId = roundId;
    this.role = payload.role;
    this.teammates =
      payload.role === 'impostor'
        ? payload.teammates.map((player) => ({ ...player }))
        : [];
    this.teammateIds = new Set(this.teammates.map((player) => player.id));
  }
  assign(payload: ServerMessages['taskList'], phase: Phase, roundId: number) {
    if (phase === 'lobby' || payload.roundId !== roundId) return;
    if (this.roundId !== roundId) this.clear();
    this.roundId = roundId;
    this.tasks = payload.tasks.map((task) => ({ ...task }));
    if (
      !this.tasks.some(
        (task) => task.id === this.trackedTaskId && !task.completed,
      )
    )
      this.trackedTaskId = undefined;
    this.fake = payload.fake;
  }
  clear() {
    this.trackedTaskId = undefined;
    this.ghostMessages = [];
    this.killReadyAt = Infinity;
    this.ventId = null;
    this.lastKill = undefined;
    this.role = undefined;
    this.teammateIds = new Set();
    this.teammates = [];
    this.tasks = [];
    this.fake = false;
    this.roundId = 0;
  }
}
