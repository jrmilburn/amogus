import { COLORS, type ServerMessages } from '@mutiny/shared';
import type { WalkRoom } from '../movement/Walkaround';
import type { RoundInfo } from './RoundInfo';
import type { Renderer } from '../renderer/Renderer';
import type { CharacterAssets } from '../characters/assets';
import { CharacterView } from '../characters/CharacterView';
import './afterlife.css';
export const END_REASONS = {
  tasks: 'All crew tasks completed.',
  noImpostors: 'No living impostors remain.',
  parity: 'Impostors reached parity with the crew.',
  reactor: 'Reactor meltdown.',
  o2: 'Oxygen depleted.',
};
/** THESIS: death changes your job; the final result explains who won and why.
 * OWN-WORLD: original engineer lineup, mint victory/coral defeat, station dialogs.
 * STORY: ghosts finish tasks privately, then everyone sees the revealed teams.
 * FIRST VIEWPORT: winning lineup under a personal result, with host Play again.
 * FORM: existing protected-focus dialog and a compact dead-only chat disclosure.
 */
export class Afterlife {
  private modal?: HTMLDialogElement;
  private chat = document.createElement('details');
  private last = 0;
  private pending?: { text: string; after: number };
  private timer?: ReturnType<typeof setTimeout>;
  private off: () => void;
  constructor(
    private host: HTMLDialogElement,
    private room: WalkRoom,
    private info: RoundInfo,
    private renderer: Renderer,
    private characters: CharacterAssets,
  ) {
    this.chat.className = 'ghost-chat';
    this.chat.innerHTML =
      '<summary>Ghost chat · dead players only</summary><p>Walk through walls and finish your tasks. Living players cannot see you or this chat.</p><div role="log" aria-label="Ghost messages" tabindex="0"></div><form><label for="ghost-message">Message · 200 characters</label><input id="ghost-message" maxlength="200" required autocomplete="off"><button>Send</button></form><p class="ghost-status" role="status"></p>';
    host.append(this.chat);
    this.chat.querySelector('form')!.onsubmit = (e) => {
      e.preventDefault();
      if (this.pending) return;
      const input = this.chat.querySelector('input')!;
      if (!input.value.trim()) return;
      this.pending = { text: input.value, after: this.last };
      this.room.send('ghostChat', {
        roundId: room.state.roundId,
        text: input.value,
      });
      this.chat.querySelector('button')!.disabled = true;
      this.timer = setTimeout(() => {
        this.pending = undefined;
        this.chat.querySelector('button')!.disabled = false;
        this.status('No confirmation. Try again.');
      }, 5000);
    };
    this.off = room.onMessage<ServerMessages['error']>('error', (p) => {
      if (this.pending) {
        this.pending = undefined;
        clearTimeout(this.timer);
        this.chat.querySelector('button')!.disabled = false;
        this.status(p.message);
      }
    });
    this.frame();
  }
  private status(text: string) {
    this.chat.querySelector('.ghost-status')!.textContent = text;
  }
  frame() {
    const state = this.room.state,
      own = state.players.get(this.room.sessionId);
    this.chat.hidden =
      !own ||
      own.alive ||
      !['playing', 'meeting', 'voting', 'ejection'].includes(state.phase);
    const parent = this.host.querySelector('.meeting-intro') ?? this.host;
    if (this.chat.parentElement !== parent) parent.append(this.chat);
    const log = this.chat.querySelector<HTMLElement>('[role=log]')!;
    const atEnd = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
    let added = false;
    for (const msg of this.info.ghostMessages) {
      if (msg.id <= this.last) continue;
      const p = document.createElement('p');
      p.textContent = `${msg.name}: ${msg.text}`;
      log.append(p);
      this.last = msg.id;
      added = true;
      if (
        this.pending &&
        msg.id > this.pending.after &&
        msg.senderId === roomId(this.room)
      ) {
        if (this.chat.querySelector('input')!.value === this.pending.text)
          this.chat.querySelector('input')!.value = '';
        this.pending = undefined;
        clearTimeout(this.timer);
        this.chat.querySelector('button')!.disabled = false;
        this.status('Sent to ghosts.');
      }
    }
    while (log.childElementCount > 100) log.firstElementChild!.remove();
    if (added && atEnd) log.scrollTop = log.scrollHeight;
    if (state.phase === 'lobby') {
      this.last = 0;
      log.replaceChildren();
      this.pending = undefined;
      clearTimeout(this.timer);
      this.chat.querySelector('button')!.disabled = false;
      this.chat.querySelector('input')!.value = '';
      this.status('');
    }
    if (state.phase === 'ended' && state.finalResult) {
      if (!this.modal)
        this.show(JSON.parse(state.finalResult) as ServerMessages['gameOver']);
      this.modal!.querySelector<HTMLButtonElement>('[data-again]')!.hidden =
        !own?.isHost;
    } else if (this.modal) {
      this.modal.close();
      this.modal.remove();
      this.modal = undefined;
      this.host.querySelector<HTMLElement>('.map-close')?.focus();
    }
  }
  private show(result: ServerMessages['gameOver']) {
    const d = document.createElement('dialog');
    this.modal = d;
    d.className = 'task-modal round-finish';
    d.setAttribute('aria-labelledby', 'finish-title');
    const victory = result.roles[this.room.sessionId] === result.winner;
    d.classList.toggle('is-victory', victory);
    d.innerHTML =
      '<header><h2 id="finish-title" tabindex="-1"></h2><button class="secondary" data-back>Back</button></header><p class="finish-reason"></p><h3>Winning team</h3><div class="winning-lineup"></div><details><summary>All roles revealed</summary><ul></ul></details><button data-again>Play again</button><p class="hint">The host can start another round with the same room and settings.</p>';
    d.querySelector('h2')!.textContent = victory ? 'Victory' : 'Defeat';
    d.querySelector('.finish-reason')!.textContent = END_REASONS[result.reason];
    for (const p of result.lineup) {
      const color = COLORS.find((c) => c.id === p.color)!;
      const li = document.createElement('li');
      li.textContent = `${p.name} · ${color.name} #${color.number} · ${p.role}`;
      d.querySelector('ul')!.append(li);
      if (p.role !== result.winner) continue;
      const figure = document.createElement('figure'),
        caption = document.createElement('figcaption');
      caption.textContent = `${p.name} · #${color.number}`;
      const view = new CharacterView(this.characters, '', p.color);
      view.nameTag.visible = false;
      try {
        const canvas = this.renderer.app.renderer.extract.canvas({
          target: view,
          resolution: 2,
        });
        if (canvas instanceof HTMLCanvasElement) {
          canvas.setAttribute('aria-hidden', 'true');
          figure.append(canvas);
        }
      } catch (error) {
        console.warn('Lineup portrait unavailable:', error);
      } finally {
        view.destroy({ children: true });
      }
      figure.append(caption);
      d.querySelector('.winning-lineup')!.append(figure);
    }
    const back = () =>
      this.host.querySelector<HTMLButtonElement>('.map-close')!.click();
    d.querySelector<HTMLButtonElement>('[data-back]')!.onclick = back;
    d.addEventListener('cancel', (e) => {
      e.preventDefault();
      e.stopPropagation();
      back();
    });
    d.querySelector<HTMLButtonElement>('[data-again]')!.onclick = () =>
      this.room.send('cancelStart', {});
    this.host.append(d);
    d.showModal();
    d.querySelector<HTMLElement>('h2')!.focus();
  }
  destroy() {
    clearTimeout(this.timer);
    this.off();
    this.modal?.close();
    this.modal?.remove();
    this.chat.remove();
  }
}
function roomId(room: WalkRoom) {
  return room.sessionId;
}
