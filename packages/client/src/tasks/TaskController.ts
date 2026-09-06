import { Graphics } from 'pixi.js';
import { nearestTask, type ServerMessages } from '@mutiny/shared';
import type { WalkRoom, Walkaround } from '../movement/Walkaround';
import type { Renderer } from '../renderer/Renderer';
import type { RoundInfo } from '../round/RoundInfo';
import type { TaskMinigame } from './TaskMinigame';
import { createTaskGame } from './minigames/factory';
import './tasks.css';

/** THESIS: a station within reach becomes one clear action, not a menu.
 * OWN-WORLD: cold station panels, amber Use, mint shared progress, native controls.
 * STORY: find your assigned station, hold, then follow the next room or completed tick.
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
      '<p class="task-feedback" role="status"></p><button type="button" class="task-use" disabled>Use <small>E</small></button>';
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
          !(
            e.target instanceof HTMLElement &&
            e.target.matches('input,textarea,select,[contenteditable]')
          )
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
        this.close(false);
        this.status.textContent = payload.error ?? 'Station check saved.';
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
    let nearby =
      active && own && !own.inVent && Boolean(this.info.role)
        ? nearestTask(this.renderer.map, this.info.tasks, own)
        : undefined;
    if (nearby?.station && !this.renderer.isPointVisible(nearby.station))
      nearby = undefined;
    this.candidate = nearby?.task.id;
    this.button.disabled = !nearby || this.isOpen || this.actionPending;
    this.button.setAttribute(
      'aria-label',
      nearby
        ? `Use ${nearby.task.type.replaceAll('-', ' ')} (E)`
        : 'Use: move closer to an unfinished task',
    );
    this.marker.clear();
    if (nearby?.station && !this.modal)
      this.marker
        .roundRect(nearby.station.x - 40, nearby.station.y - 40, 80, 80, 8)
        .stroke({ color: 0xe6a65a, width: 5 });
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
      '<header><h2 id="task-modal-title"></h2><button type="button" class="secondary" aria-label="Cancel task">×</button></header><div class="task-game"></div><p class="hint">Esc or × cancels this attempt. Earlier stages stay saved.</p>';
    const task = this.info.tasks.find((t) => t.id === this.opened!.taskId)!;
    modal.querySelector('h2')!.textContent =
      `${task.type.replaceAll('-', ' ')} · ${task.step}/${task.steps}`;
    if (this.info.fake) {
      modal.classList.add('is-fake-task');
      modal.querySelector('h2')!.textContent =
        `Fake task · ${task.type.replaceAll('-', ' ')}`;
      modal.querySelector('.hint')!.textContent =
        'Cover only. This procedure never advances crew progress. Esc or × closes it.';
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
      this.host.querySelector<HTMLElement>('.map-close')?.focus();
  }
  destroy() {
    this.close(true);
    this.events.abort();
    this.unsubscribe.forEach((off) => off());
    this.root.remove();
    this.marker.destroy();
  }
}
