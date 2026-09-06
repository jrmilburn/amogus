import type { TaskAssignment } from '@mutiny/shared';
import { HoldTask, type TaskMinigame } from '../TaskMinigame';
import {
  ActiveClock,
  GyroCalibration,
  MatchBoard,
  TransferProgress,
} from './models';
import './minigames.css';

export type TaskSound =
  'pick' | 'connect' | 'reject' | 'lock' | 'transfer-start' | 'complete';
export type TaskSoundHook = (cue: TaskSound) => void;
/** THESIS: each station is a different instrument, not another hold button.
 * OWN-WORLD: numbered cable ferrules, specimen bottles, a mint acceptance gauge,
 * and amber transfer terminals inherit the Hollow's cold-metal control panels.
 * STORY: match a circuit, catch three passes, carry data, or classify samples.
 * FIRST VIEWPORT: instructions above the working instrument, status below; 48px targets.
 * FORM: four tightly scoped inserts in the established task modal, no new visual world.
 */
export abstract class StationGame implements TaskMinigame {
  protected root = document.createElement('div');
  protected events = new AbortController();
  protected clock = new ActiveClock();
  protected status!: HTMLElement;
  protected elapsed = 0;
  private interval?: ReturnType<typeof setInterval>;
  private callback?: () => void;
  private solved = false;
  private finished = false;
  constructor(
    protected minimumMs: number,
    protected sound: TaskSoundHook,
  ) {}
  mount(container: HTMLElement, complete: () => void) {
    this.callback = complete;
    this.root.className = 'station-game';
    container.append(this.root);
    this.build();
    this.status = document.createElement('p');
    this.status.className = 'instrument-status';
    this.status.setAttribute('role', 'status');
    this.root.append(this.status);
    this.interval = setInterval(() => {
      const active = !document.hidden && document.hasFocus();
      this.elapsed = this.clock.tick(performance.now(), active);
      if (active && !this.finished) this.frame();
      if (this.solved && this.elapsed >= this.minimumMs && !this.finished) {
        this.finished = true;
        this.status.textContent = 'Complete. Confirming with the station…';
        this.sound('complete');
        this.callback?.();
      }
    }, 16);
    this.root.querySelector<HTMLElement>('button')?.focus();
  }
  protected solve() {
    this.solved = true;
    this.status.textContent = 'Procedure complete. Checking station…';
    this.root.querySelectorAll('button').forEach((button) => {
      button.disabled = true;
    });
  }
  protected abstract build(): void;
  protected frame() {}
  unmount() {
    this.events.abort();
    clearInterval(this.interval);
    this.callback = undefined;
    this.root.remove();
  }
}

/** Pointer drag and select-then-place share a model; keyboard never needs dragging. */
export class MatchingTask extends StationGame {
  private model: MatchBoard;
  private selected?: string;
  private board!: HTMLElement;
  private wires?: SVGSVGElement;
  private drag?: { id: number; label: string; x: number; y: number };
  private resize?: ResizeObserver;
  private ghost?: HTMLElement;
  private dragY = 0;
  constructor(
    private kind: 'power' | 'samples',
    minimumMs: number,
    sound: TaskSoundHook,
  ) {
    super(minimumMs, sound);
    this.model = new MatchBoard(
      kind === 'power'
        ? ['A1', 'B2', 'C3', 'D4']
        : ['ION', 'MOSS', 'SALT', 'IRON', 'ICE', 'SPORE'],
    );
  }
  protected build() {
    const power = this.kind === 'power';
    this.root.innerHTML = `<p>${power ? 'Drag each cable to its matching socket.' : 'Drag each labelled vial into its matching rack.'} Or select an item, then select its destination.</p><div class="matching-board ${power ? 'power-board' : 'sample-board'}"><div class="sources"></div><div class="destinations"></div></div>`;
    this.board = this.root.querySelector('.matching-board')!;
    if (power) {
      this.wires = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'svg',
      );
      this.wires.classList.add('cable-lines');
      this.wires.setAttribute('aria-hidden', 'true');
      this.board.prepend(this.wires);
    }
    const labels = this.model.labels;
    const destinations = [...labels.slice(2), ...labels.slice(0, 2)];
    const colors = [
      '#edaf60',
      '#8bdac9',
      '#aca7ec',
      '#ef9ba5',
      '#a5cde0',
      '#c9d19b',
    ];
    for (const [side, order] of [
      ['source', labels],
      ['destination', destinations],
    ] as const) {
      const column = this.board.querySelector(
        side === 'source' ? '.sources' : '.destinations',
      )!;
      for (const label of order) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset[side] = label;
        button.className =
          side === 'source' ? 'instrument-source' : 'instrument-destination';
        button.style.setProperty(
          '--item-color',
          colors[labels.indexOf(label)]!,
        );
        button.textContent = label;
        button.setAttribute(
          'aria-label',
          `${power ? (side === 'source' ? 'Cable' : 'Socket') : side === 'source' ? 'Vial' : 'Rack'} ${label}`,
        );
        if (side === 'source') button.setAttribute('aria-pressed', 'false');
        column.append(button);
        const options = { signal: this.events.signal };
        button.addEventListener(
          'click',
          () => {
            if (side === 'source') this.select(label);
            else this.place(label);
          },
          options,
        );
        if (side === 'source') {
          button.addEventListener(
            'pointerdown',
            (event) => {
              if (event.button !== 0 || this.drag) return;
              this.drag = {
                id: event.pointerId,
                label,
                x: event.clientX,
                y: event.clientY,
              };
              button.setPointerCapture(event.pointerId);
              this.select(label);
            },
            options,
          );
          button.addEventListener(
            'pointermove',
            (event) => {
              if (this.drag?.id !== event.pointerId) return;
              if (!this.ghost) {
                this.ghost = document.createElement('span');
                this.ghost.className = 'instrument-drag';
                this.ghost.textContent = label;
                this.ghost.setAttribute('aria-hidden', 'true');
                this.ghost.style.background = colors[labels.indexOf(label)]!;
                this.root.append(this.ghost);
              }
              this.ghost.style.left = `${event.clientX}px`;
              this.ghost.style.top = `${event.clientY}px`;
              this.dragY = event.clientY;
            },
            options,
          );
          button.addEventListener(
            'pointerup',
            (event) => {
              if (this.drag?.id !== event.pointerId) return;
              const drag = this.drag;
              this.drag = undefined;
              this.ghost?.remove();
              this.ghost = undefined;
              const target = document
                .elementFromPoint(event.clientX, event.clientY)
                ?.closest<HTMLElement>('[data-destination]');
              if (target && this.board.contains(target)) {
                this.place(target.dataset.destination!);
              } else if (
                Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 10
              )
                this.status.textContent =
                  'Not connected. Drop on the matching destination, or tap to select.';
            },
            options,
          );
          for (const name of ['pointercancel', 'lostpointercapture'])
            button.addEventListener(
              name,
              () => {
                this.drag = undefined;
                this.ghost?.remove();
                this.ghost = undefined;
              },
              options,
            );
        }
      }
    }
    this.resize = new ResizeObserver(() => this.drawCables());
    this.resize.observe(this.board);
  }
  private select(label: string) {
    if (this.model.matched.has(label)) return;
    this.selected = label;
    this.sound('pick');
    this.board
      .querySelectorAll<HTMLElement>('[data-source]')
      .forEach((node) =>
        node.setAttribute(
          'aria-pressed',
          String(node.dataset.source === label),
        ),
      );
    this.status.textContent = `${label} selected. Choose its matching ${this.kind === 'power' ? 'socket' : 'rack'}.`;
  }
  private place(label: string) {
    if (!this.selected) {
      this.status.textContent = 'Select a cable or vial first.';
      return;
    }
    if (!this.model.connect(this.selected, label)) {
      this.sound('reject');
      this.status.textContent = 'Labels do not match. Try another destination.';
      return;
    }
    this.sound('connect');
    this.board
      .querySelectorAll<HTMLButtonElement>(
        `[data-source="${label}"], [data-destination="${label}"]`,
      )
      .forEach((button) => {
        button.disabled = true;
        button.classList.add('is-matched');
        button.textContent = `${label} ✓`;
        button.setAttribute('aria-pressed', 'false');
      });
    this.selected = undefined;
    this.drawCables();
    this.status.textContent = `${this.model.matched.size} of ${this.model.labels.length} secured.`;
    if (this.model.complete) this.solve();
    else
      this.board
        .querySelector<HTMLElement>('[data-source]:not(:disabled)')
        ?.focus();
  }
  private drawCables() {
    if (!this.wires) return;
    const box = this.board.getBoundingClientRect();
    this.wires.replaceChildren();
    for (const label of this.model.matched) {
      const source = this.board.querySelector<HTMLElement>(
        `[data-source="${label}"]`,
      )!;
      const a = source.getBoundingClientRect();
      const b = this.board
        .querySelector(`[data-destination="${label}"]`)!
        .getBoundingClientRect();
      const path = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'path',
      );
      const x1 = a.right - box.left,
        y1 = a.top + a.height / 2 - box.top;
      const x2 = b.left - box.left,
        y2 = b.top + b.height / 2 - box.top;
      path.setAttribute(
        'd',
        `M${x1},${y1} C${x1 + 40},${y1} ${x2 - 40},${y2} ${x2},${y2}`,
      );
      path.setAttribute(
        'stroke',
        source.style.getPropertyValue('--item-color'),
      );
      this.wires.append(path);
    }
  }
  protected override frame() {
    if (!this.drag || !this.ghost) return;
    const modal = this.root.closest('dialog');
    if (!modal) return;
    const bounds = modal.getBoundingClientRect();
    if (this.dragY < bounds.top + 48) modal.scrollTop -= 5;
    else if (this.dragY > bounds.bottom - 48) modal.scrollTop += 5;
  }
  override unmount() {
    this.resize?.disconnect();
    super.unmount();
  }
}

export class GyroTask extends StationGame {
  private model!: GyroCalibration;
  private needle!: HTMLElement;
  private button!: HTMLButtonElement;
  private lastBand?: boolean;
  protected build() {
    this.model = new GyroCalibration(
      matchMedia('(prefers-reduced-motion: reduce)').matches ? 3600 : 2400,
    );
    this.root.innerHTML =
      '<p>Lock the needle inside the green centre band on three separate passes. Tap Lock or press Space/Enter.</p><div class="gyro-instrument" aria-hidden="true"><span class="gyro-band"></span><span class="gyro-needle"></span><span class="gyro-centre">LOCK ZONE</span></div><p class="gyro-locks">Locks: 0 / 3</p><button type="button" class="instrument-primary">Lock needle</button>';
    this.needle = this.root.querySelector('.gyro-needle')!;
    this.button = this.root.querySelector('button')!;
    this.button.addEventListener(
      'click',
      () => {
        if (document.hidden || !document.hasFocus()) return;
        const hit = this.model.tap(this.elapsed);
        this.sound(hit ? 'lock' : 'reject');
        this.status.textContent = hit
          ? 'Locked. Wait for the next pass.'
          : 'Missed or already locked this pass. Try the next centre crossing.';
        this.root.querySelector('.gyro-locks')!.textContent =
          `Locks: ${this.model.hits} / 3`;
        if (this.model.hits === 3) this.solve();
      },
      { signal: this.events.signal },
    );
  }
  protected override frame() {
    this.needle.style.left = `${this.model.position(this.elapsed) * 100}%`;
    const inside = this.model.inBand(this.elapsed);
    this.button.classList.toggle('in-band', inside);
    if (inside !== this.lastBand && this.model.hits < 3) {
      this.lastBand = inside;
      this.status.textContent = inside
        ? 'Needle in lock zone.'
        : 'Wait for the centre band.';
    }
  }
}

export class TransferTask extends StationGame {
  private transfer = new TransferProgress();
  private transferring = false;
  private progress!: HTMLProgressElement;
  private readout!: HTMLElement;
  constructor(
    private step: number,
    minimumMs: number,
    sound: TaskSoundHook,
  ) {
    super(minimumMs, sound);
  }
  protected build() {
    const action = this.step === 1 ? 'Download' : 'Upload';
    this.root.innerHTML = `<p>${action} the station archive. Keep this window open for eight seconds. Leaving cancels this transfer only.</p><div class="transfer-route" aria-hidden="true"><span>${this.step === 1 ? 'STATION' : 'PACK'}</span><span>→</span><span>${this.step === 1 ? 'PACK' : 'STATION'}</span></div><progress max="8000" value="0" aria-label="${action} progress"></progress><p class="transfer-readout">Ready · 8 seconds</p><button type="button" class="instrument-primary">Start ${action.toLowerCase()}</button>`;
    this.progress = this.root.querySelector('progress')!;
    this.readout = this.root.querySelector('.transfer-readout')!;
    const button = this.root.querySelector('button')!;
    button.addEventListener(
      'click',
      () => {
        if (!this.transfer.start(this.elapsed)) return;
        this.transferring = true;
        button.disabled = true;
        this.sound('transfer-start');
        this.status.textContent = `${action} started. Pauses when this tab is hidden or unfocused.`;
      },
      { signal: this.events.signal },
    );
  }
  protected override frame() {
    if (!this.transferring) return;
    const elapsed = this.transfer.progress(this.elapsed);
    this.progress.value = elapsed;
    this.readout.textContent = `${Math.floor(elapsed / 80)}% · ${Math.ceil((8000 - elapsed) / 1000)}s remaining`;
    if (elapsed === 8000) {
      this.transferring = false;
      this.solve();
    }
  }
}

export function createTaskGame(
  task: TaskAssignment,
  durationMs: number,
  sound: TaskSoundHook = () => {},
): TaskMinigame {
  switch (task.type) {
    case 'reroute-power':
      return new MatchingTask('power', durationMs, sound);
    case 'sort-samples':
      return new MatchingTask('samples', durationMs, sound);
    case 'calibrate-gyro':
      return new GyroTask(durationMs, sound);
    case 'data-transfer':
      return new TransferTask(task.step, durationMs, sound);
    default:
      return new HoldTask(durationMs);
  }
}
