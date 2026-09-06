import {
  canMove,
  collisionMap,
  movePlayer,
  MAX_INPUT_QUEUE,
  validMovementInput,
  type GameState,
  type MovementInput,
} from '@mutiny/shared';
import type { MapDef } from '@mutiny/shared/maps';

/** One command per server tick: clients never supply time or positions. */
export class MovementSimulation {
  private inputs = new Map<
    string,
    { received: number; queue: MovementInput[] }
  >();
  constructor(
    private readonly state: GameState,
    private readonly map: MapDef,
    private readonly frozen: (id: string) => boolean = () => false,
    private readonly movementMap: () => MapDef = () => this.map,
  ) {}

  enqueue(id: string, value: unknown): boolean {
    const player = this.state.players.get(id);
    if (!player || !validMovementInput(value)) return false;
    let stream = this.inputs.get(id);
    if (!stream) {
      stream = { received: player.lastProcessedSeq, queue: [] };
      this.inputs.set(id, stream);
    }
    if (value.seq <= stream.received) return false;
    stream.received = value.seq;
    // Discard queued commands when frozen. Never replay them after a meeting.
    if (!canMove(this.state.phase, player) || this.frozen(id)) {
      stream.queue = [];
      player.lastProcessedSeq = value.seq;
      return true;
    }
    if (stream.queue.length >= MAX_INPUT_QUEUE) return false;
    stream.queue.push({ ...value });
    return true;
  }

  tick() {
    const map = this.movementMap();
    const collision = collisionMap(map, this.state);
    this.state.players.forEach((player, id) => {
      player.walking = false;
      const stream = this.inputs.get(id);
      if (!stream) return;
      if (!canMove(this.state.phase, player) || this.frozen(id)) {
        stream.queue = [];
        player.lastProcessedSeq = stream.received;
        return;
      }
      const input = stream.queue.shift();
      if (!input) return;
      const next = movePlayer(
        player,
        input,
        this.state.settings.playerSpeed,
        player.alive ? collision : { size: map.size, walls: [] },
      );
      player.walking = Math.hypot(next.x - player.x, next.y - player.y) > 0.001;
      player.x = next.x;
      player.y = next.y;
      if (input.dx) player.facing = input.dx < 0 ? -1 : 1;
      player.lastProcessedSeq = input.seq;
    });
  }

  remove(id: string) {
    this.inputs.delete(id);
  }

  /** A phase boundary consumes old input without replaying it after a teleport/restart. */
  flush(onlyId?: string) {
    this.inputs.forEach((stream, id) => {
      if (onlyId && onlyId !== id) return;
      stream.queue = [];
      const player = this.state.players.get(id);
      if (player) {
        player.lastProcessedSeq = stream.received;
        player.walking = false;
      }
    });
  }
}
