import { Graphics } from 'pixi.js';
import {
  KILL_RADIUS,
  VENT_USE_RADIUS,
  clearActionPath,
  collisionMap,
  type ServerMessages,
} from '@mutiny/shared';
import type { WalkRoom, Walkaround } from '../movement/Walkaround';
import type { Renderer } from '../renderer/Renderer';
import type { TaskController } from '../tasks/TaskController';
import type { RoundInfo } from './RoundInfo';
import './impostor.css';

/** THESIS: a nearby opportunity becomes a deliberate action, with visible readiness.
 * OWN-WORLD: coral danger keys and cold-metal vent controls inherit the station HUD.
 * STORY: track cooldown, identify a target, strike, then choose a linked escape.
 * FIRST VIEWPORT: 80×64 Kill/Vent join Use bottom-right; vent routes sit above them.
 * FORM: local HUD extension, no new visual world. A brief signal-loss cut-in marks death.
 */
export class ImpostorController {
  private root = document.createElement('div');
  private routes = document.createElement('nav');
  private cutIn = document.createElement('div');
  private marker = new Graphics();
  private events = new AbortController();
  private off: (() => void)[] = [];
  private killButton: HTMLButtonElement;
  private ventButton: HTMLButtonElement;
  private notice: HTMLElement;
  private targetId?: string;
  private nearbyVent?: string;
  private routeKey = '';
  private pending = false;
  private timer?: ReturnType<typeof setTimeout>;
  private cutTimer?: ReturnType<typeof setTimeout>;
  constructor(
    private host: HTMLDialogElement,
    private room: WalkRoom,
    private info: RoundInfo,
    private renderer: Renderer,
    private walk: Walkaround,
    private tasks: TaskController,
  ) {
    this.root.className = 'impostor-actions';
    this.root.hidden = true;
    this.root.innerHTML =
      '<p class="impostor-feedback" role="status"></p><button type="button" class="impostor-kill" disabled>Kill<small>Q</small></button><button type="button" class="impostor-vent" disabled>Vent<small>V</small></button>';
    this.killButton = this.root.querySelector('.impostor-kill')!;
    this.ventButton = this.root.querySelector('.impostor-vent')!;
    this.notice = this.root.querySelector('p')!;
    tasks.actionBar.prepend(this.root);
    this.routes.className = 'vent-routes';
    this.routes.setAttribute('aria-label', 'Vent travel');
    this.routes.hidden = true;
    this.root.append(this.routes);
    this.cutIn.className = 'kill-cut-in';
    this.cutIn.hidden = true;
    this.cutIn.setAttribute('role', 'status');
    this.cutIn.innerHTML =
      '<div><p>Suit signal lost</p><h2>You were killed</h2><p>You are now a ghost. Float through walls, finish your tasks, and chat with other ghosts.</p></div>';
    host.append(this.cutIn);
    renderer.layers.objects.addChild(this.marker);
    const signal = this.events.signal;
    this.killButton.addEventListener('click', () => this.kill(), { signal });
    this.ventButton.addEventListener('click', () => this.vent(), { signal });
    host.addEventListener(
      'keydown',
      (e) => {
        if (
          e.repeat ||
          e.altKey ||
          e.ctrlKey ||
          e.metaKey ||
          tasks.isOpen ||
          (e.target instanceof HTMLElement &&
            e.target.matches('input,textarea,select,[contenteditable]'))
        )
          return;
        if (e.code === 'KeyQ') {
          e.preventDefault();
          this.kill();
        }
        if (e.code === 'KeyV') {
          e.preventDefault();
          this.vent();
        }
      },
      { signal },
    );
    this.off.push(
      room.onMessage<ServerMessages['impostorStatus']>('impostorStatus', () =>
        this.settle(),
      ),
    );
    this.off.push(
      room.onMessage<ServerMessages['error']>('error', (payload) => {
        if (!this.pending) return;
        this.settle();
        this.notice.textContent = payload.message;
      }),
    );
  }
  private settle() {
    clearTimeout(this.timer);
    this.pending = false;
    this.tasks.actionPending = false;
  }
  private request(send: () => void) {
    if (this.pending || this.tasks.isOpen || !this.room.connection.isOpen)
      return;
    this.pending = true;
    this.tasks.actionPending = true;
    this.tasks.clearFeedback();
    this.notice.textContent = '';
    send();
    this.timer = setTimeout(() => {
      this.settle();
      this.notice.textContent = 'Action did not respond. Try again.';
    }, 5000);
    this.frame();
  }
  private kill() {
    this.frame();
    if (this.killButton.disabled || !this.targetId) return;
    this.request(() =>
      this.room.send('kill', {
        targetId: this.targetId,
        roundId: this.room.state.roundId,
      }),
    );
  }
  private vent() {
    this.frame();
    if (this.ventButton.disabled) return;
    const inVent = this.room.state.players.get(this.room.sessionId)?.inVent;
    const ventId = inVent ? this.info.ventId : this.nearbyVent;
    if (ventId) this.travel(inVent ? 'exit' : 'enter', ventId);
  }
  private travel(action: 'enter' | 'move' | 'exit', ventId: string) {
    this.request(() =>
      this.room.send('vent', {
        action,
        ventId,
        roundId: this.room.state.roundId,
      }),
    );
  }
  frame() {
    const state = this.room.state;
    const own = state.players.get(this.room.sessionId);
    const active =
      state.phase === 'playing' && this.info.roundId === state.roundId;
    this.root.hidden = !active || this.info.role !== 'impostor' || !own?.alive;
    if (!active) {
      this.settle();
      this.cutIn.hidden = true;
      this.notice.textContent = '';
    }
    const event = this.info.lastKill;
    if (event) {
      this.info.lastKill = undefined;
      if (active && Date.now() - event.receivedAt < 2000) {
        if (event.payload.victimId === this.room.sessionId) {
          this.cutIn.hidden = false;
          clearTimeout(this.cutTimer);
          this.cutTimer = setTimeout(() => {
            this.cutIn.hidden = true;
          }, 2200);
        } else this.walk.strike();
      }
    }
    this.marker.clear();
    this.targetId = undefined;
    this.nearbyVent = undefined;
    const usable = !this.root.hidden && !this.pending && !this.tasks.isOpen;
    const seconds = Math.max(
      0,
      Math.ceil((this.info.killReadyAt - Date.now()) / 1000),
    );
    let distance = KILL_RADIUS + 0.001;
    if (usable && own && !own.inVent) {
      for (const [id, candidate] of state.players) {
        const d = Math.hypot(own.x - candidate.x, own.y - candidate.y);
        if (
          id === own.id ||
          this.info.teammateIds.has(id) ||
          !candidate.alive ||
          !candidate.connected ||
          candidate.inVent ||
          d >= distance ||
          !clearActionPath(
            own,
            candidate,
            collisionMap(this.renderer.map, state).walls,
          ) ||
          !this.renderer.isPointVisible(candidate)
        )
          continue;
        distance = d;
        this.targetId = id;
      }
      let ventDistance = VENT_USE_RADIUS + 0.001;
      for (const vent of this.renderer.map.vents) {
        const d = Math.hypot(own.x - vent.x, own.y - vent.y);
        if (
          d < ventDistance &&
          clearActionPath(
            own,
            vent,
            collisionMap(this.renderer.map, state).walls,
          ) &&
          this.renderer.isPointVisible(vent)
        ) {
          this.nearbyVent = vent.id;
          ventDistance = d;
        }
      }
    }
    this.killButton.disabled = !usable || !this.targetId || seconds > 0;
    const killLabel = this.pending
      ? 'Wait'
      : seconds > 0
        ? Number.isFinite(seconds)
          ? `${seconds}s`
          : 'Waiting'
        : 'Q';
    this.killButton.querySelector('small')!.textContent = killLabel;
    const target = this.targetId ? state.players.get(this.targetId) : undefined;
    this.killButton.setAttribute(
      'aria-label',
      seconds > 0
        ? `Kill: ${Number.isFinite(seconds) ? `${seconds} seconds remaining` : 'waiting for server'}`
        : target
          ? `Kill ${target.name} (Q)`
          : `Kill: move within ${KILL_RADIUS}px of crew`,
    );
    if (target && !this.killButton.disabled)
      this.marker
        .circle(target.x, target.y, 34)
        .stroke({ color: 0xff8f99, width: 5 });
    this.ventButton.disabled =
      !usable || !(own?.inVent ? this.info.ventId : this.nearbyVent);
    const ventLabel = own?.inVent ? 'Exit' : 'Vent';
    this.ventButton.firstChild!.textContent = ventLabel;
    this.ventButton.setAttribute(
      'aria-label',
      own?.inVent
        ? 'Exit current vent (V)'
        : this.nearbyVent
          ? 'Enter nearby vent (V)'
          : `Vent: move within ${VENT_USE_RADIUS}px of a vent`,
    );
    this.host.classList.toggle('is-in-vent', Boolean(active && own?.inVent));
    this.routes.hidden = this.root.hidden || !own?.inVent;
    const key = `${this.routes.hidden}:${this.info.ventId}`;
    if (key !== this.routeKey) {
      const restoreRouteFocus = this.routes.contains(document.activeElement);
      this.routeKey = key;
      this.routes.replaceChildren();
      const current = this.renderer.map.vents.find(
        (v) => v.id === this.info.ventId,
      );
      if (current && !this.routes.hidden) {
        const label = document.createElement('p');
        label.textContent = `${this.renderer.map.rooms.find((r) => r.id === current.room)?.name ?? current.room} vent · Choose a route`;
        this.routes.append(label);
        for (const id of current.links) {
          const vent = this.renderer.map.vents.find((v) => v.id === id)!;
          const dx = vent.x - current.x;
          const dy = vent.y - current.y;
          const arrow =
            Math.abs(dx) > Math.abs(dy)
              ? dx < 0
                ? '←'
                : '→'
              : dy < 0
                ? '↑'
                : '↓';
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = `${arrow} ${this.renderer.map.rooms.find((r) => r.id === vent.room)?.name ?? vent.room}`;
          button.addEventListener('click', () => this.travel('move', id));
          this.routes.append(button);
        }
      }
      if (restoreRouteFocus) {
        const focusTarget =
          this.routes.querySelector('button') ?? this.ventButton;
        focusTarget.disabled = !usable;
        if (!focusTarget.disabled) focusTarget.focus();
      }
    }
    this.routes.querySelectorAll('button').forEach((button) => {
      button.disabled = !usable;
    });
  }
  destroy() {
    this.settle();
    clearTimeout(this.cutTimer);
    this.events.abort();
    this.off.forEach((off) => off());
    this.host.classList.remove('is-in-vent');
    this.marker.destroy();
    this.root.remove();
    this.cutIn.remove();
  }
}
