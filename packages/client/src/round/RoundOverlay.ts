import type { MapDef } from '@mutiny/shared/maps';
import type { WalkRoom } from '../movement/Walkaround';
import type { RoundInfo } from './RoundInfo';
import './round.css';

/** Existing station UI extended with a private, three-second role announcement.
 * Large role text leads; teammate names and assignments follow. The map returns
 * when the server enters play, leaving a compact personal assignment disclosure.
 * Mint crew / coral impostor accents inherit the established station palette.
 */
export class RoundOverlay {
  private root = document.createElement('div');
  private reveal: HTMLElement;
  private assignment: HTMLDetailsElement;
  private signature = '';
  private timer: ReturnType<typeof setInterval>;
  private focusedReveal = false;
  private inertElements = new Map<HTMLElement, boolean>();
  private announced = '';
  constructor(
    host: HTMLElement,
    private readonly room: WalkRoom,
    private readonly info: RoundInfo,
    private readonly map: MapDef,
  ) {
    this.root.className = 'round-ui';
    this.root.innerHTML =
      '<section class="round-reveal" aria-labelledby="role-title" hidden><div class="role-card"><p class="role-kicker">Your role</p><h2 id="role-title">Receiving your role</h2><p class="role-purpose"></p><p class="role-team"></p><p class="role-countdown" role="status"></p></div></section><details class="round-assignment" hidden><summary>Your assignment</summary><p class="assignment-team"></p><ul></ul><p class="hint">Explore the station. Task interactions and impostor actions are coming in later builds.</p></details>';
    host.append(this.root);
    const total = document.createElement('label');
    total.className = 'crew-progress';
    total.innerHTML =
      'Crew tasks <span>0%</span><progress max="1" value="0" aria-label="Total crew task completion"></progress>';
    this.root.append(total);
    this.reveal = this.root.querySelector<HTMLElement>('.round-reveal')!;
    this.reveal.tabIndex = -1;
    const announcement = document.createElement('p');
    announcement.className = 'round-announcement';
    announcement.setAttribute('role', 'status');
    announcement.setAttribute('aria-atomic', 'true');
    this.root.append(announcement);
    this.assignment = this.root.querySelector<HTMLDetailsElement>('details')!;
    this.assignment.open = matchMedia('(min-width: 1000px)').matches;
    this.timer = setInterval(() => this.update(), 100);
    this.update();
  }
  private update() {
    const state = this.room.state;
    const active = state.phase === 'starting' || state.phase === 'playing';
    const known =
      active && this.info.roundId === state.roundId && Boolean(this.info.role);
    this.reveal.hidden = state.phase !== 'starting';
    this.assignment.hidden =
      state.phase !== 'playing' || state.sabotage?.kind === 'comms';
    this.root.querySelector<HTMLElement>('.crew-progress')!.hidden =
      state.phase !== 'playing' || state.sabotage?.kind === 'comms';
    this.root.querySelector<HTMLProgressElement>(
      '.crew-progress progress',
    )!.value = state.taskProgress;
    this.root.querySelector('.crew-progress span')!.textContent =
      `${Math.round(state.taskProgress * 100)}%`;
    if (!this.reveal.hidden) {
      for (const sibling of this.root.parentElement?.children ?? []) {
        if (
          sibling instanceof HTMLElement &&
          sibling !== this.root &&
          !this.inertElements.has(sibling)
        ) {
          this.inertElements.set(sibling, sibling.inert);
          sibling.inert = true;
        }
      }
      if (!this.focusedReveal && this.root.closest('dialog')?.open) {
        this.reveal.focus();
        this.focusedReveal = true;
      }
    } else {
      this.restoreInert();
      if (this.focusedReveal) {
        this.focusedReveal = false;
        const target =
          state.phase === 'playing'
            ? this.assignment.querySelector<HTMLElement>('summary')
            : this.root.parentElement?.querySelector<HTMLElement>('.map-close');
        target?.focus();
      }
    }
    const remaining = Math.max(
      0,
      Math.ceil((state.phaseEndsAt - Date.now()) / 1000),
    );
    const signature = JSON.stringify([
      state.phase,
      state.roundId,
      known,
      this.info.role,
      this.info.teammates,
      this.info.tasks,
      this.info.fake,
      remaining,
    ]);
    if (signature === this.signature) return;
    this.signature = signature;
    const impostor = known && this.info.role === 'impostor';
    this.root.classList.toggle('is-impostor', impostor);
    const role = !known
      ? 'Receiving your role'
      : impostor
        ? 'Impostor'
        : 'Crew';
    this.root.querySelector('#role-title')!.textContent = role;
    this.root.querySelector('.role-purpose')!.textContent = !known
      ? 'Waiting for your private assignment.'
      : impostor
        ? 'Blend in with the crew. Your task list is a cover.'
        : 'Keep the station running. Your assignments are private.';
    const team = !known
      ? ''
      : impostor
        ? this.info.teammates.length
          ? `Fellow impostor: ${this.info.teammates.map((player) => player.name).join(', ')}`
          : 'You are the only impostor.'
        : 'Stay alert. Impostors are hidden among the crew.';
    this.root.querySelector('.role-team')!.textContent = team;
    const announcement = known ? `Your role: ${role}. ${team}` : '';
    if (announcement !== this.announced) {
      this.announced = announcement;
      this.root.querySelector('.round-announcement')!.textContent =
        announcement;
    }
    this.root.querySelector('.role-countdown')!.textContent = remaining
      ? `Entering the station in ${remaining}…`
      : 'Waiting for the station…';
    this.assignment.querySelector('summary')!.textContent = known
      ? `${role} · ${this.info.fake ? 'Fake tasks' : 'Your tasks'} (${this.info.tasks.length})`
      : 'Waiting for your assignment…';
    this.assignment.querySelector('.assignment-team')!.textContent = team;
    this.assignment.querySelector('ul')!.replaceChildren(
      ...(known ? this.info.tasks : []).map((task) => {
        const item = document.createElement('li');
        const roomName =
          this.map.rooms.find((room) => room.id === task.room)?.name ??
          task.room;
        const title = task.type.replaceAll('-', ' ');
        item.textContent = `${task.completed ? '✓ ' : ''}${roomName}: ${title[0]!.toUpperCase()}${title.slice(1)}${task.steps > 1 ? ` (step ${task.step}/${task.steps})` : ''}${task.completed ? ' — Done' : ''}`;
        return item;
      }),
    );
    this.assignment.querySelector('.hint')!.textContent = this.info.fake
      ? 'Use fake stations as cover (E). Kill nearby crew (Q) when ready. Enter a nearby vent (V) to travel through its links.'
      : 'Walk within 80px of an assigned station, then press E or tap Use. Follow its instrument instructions; completed stages stay saved.';
  }
  destroy() {
    clearInterval(this.timer);
    this.restoreInert();
    this.root.remove();
  }
  private restoreInert() {
    for (const [element, inert] of this.inertElements) element.inert = inert;
    this.inertElements.clear();
  }
}
