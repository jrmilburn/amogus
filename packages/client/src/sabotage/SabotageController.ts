import { Graphics } from 'pixi.js';
import {
  repairPointMatches,
  type ClientMessages,
  type ServerMessages,
} from '@mutiny/shared';
import type { WalkRoom, Walkaround } from '../movement/Walkaround';
import type { Renderer } from '../renderer/Renderer';
import type { RoundInfo } from '../round/RoundInfo';
import type { TaskController } from '../tasks/TaskController';
import { faultLabels, repairCandidate, secondsLeft } from './model';
import './sabotage.css';

/** THESIS: a failing station creates a clear destination and one physical repair.
 * OWN-WORLD: coral fault strip, station floor plan, switches, code and hold panels.
 * FORM: extend the existing HUD; native dialogs contain focus and pause movement.
 * FIRST VIEWPORT: fault above navigation, contextual Repair above the action row.
 */
export class SabotageController {
  private root = document.createElement('div');
  private banner = document.createElement('div');
  private marker = new Graphics();
  private sabotageButton: HTMLButtonElement;
  private repairButton: HTMLButtonElement;
  private feedback: HTMLElement;
  private modal?: HTMLDialogElement;
  private opened?: ServerMessages['repairOpened'];
  private pending = false;
  private requestPending = false;
  private command?: ClientMessages['sabotage'];
  private timer?: ReturnType<typeof setTimeout>;
  private holding = false;
  private heartbeat = 0;
  private events = new AbortController();
  private off: (() => void)[] = [];
  constructor(
    private host: HTMLDialogElement,
    private room: WalkRoom,
    private info: RoundInfo,
    private renderer: Renderer,
    private walk: Walkaround,
    private tasks: TaskController,
  ) {
    this.root.className = 'sabotage-actions';
    this.root.innerHTML =
      '<p role="status"></p><button type="button" class="secondary">Repair <small>R</small></button><button type="button" class="sabotage-trigger">Sabotage <small>B</small></button>';
    this.feedback = this.root.querySelector('p')!;
    [this.repairButton, this.sabotageButton] = [
      ...this.root.querySelectorAll('button'),
    ] as [HTMLButtonElement, HTMLButtonElement];
    this.banner.className = 'sabotage-alert';
    this.banner.innerHTML =
      '<strong role="status"></strong><span role="timer" aria-live="off"></span>';
    this.banner.hidden = true;
    host.append(this.banner, this.root);
    renderer.layers.objects.addChild(this.marker);
    this.sabotageButton.onclick = () => this.showMap();
    this.repairButton.onclick = () => this.openRepair();
    const signal = this.events.signal;
    host.addEventListener(
      'keydown',
      (e) => {
        if (
          e.repeat ||
          e.altKey ||
          e.ctrlKey ||
          e.metaKey ||
          this.modal ||
          this.pending ||
          (e.target instanceof HTMLElement &&
            e.target.closest(
              'input,textarea,select,[contenteditable],.task-modal',
            ))
        )
          return;
        if (e.code === 'KeyB' || e.code === 'KeyR') {
          e.preventDefault();
          if (e.code === 'KeyB') this.showMap();
          else this.openRepair();
        }
      },
      { signal },
    );
    window.addEventListener('blur', () => this.release(), { signal });
    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.hidden) this.release();
      },
      { signal },
    );
    this.off.push(
      room.onMessage<ServerMessages['repairOpened']>('repairOpened', (p) => {
        if (
          !this.pending ||
          p.roundId !== room.state.roundId ||
          room.state.phase !== 'playing'
        ) {
          room.send('cancelRepair', { token: p.token });
          return;
        }
        clearTimeout(this.timer);
        this.pending = false;
        this.opened = p;
        this.showRepair();
      }),
    );
    this.off.push(
      room.onMessage<ServerMessages['repairClosed']>('repairClosed', (p) => {
        if (p.token !== this.opened?.token) return;
        this.close(false);
        this.feedback.textContent = p.error ?? 'Panel check saved.';
      }),
    );
    this.off.push(
      room.onMessage<ServerMessages['error']>('error', (p) => {
        if (this.pending) this.close(true);
        else if (!this.modal) return;
        this.requestPending = false;
        this.command = undefined;
        clearTimeout(this.timer);
        (
          this.modal?.querySelector('.repair-status') ?? this.feedback
        ).textContent = p.message;
      }),
    );
    this.frame();
  }
  frame() {
    const state = this.room.state,
      fault = state.sabotage;
    const own = state.players.get(this.room.sessionId);
    const active =
      state.phase === 'playing' && this.info.roundId === state.roundId;
    const canAct = active && own?.alive && !own.inVent;
    if (
      (!canAct || (this.opened && this.opened.sabotageId !== fault?.id)) &&
      (this.modal || this.pending)
    )
      this.close(true);
    this.root.hidden = !canAct;
    this.host.classList.toggle('has-sabotage-controls', active);
    this.sabotageButton.hidden = this.info.role !== 'impostor';
    this.sabotageButton.disabled =
      !canAct || this.tasks.isOpen || this.tasks.actionPending;
    const candidate =
      canAct && own
        ? repairCandidate(this.renderer.map, state, own)
        : undefined;
    this.repairButton.hidden = !fault;
    this.repairButton.disabled =
      !candidate || this.tasks.isOpen || this.tasks.actionPending;
    this.repairButton.title = candidate
      ? 'Open this repair panel (R)'
      : 'Move close to a highlighted repair panel';
    this.renderer.setVisionMultiplier(fault?.kind === 'lights' ? 0.25 : 1);
    this.marker.clear();
    if (fault && active)
      for (const p of this.renderer.map.sabotagePoints) {
        if (
          repairPointMatches(fault.kind, p.kind) &&
          !fault.fixedPoints.includes(p.id) &&
          this.renderer.isPointVisible(p)
        )
          this.marker
            .roundRect(p.x - 42, p.y - 42, 84, 84, 8)
            .stroke({ color: 0xf59185, width: 5 });
      }
    const ended =
      state.phase === 'ended' && Boolean(state.endReason) && !state.finalResult;
    this.banner.hidden = !fault && !ended;
    this.host.classList.toggle('has-sabotage-alert', !this.banner.hidden);
    this.banner.classList.toggle('is-critical', Boolean(fault?.endsAt));
    const alertTitle = ended
      ? `Impostors win — ${state.endReason === 'reactor' ? 'reactor meltdown' : 'oxygen depleted'}`
      : fault
        ? faultLabels[fault.kind]
        : '';
    const titleNode = this.banner.querySelector('strong')!;
    if (titleNode.textContent !== alertTitle)
      titleNode.textContent = alertTitle;
    this.banner.querySelector('span')!.textContent = ended
      ? 'Back → host can reset the round'
      : fault?.endsAt
        ? `${secondsLeft(fault.endsAt, state.serverNow)}s · ${fault.kind === 'reactor' ? 'Reactor Well: hold both panels' : 'Scrubber + Cryo: enter both codes'}`
        : fault?.kind === 'lights'
          ? 'Switchyard · Match all five switches'
          : fault?.kind === 'comms'
            ? 'Relay · Hold to restore task tracking'
            : '';
    if (this.modal?.classList.contains('sabotage-map-modal')) {
      if (
        this.command &&
        (this.command.kind === 'doors'
          ? state.closedDoors.has(this.command.roomId!)
          : fault?.kind === this.command.kind)
      ) {
        this.modal.querySelector('.repair-status')!.textContent =
          this.command.kind === 'doors'
            ? 'Room doors sealed for 10 seconds.'
            : `${faultLabels[this.command.kind]}. Command confirmed.`;
        this.requestPending = false;
        this.command = undefined;
        clearTimeout(this.timer);
      }
      const cooldown = secondsLeft(state.sabotageReadyAt, state.serverNow);
      for (const b of this.modal.querySelectorAll<HTMLButtonElement>(
        '[data-system]',
      ))
        b.disabled = Boolean(fault) || cooldown > 0 || this.requestPending;
      this.modal.querySelector('.system-status')!.textContent = fault
        ? 'Repair the current fault before sabotaging another system.'
        : cooldown
          ? `System controls ready in ${cooldown}s`
          : 'System controls ready';
      const doorWait = secondsLeft(state.doorsReadyAt, state.serverNow);
      const door = this.modal.querySelector<HTMLButtonElement>('[data-seal]')!;
      door.disabled = doorWait > 0 || this.requestPending;
      door.textContent = doorWait
        ? `Doors ready in ${doorWait}s`
        : 'Seal doors · 10s';
    }
    if (this.opened && this.modal && fault) {
      const deadline =
        this.modal.querySelector<HTMLElement>('.repair-deadline')!;
      deadline.hidden = !fault.endsAt;
      deadline.textContent = fault.endsAt
        ? `${secondsLeft(fault.endsAt, state.serverNow)}s until system failure`
        : '';
      for (const b of this.modal.querySelectorAll<HTMLButtonElement>(
        '[data-switch]',
      )) {
        const i = Number(b.dataset.switch),
          on = fault.switches[i];
        b.setAttribute('aria-pressed', String(on));
        b.textContent = `${i + 1}: ${on ? 'ON' : 'OFF'} · target ${fault.targetSwitches[i] ? 'ON' : 'OFF'}`;
      }
      const progress = this.modal.querySelector('progress');
      if (progress) progress.value = fault.holdProgress;
      const holdStatus = this.modal.querySelector('.hold-status');
      if (holdStatus)
        holdStatus.textContent =
          fault.kind === 'reactor'
            ? `${fault.heldPoints.length}/2 panels held · ${Math.round(fault.holdProgress * 100)}%`
            : `${Math.round(fault.holdProgress * 100)}% restored`;
      if (this.holding && performance.now() - this.heartbeat >= 250) {
        this.fix({ action: 'hold' });
        this.heartbeat = performance.now();
      }
    }
  }
  private dialog(title: string) {
    this.tasks.externalOpen = true;
    this.walk.setTaskOpen(true);
    this.feedback.textContent = '';
    const d = document.createElement('dialog');
    this.modal = d;
    d.className = 'task-modal repair-modal';
    d.setAttribute('aria-labelledby', 'repair-title');
    d.innerHTML =
      '<header><h2 id="repair-title"></h2><button type="button" class="secondary" aria-label="Close panel">×</button></header><p class="repair-deadline" role="timer" aria-live="off" hidden></p><div class="repair-content"></div><p class="repair-status" role="status"></p>';
    d.querySelector('h2')!.textContent = title;
    d.querySelector('button')!.onclick = () => this.close(true);
    d.addEventListener('cancel', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.close(true);
    });
    this.host.append(d);
    d.showModal();
    return d.querySelector<HTMLElement>('.repair-content')!;
  }
  private showMap() {
    if (this.sabotageButton.disabled || this.sabotageButton.hidden) return;
    const content = this.dialog('Sabotage · The Hollow');
    this.modal!.classList.add('sabotage-map-modal');
    content.innerHTML =
      '<p class="system-status"></p><div class="sabotage-chart"></div><label for="seal-room">Room doors</label><div class="door-controls"><select id="seal-room"></select><button type="button" data-seal>Seal doors · 10s</button></div><p class="hint">Systems: 30s cooldown after repair. Doors: separate 15s cooldown. Occupied doorways cannot seal.</p>';
    const chart = content.querySelector('.sabotage-chart')!,
      map = this.renderer.map;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${map.size.width} ${map.size.height}`);
    svg.setAttribute('aria-hidden', 'true');
    for (const corridor of map.corridors) {
      const r = document.createElementNS(svg.namespaceURI, 'rect');
      for (const k of ['x', 'y', 'width', 'height'] as const)
        r.setAttribute(k, String(corridor[k]));
      svg.append(r);
    }
    for (const r of map.rooms) {
      const p = document.createElementNS(svg.namespaceURI, 'polygon');
      p.setAttribute('points', r.polygon.map((p) => `${p.x},${p.y}`).join(' '));
      svg.append(p);
    }
    chart.append(svg);
    for (const kind of ['lights', 'reactor', 'o2', 'comms'] as const) {
      const p = map.sabotagePoints.find((p) =>
        repairPointMatches(kind, p.kind),
      )!;
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.system = kind;
      b.textContent = `${kind === 'o2' ? 'O₂' : kind[0]!.toUpperCase() + kind.slice(1)} · ${map.rooms.find((r) => r.id === p.room)!.name}`;
      b.style.left = `${Math.max(20, Math.min(80, (p.x / map.size.width) * 100))}%`;
      b.style.top = `${Math.max(12, Math.min(88, (p.y / map.size.height) * 100))}%`;
      b.onclick = () =>
        this.activate({ kind, roundId: this.room.state.roundId });
      chart.append(b);
    }
    const select = content.querySelector('select')!;
    for (const r of map.rooms.filter((r) =>
      map.doors.some((d) => d.room === r.id),
    )) {
      const o = document.createElement('option');
      o.value = r.id;
      o.textContent = r.name;
      select.append(o);
    }
    content.querySelector<HTMLButtonElement>('[data-seal]')!.onclick = () =>
      this.activate({
        kind: 'doors',
        roomId: select.value,
        roundId: this.room.state.roundId,
      });
    this.frame();
  }
  private activate(payload: ClientMessages['sabotage']) {
    if (this.requestPending) return;
    this.room.send('sabotage', payload);
    // Public state confirms activation; leave the chart open for independent door controls.
    this.requestPending = true;
    this.command = payload;
    this.modal!.querySelector('.repair-status')!.textContent =
      'Sending command…';
    this.timer = setTimeout(() => {
      this.requestPending = false;
      this.command = undefined;
      if (this.modal)
        this.modal.querySelector('.repair-status')!.textContent =
          'Command not confirmed. Check your connection and try again.';
    }, 5000);
    this.frame();
  }
  private openRepair() {
    if (this.repairButton.disabled || this.repairButton.hidden) return;
    const own = this.room.state.players.get(this.room.sessionId)!;
    const p = repairCandidate(this.renderer.map, this.room.state, own),
      fault = this.room.state.sabotage;
    if (!p || !fault) return;
    this.pending = true;
    this.tasks.externalOpen = true;
    this.walk.setTaskOpen(true);
    this.feedback.textContent = 'Opening repair panel…';
    this.room.send('openRepair', {
      pointId: p.id,
      sabotageId: fault.id,
      roundId: this.room.state.roundId,
    });
    this.timer = setTimeout(() => {
      if (this.pending) {
        this.close(true);
        this.feedback.textContent = 'Panel did not respond. Try again.';
      }
    }, 5000);
  }
  private showRepair() {
    const kind = this.room.state.sabotage?.kind;
    if (!kind) {
      this.close(true);
      return;
    }
    const point = this.renderer.map.sabotagePoints.find(
      (p) => p.id === this.opened!.pointId,
    )!;
    const roomName = this.renderer.map.rooms.find(
      (r) => r.id === point.room,
    )!.name;
    const content = this.dialog(
      `${faultLabels[kind]} · ${roomName}${kind === 'reactor' ? ` · Panel ${point.kind.endsWith('-a') ? 'A' : 'B'}` : ''}`,
    );
    if (kind === 'lights') {
      content.innerHTML =
        '<p>Match each switch to its target. Everyone at this panel shares the same controls.</p><div class="repair-switches"></div>';
      for (let i = 0; i < 5; i++) {
        const b = document.createElement('button');
        b.type = 'button';
        b.dataset.switch = String(i);
        b.onclick = () => this.fix({ action: 'switch', switchIndex: i });
        content.querySelector('div')!.append(b);
      }
    } else if (kind === 'o2') {
      content.innerHTML =
        '<p>Enter this panel’s five-digit code. Both panels must be restored.</p><p class="repair-code"></p><form><label for="oxygen-code">Panel code</label><input id="oxygen-code" inputmode="numeric" pattern="[0-9]{5}" maxlength="5" minlength="5" autocomplete="off" required><button type="submit">Restore this panel</button></form>';
      content.querySelector('.repair-code')!.textContent = this.opened!.code!;
      content.querySelector('form')!.onsubmit = (e) => {
        e.preventDefault();
        this.fix({
          action: 'code',
          code: content.querySelector('input')!.value,
        });
      };
      content.querySelector('input')!.focus();
    } else {
      content.innerHTML = `<p>${kind === 'reactor' ? 'Two different players must hold the two reactor panels together for 3 continuous seconds.' : 'Hold this panel for 5 continuous seconds to restore task tracking.'}</p><button type="button" class="task-hold">Hold to restore</button><progress max="1" value="0" aria-label="Repair progress"></progress><p class="hold-status"></p><p class="hint">Release or leave the window to interrupt the hold.</p>`;
      const b = content.querySelector('button')!;
      const start = () => {
        if (this.holding) return;
        this.holding = true;
        this.heartbeat = performance.now();
        this.fix({ action: 'hold' });
      };
      b.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        b.focus();
        b.setPointerCapture(e.pointerId);
        start();
      });
      for (const event of [
        'pointerup',
        'pointercancel',
        'lostpointercapture',
        'blur',
      ])
        b.addEventListener(event, () => this.release());
      b.addEventListener('keydown', (e) => {
        if (['Space', 'Enter'].includes(e.code)) {
          e.preventDefault();
          if (!e.repeat) start();
        }
      });
      b.addEventListener('keyup', (e) => {
        if (['Space', 'Enter'].includes(e.code)) {
          e.preventDefault();
          this.release();
        }
      });
    }
    this.frame();
  }
  private fix(
    action: Pick<
      ClientMessages['fixSabotage'],
      'action' | 'code' | 'switchIndex'
    >,
  ) {
    if (
      !this.opened ||
      !this.room.connection.isOpen ||
      this.room.state.phase !== 'playing' ||
      this.room.state.sabotage?.id !== this.opened.sabotageId
    )
      return;
    const { pointId, sabotageId, roundId, token } = this.opened;
    this.room.send('fixSabotage', {
      pointId,
      sabotageId,
      roundId,
      token,
      ...action,
    });
  }
  private release() {
    if (this.holding) {
      this.holding = false;
      this.fix({ action: 'release' });
    }
  }
  private close(cancel: boolean) {
    if (cancel) this.release();
    else this.holding = false;
    clearTimeout(this.timer);
    if (
      this.room.connection.isOpen &&
      (this.pending || (cancel && this.opened))
    )
      this.room.send('cancelRepair', { token: this.opened?.token ?? null });
    this.pending = false;
    this.requestPending = false;
    this.command = undefined;
    this.opened = undefined;
    const hadModal = Boolean(this.modal);
    this.modal?.close();
    this.modal?.remove();
    this.modal = undefined;
    this.tasks.externalOpen = false;
    this.walk.setTaskOpen(false);
    if (hadModal && this.host.open)
      this.host.querySelector<HTMLElement>('.map-close')?.focus();
  }
  destroy() {
    this.close(true);
    this.events.abort();
    this.off.forEach((off) => off());
    this.root.remove();
    this.banner.remove();
    this.marker.destroy();
    this.renderer.setVisionMultiplier(1);
    this.host.classList.remove('has-sabotage-alert', 'has-sabotage-controls');
  }
}
