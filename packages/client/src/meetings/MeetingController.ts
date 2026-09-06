import { Graphics } from 'pixi.js';
import {
  COLORS,
  nearestBody,
  emergencyUnavailable,
  meetingReachable,
  EMERGENCY_RADIUS,
  type ServerMessages,
} from '@mutiny/shared';
import type { WalkRoom } from '../movement/Walkaround';
import type { Renderer } from '../renderer/Renderer';
import type { TaskController } from '../tasks/TaskController';
import { CharacterView } from '../characters/CharacterView';
import type { CharacterAssets } from '../characters/assets';
import './meetings.css';
import { MeetingPanel } from './MeetingPanel';

/** THESIS: a discovery interrupts the station and names who called everyone back.
 * OWN-WORLD: existing coral report/amber emergency controls, original engineer atlas.
 * STORY: approach, call, see the caller and location, gather at Commons.
 * FIRST VIEWPORT: caller and reason lead into the timed roster, ballots and chat.
 * FORM: native protected-focus station dialog with a server-driven result sequence.
 */
export class MeetingController {
  private root = document.createElement('div');
  private report: HTMLButtonElement;
  private emergency: HTMLButtonElement;
  private feedback: HTMLElement;
  private modal?: HTMLDialogElement;
  private marker = new Graphics();
  private events = new AbortController();
  private off: (() => void)[] = [];
  private pending = false;
  private timer?: ReturnType<typeof setTimeout>;
  private meetingId = 0;
  private panel?: MeetingPanel;
  constructor(
    private host: HTMLDialogElement,
    private room: WalkRoom,
    private renderer: Renderer,
    private tasks: TaskController,
    private characters: CharacterAssets,
  ) {
    this.root.className = 'meeting-actions';
    this.root.innerHTML =
      '<p role="status"></p><button type="button" class="report-trigger">Report <small>F</small></button><button type="button" class="emergency-trigger">Emergency <small>C</small></button>';
    this.feedback = this.root.querySelector('p')!;
    [this.report, this.emergency] = [
      ...this.root.querySelectorAll('button'),
    ] as [HTMLButtonElement, HTMLButtonElement];
    host.append(this.root);
    renderer.layers.objects.addChild(this.marker);
    this.report.onclick = () => this.call('report');
    this.emergency.onclick = () => this.call('emergency');
    host.addEventListener(
      'keydown',
      (e) => {
        if (
          e.repeat ||
          e.altKey ||
          e.ctrlKey ||
          e.metaKey ||
          tasks.isOpen ||
          this.modal ||
          (e.target instanceof HTMLElement &&
            e.target.closest(
              'input,textarea,select,[contenteditable],dialog.task-modal',
            ))
        )
          return;
        if (e.code === 'KeyF' || e.code === 'KeyC') {
          e.preventDefault();
          this.call(e.code === 'KeyF' ? 'report' : 'emergency');
        }
      },
      { signal: this.events.signal },
    );
    this.off.push(
      room.onMessage<ServerMessages['error']>('error', (p) => {
        if (!this.pending) return;
        this.settle();
        this.feedback.dataset.error = 'true';
        this.feedback.textContent = p.message;
      }),
    );
    this.frame();
  }
  frame() {
    const state = this.room.state,
      own = state.players.get(this.room.sessionId);
    const active = state.phase === 'playing' && own?.alive && !own.inVent;
    this.root.hidden = !active;
    const body =
      active && own ? nearestBody(this.renderer.map, state, own) : undefined;
    const visible = body && this.renderer.isPointVisible(body);
    const close =
      active &&
      own &&
      meetingReachable(
        this.renderer.map,
        state,
        own,
        this.renderer.map.emergencyButton,
        EMERGENCY_RADIUS,
      );
    this.report.hidden = !visible;
    this.emergency.hidden = !close;
    this.report.disabled =
      !visible || this.pending || this.tasks.isOpen || this.tasks.actionPending;
    const reason = own
      ? emergencyUnavailable(this.renderer.map, state, own)
      : 'Meeting unavailable';
    this.emergency.disabled =
      !close ||
      Boolean(reason) ||
      this.pending ||
      this.tasks.isOpen ||
      this.tasks.actionPending;
    this.emergency.title = reason ?? 'Call everyone back to Commons';
    this.emergency.querySelector('small')!.textContent = own
      ? `C · ${Math.max(0, state.settings.emergencyMeetings - own.emergenciesUsed)} left`
      : 'C';
    this.feedback.hidden = !active;
    if (!this.pending && !this.feedback.dataset.error) {
      const message = close ? (reason ?? 'Call everyone back to Commons.') : '';
      if (this.feedback.textContent !== message)
        this.feedback.textContent = message;
    }
    this.marker.clear();
    if (visible)
      this.marker
        .roundRect(body.x - 38, body.y - 30, 76, 60, 8)
        .stroke({ color: 0xf59185, width: 4 });
    if (
      ['meeting', 'voting', 'ejection'].includes(state.phase) &&
      state.meeting
    ) {
      this.settle();
      if (!this.modal || this.meetingId !== state.meeting.id) {
        this.close();
        this.show();
      }
      this.modal!.querySelector<HTMLButtonElement>('[data-reset]')!.hidden =
        !own?.isHost;
      this.panel?.frame();
    } else if (this.modal) {
      this.close();
    }
    if (!active && this.pending) this.settle();
  }
  private call(kind: 'report' | 'emergency') {
    if (
      (kind === 'report' ? this.report : this.emergency).disabled ||
      (kind === 'report' ? this.report : this.emergency).hidden
    )
      return;
    const own = this.room.state.players.get(this.room.sessionId)!;
    if (kind === 'report') {
      const body = nearestBody(this.renderer.map, this.room.state, own);
      if (!body) return;
      this.room.send('report', {
        bodyId: body.id,
        roundId: this.room.state.roundId,
      });
    } else this.room.send('emergency', { roundId: this.room.state.roundId });
    this.pending = true;
    this.tasks.actionPending = true;
    this.feedback.textContent = 'Calling meeting…';
    delete this.feedback.dataset.error;
    this.timer = setTimeout(() => {
      if (this.pending) {
        this.settle();
        this.feedback.dataset.error = 'true';
        this.feedback.textContent = 'Meeting did not respond. Try again.';
      }
    }, 5000);
    this.frame();
  }
  private show() {
    const meeting = this.room.state.meeting!;
    this.meetingId = meeting.id;
    const d = document.createElement('dialog');
    this.modal = d;
    d.className = 'task-modal meeting-intro';
    d.setAttribute('aria-labelledby', 'meeting-title');
    d.innerHTML =
      '<header><h2 id="meeting-title" tabindex="-1"></h2><button type="button" class="secondary" data-back>Back</button></header><div class="meeting-caller"><div class="meeting-portrait"></div><div><p class="meeting-name"></p><p class="meeting-location"></p></div></div><button type="button" class="secondary" data-reset hidden>Reset round to lobby</button><p class="meeting-reset-status" role="status"></p>';
    const title =
      meeting.reason === 'report' ? 'Dead body reported' : 'Emergency meeting';
    d.querySelector('h2')!.textContent = title;
    const color = COLORS.find((c) => c.id === meeting.callerColor)!;
    d.querySelector('.meeting-name')!.textContent =
      `Called by ${meeting.callerName} · ${color.name} #${color.number}`;
    const bodyColor = COLORS.find((c) => c.id === meeting.bodyColor);
    d.querySelector('.meeting-location')!.textContent =
      meeting.reason === 'report'
        ? `${bodyColor?.name ?? 'Crew'} body · ${meeting.location}`
        : `Emergency button · ${meeting.location}`;
    const portrait = new CharacterView(
      this.characters,
      '',
      meeting.callerColor,
    );
    portrait.nameTag.visible = false;
    try {
      const canvas = this.renderer.app.renderer.extract.canvas({
        target: portrait,
        resolution: 2,
      });
      if (canvas instanceof HTMLCanvasElement) {
        canvas.setAttribute('role', 'img');
        canvas.setAttribute(
          'aria-label',
          `${meeting.callerName}'s ${color.name} engineer`,
        );
        d.querySelector('.meeting-portrait')!.append(canvas);
      }
    } catch (error) {
      console.warn('Meeting portrait could not render:', error);
      d.querySelector('.meeting-portrait')!.textContent =
        `${color.name} engineer #${color.number}`;
    } finally {
      portrait.destroy({ children: true });
    }
    const back = () =>
      this.host.querySelector<HTMLButtonElement>('.map-close')!.click();
    d.querySelector<HTMLButtonElement>('[data-back]')!.onclick = back;
    d.addEventListener('cancel', (e) => {
      e.preventDefault();
      e.stopPropagation();
      back();
    });
    d.querySelector<HTMLButtonElement>('[data-reset]')!.onclick = () => {
      this.room.send('cancelStart', {});
      d.querySelector('.meeting-reset-status')!.textContent =
        'Requesting lobby reset…';
    };
    this.panel = new MeetingPanel(d, this.room, this.renderer, this.characters);
    this.host.append(d);
    d.showModal();
    d.querySelector<HTMLElement>(
      this.room.state.phase === 'ejection' ? '#ejection-title' : 'h2',
    )!.focus();
  }
  private settle() {
    clearTimeout(this.timer);
    if (this.pending) this.tasks.actionPending = false;
    this.pending = false;
  }
  private close() {
    this.panel?.destroy();
    this.panel = undefined;
    const open = Boolean(this.modal);
    this.modal?.close();
    this.modal?.remove();
    this.modal = undefined;
    if (open && this.host.open)
      this.host.querySelector<HTMLElement>('.map-close')?.focus();
  }
  destroy() {
    this.settle();
    this.close();
    this.events.abort();
    this.off.forEach((f) => f());
    this.root.remove();
    this.marker.destroy();
  }
}
