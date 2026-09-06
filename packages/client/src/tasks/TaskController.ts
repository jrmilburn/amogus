import { Graphics } from 'pixi.js';
import { type ServerMessages } from '@mutiny/shared';
import { actionLabel } from '../movement/inputHints';
import { blocksGameShortcut } from '../movement/keyboard';
import { letterbox } from '../renderer/Camera';
import {
  visibleTaskSpots,
  taskName,
  TASK_SPOT_COLOR,
  TRACKED_SPOT_COLOR,
  READY_SPOT_COLOR,
} from './spotter';
import type { WalkRoom, Walkaround } from '../movement/Walkaround';
import type { Renderer } from '../renderer/Renderer';
import type { RoundInfo } from '../round/RoundInfo';
import type { TaskMinigame } from './TaskMinigame';
import { createTaskGame } from './minigames/factory';
import './tasks.css';

/** THESIS: visible task diamonds lead to one clear action at the station.
 * OWN-WORLD: cold station panels, amber Use, mint shared progress, native controls.
 * STORY: find your assigned station, solve its instrument, then follow the next room.
 * FIRST VIEWPORT: tasks top-left, crew bar across top, 64px Use bottom-right.
 * FORM: extend the existing map HUD; focused station-check modal protects movement.
 */
export class TaskController {
  private root = document.createElement('div');
  private marker = new Graphics();
  private events = new AbortController();
  private unsubscribe: (() => void)[] = [];
  private pending = false;
  private opened?: ServerMessages['taskOpened'];
  private modal?: HTMLDialogElement;
  private game?: TaskMinigame;
  private requestTimer?: ReturnType<typeof setTimeout>;
  private candidate?: string;
  private button: HTMLButtonElement;
  private status: HTMLElement;
  actionPending = false;
  externalOpen = false;
  clearFeedback() {
    this.status.textContent = '';
  }
  get actionBar() {
    return this.root;
  }
  get isOpen() {
    return this.pending || Boolean(this.modal) || this.externalOpen;
  }
  constructor(
    private host: HTMLDialogElement,
    private room: WalkRoom,
    private info: RoundInfo,
    private renderer: Renderer,
    private walk: Walkaround,
  ) {
    this.root.className = 'task-actions';
    this.root.innerHTML =
      '<p class="task-feedback" role="status"></p><button type="button" class="task-use" disabled><span>Use</span><small class="action-context">Find a task</small><small class="key-hint">E</small></button>';
    host.append(this.root);
    this.button = this.root.querySelector('button')!;
    this.status = this.root.querySelector('p')!;
    renderer.layers.objects.addChild(this.marker);
    this.button.addEventListener('click', () => this.use(), {
      signal: this.events.signal,
    });
    host.addEventListener(
      'keydown',
      (e) => {
        if (
          e.code === 'KeyE' &&
          !e.repeat &&
          !e.altKey &&
          !e.ctrlKey &&
          !e.metaKey &&
          !this.modal &&
          !blocksGameShortcut(e.target)
        ) {
          e.preventDefault();
          this.use();
        }
      },
      { signal: this.events.signal },
    );
    this.unsubscribe.push(
      room.onMessage<ServerMessages['taskOpened']>('taskOpened', (payload) => {
        if (
          !this.pending ||
          payload.roundId !== room.state.roundId ||
          room.state.phase !== 'playing'
        ) {
          room.send('cancelTask', { token: payload.token });
          return;
        }
        clearTimeout(this.requestTimer);
        this.pending = false;
        this.opened = payload;
        this.openModal();
      }),
    );
    this.unsubscribe.push(
      room.onMessage<ServerMessages['taskClosed']>('taskClosed', (payload) => {
        if (payload.token !== this.opened?.token) return;
        const task = this.info.tasks.find(
          (task) => task.id === this.opened?.taskId,
        );
        this.close(false);
        const roomName =
          this.renderer.map.rooms.find((room) => room.id === task?.room)
            ?.name ?? task?.room;
        this.status.textContent =
          payload.error ??
          (task?.completed
            ? `Task complete · ${this.info.tasks.filter((task) => !task.completed).length} remaining.`
            : roomName
              ? `Stage saved · next station: ${roomName}.`
              : 'Station check saved.');
      }),
    );
    this.unsubscribe.push(
      room.onMessage<ServerMessages['error']>('error', (payload) => {
        if (!this.pending) return;
        this.close(false);
        this.status.textContent = payload.message;
      }),
    );
  }
  frame() {
    const own = this.room.state.players.get(this.room.sessionId);
    const active =
      this.room.state.phase === 'playing' &&
      this.info.roundId === this.room.state.roundId;
    if ((!active || !own || own.inVent) && (this.modal || this.pending))
      this.close(true);
    this.root.hidden = !active;
    const spots =
      active && own && !own.inVent && Boolean(this.info.role)
        ? visibleTaskSpots(this.renderer.map, this.info.tasks, own, (point) =>
            this.renderer.isPointVisible(point),
          )
        : [];
    const nearby = spots.find((spot) => spot.reachable);
    this.candidate = nearby?.task.id;
    this.button.disabled =
      !nearby ||
      this.isOpen ||
      this.actionPending ||
      !this.room.connection.isOpen;
    this.button.setAttribute(
      'aria-label',
      nearby
        ? actionLabel(`Use ${taskName(nearby.task.type)}`, 'E')
        : 'Use: move closer to an unfinished task',
    );
    const context = !this.room.connection.isOpen
      ? 'Reconnecting'
      : this.pending
        ? 'Opening…'
        : nearby
          ? taskName(nearby.task.type)
          : this.info.tasks.length &&
              this.info.tasks.every((task) => task.completed)
            ? 'All done'
            : this.room.state.sabotage?.kind === 'comms'
              ? 'Find a station'
              : 'Find a diamond';
    const label = this.button.querySelector('.action-context')!;
    if (label.textContent !== context) label.textContent = context;
    this.marker.clear();
    if (!this.modal && this.room.state.sabotage?.kind !== 'comms') {
      const scale = Math.max(0.1, letterbox(this.renderer.app.screen).scale);
      const r = 10 / scale;
      for (const spot of spots) {
        const { x, y } = spot.station;
        const tracked = spot.task.id === this.info.trackedTaskId;
        const color =
          spot === nearby && !this.button.disabled
            ? READY_SPOT_COLOR
            : tracked
              ? TRACKED_SPOT_COLOR
              : TASK_SPOT_COLOR;
        this.marker
          .poly([x, y - r, x + r, y, x, y + r, x - r, y])
          .fill(0x102029)
          .stroke({ color, width: 2 / scale });
        if (spot === nearby || tracked)
          this.marker.circle(x, y, 3 / scale).fill(color);
      }
    }
  }
  private use() {
    if (
      this.button.disabled ||
      !this.candidate ||
      this.actionPending ||
      this.externalOpen
    )
      return;
    this.pending = true;
    this.walk.setTaskOpen(true);
    this.status.textContent = 'Opening station…';
    this.room.send('useTask', {
      taskId: this.candidate,
      roundId: this.room.state.roundId,
    });
    this.requestTimer = setTimeout(() => {
      if (!this.pending) return;
      this.close(false);
      this.status.textContent = 'Station did not respond. Try again.';
    }, 5000);
  }
  private openModal() {
    this.status.textContent = '';
    const modal = document.createElement('dialog');
    this.modal = modal;
    modal.className = 'task-modal';
    modal.setAttribute('aria-labelledby', 'task-modal-title');
    modal.innerHTML =
      '<header><h2 id="task-modal-title"></h2><button type="button" class="secondary" aria-label="Cancel task">Close<span class="key-hint">Esc</span></button></header><div class="task-game"></div><p class="hint">Closing cancels this attempt. Earlier stages stay saved.</p>';
    modal.classList.add('task-workbench');
    const task = this.info.tasks.find((t) => t.id === this.opened!.taskId)!;
    modal.querySelector('h2')!.textContent =
      `${task.type.replaceAll('-', ' ')} · ${task.step}/${task.steps}`;
    if (this.info.fake) {
      modal.classList.add('is-fake-task');
      modal.querySelector('h2')!.textContent =
        `Fake task · ${task.type.replaceAll('-', ' ')}`;
      modal.querySelector('.hint')!.textContent =
        'Cover only. This procedure never advances crew progress. Choose Close to leave.';
    }
    this.host.append(modal);
    modal.addEventListener('cancel', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.close(true);
    });
    modal
      .querySelector('button')!
      .addEventListener('click', () => this.close(true));
    modal.showModal();
    this.game = createTaskGame(task, this.opened!.durationMs, (cue) => {
      modal.dispatchEvent(
        new CustomEvent('mutiny:task-sfx', {
          bubbles: true,
          detail: { taskType: task.type, cue },
        }),
      );
    });
    this.game.mount(modal.querySelector('.task-game')!, () => {
      if (this.info.fake) {
        this.close(true);
        this.status.textContent =
          'Cover task finished. Crew progress unchanged.';
        return;
      }
      if (this.opened)
        this.room.send('taskComplete', {
          taskId: this.opened.taskId,
          roundId: this.opened.roundId,
          token: this.opened.token,
        });
    });
  }
  private close(cancel: boolean) {
    clearTimeout(this.requestTimer);
    if (this.pending && this.room.connection.isOpen)
      this.room.send('cancelTask', { token: null });
    if (cancel && this.opened && this.room.connection.isOpen)
      this.room.send('cancelTask', { token: this.opened.token });
    this.opened = undefined;
    this.pending = false;
    this.game?.unmount();
    this.game = undefined;
    const hadModal = Boolean(this.modal);
    this.modal?.close();
    this.modal?.remove();
    this.modal = undefined;
    this.walk.setTaskOpen(false);
    if (hadModal && this.host.open)
      this.host
        .querySelector<HTMLElement>('.round-assignment summary')
        ?.focus();
  }
  destroy() {
    this.close(true);
    this.events.abort();
    this.unsubscribe.forEach((off) => off());
    this.root.remove();
    this.marker.destroy();
  }
}
