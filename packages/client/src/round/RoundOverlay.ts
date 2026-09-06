import type { MapDef } from '@mutiny/shared/maps';
import type { WalkRoom } from '../movement/Walkaround';
import type { RoundInfo } from './RoundInfo';
import type { Renderer } from '../renderer/Renderer';
import type { CharacterAssets } from '../characters/assets';
import { engineerPortrait } from '../characters/portrait';
import './round.css';
import { inputInstruction, touchInput } from '../movement/inputHints';

/** THESIS: a private assignment unseals around your own engineer, then play begins.
 * OWN-WORLD: original numbered engineer art, mint crew and coral impostor accents.
 * STORY: identify your role and allies privately, then enter on the server countdown.
 * FIRST VIEWPORT: portrait beside role/purpose, full-width countdown below.
 * FORM: existing role overlay extended with a bounded 700ms unseal; no new world.
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
  private portraitKey = '';
  private presentation?: { renderer: Renderer; assets: CharacterAssets };
  setPresentation(renderer: Renderer, assets: CharacterAssets) {
    this.presentation = { renderer, assets };
    this.update();
  }
  constructor(
    host: HTMLElement,
    private readonly room: WalkRoom,
    private readonly info: RoundInfo,
    private readonly map: MapDef,
    private readonly onTrack?: (id: string) => void,
  ) {
    this.root.className = 'round-ui';
    this.root.innerHTML =
      '<section class="round-reveal" aria-labelledby="role-title" hidden><div class="role-card"><div class="role-portrait" aria-hidden="true"></div><div class="role-copy"><p class="role-kicker">Private assignment</p><h2 id="role-title">Receiving your role</h2><p class="role-purpose"></p><p class="role-team"></p></div><p class="role-countdown" role="status"></p></div></section><details class="round-assignment" hidden><summary>Your assignment</summary><p class="assignment-team"></p><ul></ul><p class="hint">Your assignment will appear when the round starts.</p></details>';
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
    this.assignment.open = matchMedia(
      '(min-width: 1000px) and (min-height: 600px)',
    ).matches;
    this.timer = setInterval(() => this.update(), 100);
    this.update();
  }
  private update() {
    const state = this.room.state;
    const active = state.phase === 'starting' || state.phase === 'playing';
    const known =
      active && this.info.roundId === state.roundId && Boolean(this.info.role);
    const own = state.players.get(this.room.sessionId);
    const portraitKey =
      known && own ? `${state.roundId}:${own.color}:${this.info.role}` : '';
    if (this.presentation && portraitKey !== this.portraitKey) {
      this.portraitKey = portraitKey;
      const portrait = this.root.querySelector('.role-portrait')!;
      portrait.replaceChildren();
      if (known && own) {
        const canvas = engineerPortrait(
          this.presentation.renderer,
          this.presentation.assets,
          own.color,
        );
        if (canvas) portrait.append(canvas);
      }
    }
    this.reveal.classList.toggle('is-known', Boolean(known));
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
      touchInput(),
      state.phase === 'starting' ? remaining : 0,
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
      ? `${this.info.fake ? 'Fake tasks' : 'Tasks'} · ${this.info.tasks.filter((task) => !task.completed).length} left`
      : 'Waiting for your assignment…';
    this.assignment.querySelector('.assignment-team')!.textContent = team;
    this.assignment.querySelector('ul')!.replaceChildren(
      ...(known ? this.info.tasks.filter((task) => !task.completed) : []).map(
        (task) => {
          const item = document.createElement('li');
          const roomName =
            this.map.rooms.find((room) => room.id === task.room)?.name ??
            task.room;
          const title = task.type.replaceAll('-', ' ');
          const button = document.createElement('button');
          button.className = 'assignment-destination secondary';
          button.textContent = `${roomName}: ${title[0]!.toUpperCase()}${title.slice(1)}${task.steps > 1 ? ` (step ${task.step}/${task.steps})` : ''}`;
          button.setAttribute(
            'aria-label',
            `${button.textContent}. Show on station map`,
          );
          button.onclick = () => this.onTrack?.(task.id);
          item.append(button);
          return item;
        },
      ),
    );
    this.assignment.querySelector('.hint')!.textContent = this.info.fake
      ? inputInstruction(
          'Tap Use at a fake task as cover. Tap Kill near crew when ready. Tap Vent to enter or exit.',
          'Use fake tasks as cover (E). Kill nearby crew (Q) when ready. Enter or exit a vent (V).',
        )
      : this.info.tasks.every((task) => task.completed)
        ? 'All your tasks are complete. Stay alert and help your crew.'
        : inputInstruction(
            'Tap a task to find its room. Follow mint diamonds, then tap Use at the station. Completed stages stay saved.',
            'Choose a task to find its room. Follow mint diamonds, then press E or click Use. Completed stages stay saved.',
          );
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
