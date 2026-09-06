import { COLORS, MAX_PLAYERS, type ServerMessages } from '@mutiny/shared';
import type { WalkRoom } from '../movement/Walkaround';
import { lobbyRequirement } from './entry';
import './boarding.css';

/** THESIS: waiting is a shared place, with departure controls within reach.
 * OWN-WORLD: the existing station floor, suit racks, numbered engineers and amber controls.
 * STORY: join, move with friends, invite and mark ready; the host starts the round.
 * FIRST VIEWPORT: boarding room with compact invitation/launch controls at the right.
 * FORM: local extension of the existing walkaround and lobby, not a new visual world.
 */
export class BoardingLobby {
  private root = document.createElement('section');
  private off: () => void;
  private destroyed = false;
  private rosterKey = '';
  constructor(
    host: HTMLElement,
    private room: WalkRoom,
  ) {
    this.root.className = 'boarding-controls';
    this.root.tabIndex = 0;
    this.root.setAttribute('aria-label', 'Waiting lobby controls');
    this.root.innerHTML =
      '<div class="boarding-invite"><p class="boarding-code"></p><button class="secondary" data-copy>Copy invite</button></div><details class="boarding-crew"><summary>Crew aboard</summary><ul></ul></details><label class="boarding-fallback" hidden>Copy this link<input readonly></label><p class="boarding-help" id="boarding-help"></p><div class="boarding-actions"><button class="secondary" data-ready aria-pressed="false">Mark ready</button><button data-start aria-describedby="boarding-help">Start game</button></div><p class="boarding-status hint" role="status"></p>';
    host.append(this.root);
    this.root.querySelector<HTMLButtonElement>('[data-ready]')!.onclick =
      () => {
        const own = room.state.players.get(room.sessionId);
        if (own) room.send('ready', { ready: !own.ready });
      };
    this.root.querySelector<HTMLButtonElement>('[data-start]')!.onclick = () =>
      room.send('start', {});
    this.root.querySelector<HTMLButtonElement>('[data-copy]')!.onclick = () =>
      void this.copy();
    this.off = room.onMessage<ServerMessages['error']>('error', ({ message }) =>
      this.status(message),
    );
    this.frame();
  }
  private status(message: string) {
    this.root.querySelector('.boarding-status')!.textContent = message;
  }
  private async copy() {
    const url = new URL(location.href);
    url.search = '';
    url.hash = '';
    url.searchParams.set('code', this.room.roomId);
    try {
      await navigator.clipboard.writeText(url.href);
      if (!this.destroyed)
        this.status('Invite copied. Send it to your friends.');
    } catch {
      if (this.destroyed) return;
      this.root.querySelector<HTMLElement>('.boarding-fallback')!.hidden =
        false;
      const input = this.root.querySelector('input')!;
      input.value = url.href;
      input.focus();
      input.select();
      this.status('Select and copy the invite link.');
    }
  }
  frame() {
    const own = this.room.state.players.get(this.room.sessionId);
    if (!own) return;
    const players = [...this.room.state.players.values()];
    const requirement = lobbyRequirement(
      players,
      this.room.state.settings.impostors,
    );
    this.root.querySelector('.boarding-code')!.textContent =
      `Room ${this.room.roomId}`;
    const rosterKey = JSON.stringify(
      players.map((p) => [
        p.id,
        p.name,
        p.color,
        p.ready,
        p.connected,
        p.isHost,
      ]),
    );
    if (rosterKey !== this.rosterKey) {
      this.rosterKey = rosterKey;
      const connected = players.filter((p) => p.connected);
      this.root.querySelector('.boarding-crew summary')!.textContent =
        `${players.length}/${MAX_PLAYERS} aboard · ${connected.filter((p) => p.ready).length}/${connected.length} ready`;
      this.root.querySelector('.boarding-crew ul')!.replaceChildren(
        ...players.map((p) => {
          const li = document.createElement('li');
          const color = COLORS.find((c) => c.id === p.color)!;
          const name = document.createElement('span');
          name.textContent = `#${color.number} ${p.name}${p.id === this.room.sessionId ? ' (you)' : ''}${p.isHost ? ' · Host' : ''}`;
          name.style.setProperty('--crew-color', color.hex);
          const status = document.createElement('span');
          status.textContent = !p.connected
            ? 'Reconnecting'
            : p.ready
              ? 'Ready'
              : 'Not ready';
          li.append(name, status);
          return li;
        }),
      );
    }
    const help =
      requirement ??
      (own.isHost
        ? 'Ready to depart. You can start before everyone marks ready.'
        : 'Waiting for the host to start.');
    const helper = this.root.querySelector('.boarding-help')!;
    if (helper.textContent !== help) helper.textContent = help;
    const ready = this.root.querySelector<HTMLButtonElement>('[data-ready]')!;
    ready.textContent = own.ready ? 'Ready · undo' : 'Mark ready';
    ready.setAttribute('aria-pressed', String(own.ready));
    const start = this.root.querySelector<HTMLButtonElement>('[data-start]')!;
    start.hidden = !own.isHost;
    start.disabled = !!requirement || !this.room.connection.isOpen;
    ready.disabled = !this.room.connection.isOpen;
  }
  destroy() {
    this.destroyed = true;
    this.off();
    this.root.remove();
  }
}
