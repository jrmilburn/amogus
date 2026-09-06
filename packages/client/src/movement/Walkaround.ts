import type { Room } from '@colyseus/sdk';
import {
  canMove,
  DEFAULT_SETTINGS,
  MOVEMENT_STEP,
  movePlayer,
  collisionMap,
  closedDoorRects,
  type CollisionMap,
  type GameState,
} from '@mutiny/shared';
import type { Renderer } from '../renderer/Renderer';
import { letterbox } from '../renderer/Camera';
import { MovementInput } from './Input';
import { inputInstruction } from './inputHints';
import { Interpolation, Prediction } from './prediction';
import { CharacterView } from '../characters/CharacterView';
import { visionRadius } from '../renderer/visibility';
import type { CharacterAssets } from '../characters/assets';
import {
  knowsImpostor,
  type PrivateAppearance,
} from '../characters/animations';

export type WalkRoom = Room<unknown, GameState>;
const sequences = new WeakMap<WalkRoom, number>();

/** Shared lobby walkaround: inherits the map's station palette and compact toolbar.
 * The station leads; a numbered crew marker and camera follow show who you control.
 * Desktop uses WASD/arrows; the left third is a floating touch stick. Back preserves
 * the lobby. Character sprites and game rounds remain separate plan milestones.
 */
export class Walkaround {
  readonly target = { x: 0, y: 0 };
  private prediction: Prediction;
  private collision: CollisionMap;
  private input: MovementInput;
  private elapsed = 0;
  private seq: number;
  private avatars = new Map<
    string,
    {
      node: CharacterView;
      history: Interpolation;
    }
  >();
  private stopped = false;
  private bodies = new Map<string, CharacterView>();
  private firstSnapshot = true;
  strike() {
    this.avatars.get(this.room.sessionId)?.node.strike();
  }
  private paused = false;
  private taskOpen = false;
  setTaskOpen(open: boolean) {
    this.taskOpen = open;
    this.input.clear();
    this.elapsed = 0;
    this.snapshot();
  }
  private motion = matchMedia('(prefers-reduced-motion: reduce)');
  private events = new AbortController();

  constructor(
    private readonly room: WalkRoom,
    private readonly renderer: Renderer,
    dialog: HTMLElement,
    zone: HTMLElement,
    private readonly characterAssets: CharacterAssets,
    private readonly knowledge: PrivateAppearance,
  ) {
    const own = room.state.players.get(room.sessionId)!;
    this.seq = Math.max(sequences.get(room) ?? 0, own.lastProcessedSeq);
    this.collision = collisionMap(renderer.map, room.state);
    this.prediction = new Prediction(own, this.collision);
    Object.assign(this.target, this.prediction.position);
    this.input = new MovementInput(dialog, zone);
    renderer.camera.follow(this.target, true);
    renderer.app.canvas.setAttribute(
      'aria-label',
      `${renderer.map.name}. ${inputInstruction('Drag the left side to move.', 'Move with WASD or arrow keys.')}`,
    );
    room.onStateChange(this.snapshot);
    this.snapshot();
    const suspend = () => {
      this.input.clear();
      this.elapsed = 0;
      // A stop joins the same ordered stream as movement. The bounded server
      // queue also guarantees motion stops if the tab cannot send anything.
      this.send({ dx: 0, dy: 0 });
    };
    window.addEventListener('blur', suspend, { signal: this.events.signal });
    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.hidden) suspend();
      },
      { signal: this.events.signal },
    );
  }

  private snapshot = () => {
    if (this.stopped) return;
    const now = performance.now();
    const own = this.room.state.players.get(this.room.sessionId);
    if (!own) return;
    this.collision.walls = own.alive
      ? collisionMap(this.renderer.map, this.room.state).walls
      : [];
    this.renderer.setClosedVisionDoors(
      closedDoorRects(this.renderer.map, this.room.state),
    );
    const enabled = canMove(this.room.state.phase, own) && !this.taskOpen;
    this.prediction.reconcile(
      own,
      own.lastProcessedSeq,
      this.room.state.settings.playerSpeed,
      enabled,
    );
    if (Math.hypot(this.target.x - own.x, this.target.y - own.y) > 200) {
      Object.assign(this.target, this.prediction.position);
      this.renderer.camera.follow(this.target, true);
    }
    if (!enabled) {
      this.input.clear();
      this.elapsed = 0;
    }
    this.room.state.players.forEach((player, id) => {
      let avatar = this.avatars.get(id);
      if (!avatar) {
        const node = new CharacterView(
          this.characterAssets,
          player.name,
          player.color,
          id === this.room.sessionId,
        );
        avatar = {
          node,
          history: new Interpolation(),
        };
        this.avatars.set(id, avatar);
        this.renderer.setEntity(id, node);
        if (id === this.room.sessionId) this.renderer.setLocalEntity(id);
      }
      avatar.history.push({
        x: player.x,
        y: player.y,
        facing: player.facing,
        walking: player.walking,
        time: now,
      });
      avatar.node.setIdentity(
        player.name + (player.connected ? '' : ' · reconnecting'),
        player.color,
        id === this.room.sessionId,
        knowsImpostor(this.knowledge, id, this.room.sessionId),
      );
      avatar.node.alpha = player.connected ? 1 : 0.45;
    });
    for (const id of this.avatars.keys()) {
      if (!this.room.state.players.has(id)) {
        this.renderer.removeEntity(id);
        this.avatars.delete(id);
      }
    }
    this.room.state.bodies.forEach((body, id) => {
      if (this.bodies.has(id)) return;
      const node = new CharacterView(
        this.characterAssets,
        body.name,
        body.color,
      );
      node.position.set(body.x, body.y);
      node.play(this.firstSnapshot ? 'body' : 'killed');
      this.bodies.set(id, node);
      this.renderer.setEntity(`body:${id}`, node);
    });
    for (const id of this.bodies.keys()) {
      if (!this.room.state.bodies.has(id)) {
        this.renderer.removeEntity(`body:${id}`);
        this.bodies.delete(id);
      }
    }
    this.firstSnapshot = false;
  };

  private send(direction: { dx: number; dy: number }) {
    if (this.stopped || !this.room.connection.isOpen || this.seq >= 0xffffffff)
      return;
    const input = { seq: ++this.seq, ...direction };
    if (!this.prediction.push(input, this.room.state.settings.playerSpeed))
      return;
    sequences.set(this.room, this.seq);
    this.room.send('input', input);
  }

  frame(seconds: number, location: HTMLElement) {
    const controlLabel = `${this.renderer.map.name}. ${inputInstruction('Drag the left side to move.', 'Move with WASD or arrow keys.')}`;
    if (this.renderer.app.canvas.getAttribute('aria-label') !== controlLabel)
      this.renderer.app.canvas.setAttribute('aria-label', controlLabel);
    const own = this.room.state.players.get(this.room.sessionId);
    if (!own || this.stopped) return;
    const enabled =
      canMove(this.room.state.phase, own) &&
      this.room.connection.isOpen &&
      !document.hidden &&
      !this.taskOpen;
    if (!enabled) this.input.clear();
    const direction = enabled ? this.input.direction() : { dx: 0, dy: 0 };
    // Catch up across slow visible frames, but never queue more than the server
    // accepts after a stall. Hidden-tab elapsed time is explicitly discarded.
    this.elapsed += enabled ? Math.min(seconds, MOVEMENT_STEP * 4) : 0;
    while (this.elapsed >= MOVEMENT_STEP) {
      this.elapsed -= MOVEMENT_STEP;
      if (enabled) this.send(direction);
    }
    const position =
      enabled && this.prediction.pending.length < 40
        ? movePlayer(
            this.prediction.position,
            direction,
            this.room.state.settings.playerSpeed,
            this.collision,
            this.elapsed,
          )
        : this.prediction.position;
    Object.assign(this.target, position);
    const limitedVision =
      this.room.state.phase === 'playing' ||
      this.room.state.phase === 'starting';
    this.renderer.setVision(
      limitedVision && own.alive ? position : undefined,
      visionRadius(this.knowledge.role, this.room.state.settings),
      this.knowledge.role !== 'impostor',
    );
    const now = performance.now();
    for (const [id, avatar] of this.avatars) {
      const player = this.room.state.players.get(id)!;
      const sample =
        id === this.room.sessionId
          ? {
              ...position,
              facing: direction.dx ? Math.sign(direction.dx) : own.facing,
              walking: enabled && Boolean(direction.dx || direction.dy),
            }
          : avatar.history.sample(now);
      if (!sample) continue;
      avatar.node.position.set(sample.x, sample.y);
      avatar.node.setScreenScale(letterbox(this.renderer.app.screen).scale);
      avatar.node.sync({
        alive: player.alive,
        ghost: !player.alive,
        inVent: player.inVent,
        facing: sample.facing,
        walking: sample.walking,
      });
      avatar.node.visible = (player.alive || !own.alive) && !player.inVent;
      avatar.node.update(
        this.renderer.app.ticker,
        this.motion.matches,
        this.room.state.settings.playerSpeed / DEFAULT_SETTINGS.playerSpeed,
      );
    }
    for (const body of this.bodies.values()) {
      body.setScreenScale(letterbox(this.renderer.app.screen).scale);
      body.update(this.renderer.app.ticker, this.motion.matches);
    }
    const name = this.renderer.roomAt(position)?.name ?? 'Station passage';
    const text = enabled
      ? `${name} · ${own.alive ? `${this.room.state.players.size} aboard` : 'Ghost · finish your tasks'}`
      : `${name} · ${!own.alive ? 'You were killed' : own.inVent ? 'Inside vent' : 'Movement paused'}`;
    if (location.textContent !== text) location.textContent = text;
    if (this.paused !== !enabled) {
      this.paused = !enabled;
      this.elapsed = 0;
    }
  }

  destroy() {
    if (this.stopped) return;
    this.send({ dx: 0, dy: 0 });
    this.stopped = true;
    this.renderer.setVision(undefined);
    this.input.destroy();
    this.events.abort();
    this.room.onStateChange.remove(this.snapshot);
  }
}
