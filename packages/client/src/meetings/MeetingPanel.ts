import { COLORS, EJECTION_MS, type ServerMessages } from '@mutiny/shared';
import type { WalkRoom } from '../movement/Walkaround';
import type { Renderer } from '../renderer/Renderer';
import type { CharacterAssets } from '../characters/assets';
import { CharacterView } from '../characters/CharacterView';

/** THESIS: discuss the evidence, deliberately lock a ballot, then watch the result.
 * OWN-WORLD: station roster, amber selections, mint voted stamps and original suits.
 * STORY: roster and transcript precede one explicit confirmation; no live vote targets.
 * FIRST VIEWPORT: phase timer above a player grid and chat; ejection replaces both.
 * FORM: an extension of the existing native meeting dialog, responsive two-column body.
 */
export class MeetingPanel {
  private root = document.createElement('div');
  private selected: string | null | undefined;
  private buttons = new Map<string, HTMLButtonElement>();
  private chatId = 0;
  private pending?: 'chat' | 'vote';
  private timer?: ReturnType<typeof setTimeout>;
  private phase = '';
  private off: (() => void)[] = [];
  private sentText = '';
  private ejectionShown = false;
  private announcedResultStage = 0;
  constructor(
    private dialog: HTMLDialogElement,
    private room: WalkRoom,
    private renderer: Renderer,
    private characters: CharacterAssets,
  ) {
    this.root.className = 'meeting-panel';
    this.root.innerHTML =
      '<p class="meeting-phase" role="status"></p><p class="meeting-timer" role="timer" aria-live="off"></p><div class="meeting-discussion"><section aria-label="Crew roster"><div class="meeting-grid"></div><div class="ballot-controls"><button type="button" data-skip>Skip</button><button type="button" data-confirm disabled>Choose a player or Skip</button></div><p class="ballot-help"></p></section><section class="meeting-chat" aria-label="Living crew chat"><h3>Meeting chat</h3><div class="meeting-transcript" role="log" aria-label="Meeting messages" tabindex="0"></div><form><label for="meeting-message">Message · 200 characters maximum</label><input id="meeting-message" maxlength="200" autocomplete="off" required><button type="submit">Send</button></form></section></div><section class="meeting-ejection" hidden aria-labelledby="ejection-title"><div class="ejection-space" aria-hidden="true"><div class="ejection-engineer"></div></div><h3 id="ejection-title" tabindex="-1"></h3><p class="ejection-role"></p><p class="ejection-remaining"></p><ul class="vote-counts"></ul></section><p class="meeting-feedback" role="status"></p>';
    const resultAnnouncement = document.createElement('p');
    resultAnnouncement.className = 'meeting-result-announcement';
    resultAnnouncement.setAttribute('role', 'status');
    this.root.append(resultAnnouncement);
    dialog.append(this.root);
    this.root.querySelector<HTMLButtonElement>('[data-skip]')!.onclick = () => {
      this.selected = null;
      this.frame();
    };
    this.root.querySelector<HTMLButtonElement>('[data-confirm]')!.onclick =
      () => this.vote();
    this.root.querySelector('form')!.onsubmit = (e) => {
      e.preventDefault();
      this.chat();
    };
    this.off.push(
      room.onMessage<ServerMessages['error']>('error', (p) => {
        if (!this.pending) return;
        this.settle();
        this.notice(p.message);
      }),
    );
    this.off.push(
      room.onMessage<ServerMessages['chatAccepted']>('chatAccepted', (p) => {
        if (
          this.pending !== 'chat' ||
          p.roundId !== room.state.roundId ||
          p.meetingId !== room.state.meeting?.id
        )
          return;
        const input = this.root.querySelector('input')!;
        if (input.value === this.sentText) input.value = '';
        this.settle();
        this.notice('Message sent.');
      }),
    );
    this.frame();
  }
  frame() {
    const state = this.room.state,
      m = state.meeting;
    if (!m) return;
    const own = state.players.get(this.room.sessionId),
      ejection = state.phase === 'ejection';
    if (this.phase !== state.phase) {
      this.phase = state.phase;
      this.root.querySelector('.meeting-phase')!.textContent = ejection
        ? 'Vote result'
        : state.phase === 'voting'
          ? 'Voting is open'
          : 'Discuss what happened';
    }
    const deadline = ejection
      ? state.phaseEndsAt
      : state.phase === 'voting'
        ? m.votingEndsAt
        : m.discussionEndsAt;
    this.root.querySelector('.meeting-timer')!.textContent =
      `${Math.max(0, Math.ceil((deadline - state.serverNow) / 1000))}s · ${ejection ? 'Returning to the station' : state.phase === 'voting' ? 'Voting closes' : 'Voting opens'}`;
    this.root.querySelector<HTMLElement>('.meeting-discussion')!.hidden =
      ejection;
    this.root.querySelector<HTMLElement>('.meeting-ejection')!.hidden =
      !ejection;
    this.dialog.querySelector<HTMLElement>('.meeting-caller')!.hidden =
      ejection;
    if (ejection) {
      const elapsed = Math.max(
        0,
        EJECTION_MS - (state.phaseEndsAt - state.serverNow),
      );
      if (!this.ejectionShown && m.result) {
        this.ejectionShown = true;
        this.settle();
        this.showResult(JSON.parse(m.result) as ServerMessages['voteResult']);
        this.root.querySelector<HTMLElement>(
          '.ejection-engineer',
        )!.style.animationDelay = `-${elapsed}ms`;
      }
      this.root.querySelector<HTMLElement>('.ejection-role')!.hidden =
        elapsed < 1800;
      this.root.querySelector<HTMLElement>('.ejection-remaining')!.hidden =
        elapsed < 3500;
      const stage = elapsed >= 3500 ? 2 : elapsed >= 1800 ? 1 : 0;
      if (this.dialog.open && stage > this.announcedResultStage) {
        const roleText =
          this.root.querySelector('.ejection-role')!.textContent ?? '';
        const remainingText =
          this.root.querySelector('.ejection-remaining')!.textContent ?? '';
        const announcement =
          stage === 1
            ? roleText
            : this.announcedResultStage === 0
              ? `${roleText} ${remainingText}`.trim()
              : remainingText;
        if (announcement)
          this.root.querySelector('.meeting-result-announcement')!.textContent =
            announcement;
        this.announcedResultStage = stage;
      }
      return;
    }
    if (this.pending === 'vote' && m.voted.has(this.room.sessionId)) {
      this.settle();
      this.notice('Vote locked.');
    }
    const canVote =
      state.phase === 'voting' &&
      own?.alive &&
      own.connected &&
      !m.voted.has(this.room.sessionId) &&
      !this.pending;
    if (
      this.selected &&
      (!state.players.get(this.selected)?.alive ||
        !state.players.get(this.selected)?.connected)
    )
      this.selected = undefined;
    for (const [id, b] of this.buttons)
      if (!state.players.has(id)) {
        b.remove();
        this.buttons.delete(id);
        if (this.selected === id) this.selected = undefined;
      }
    for (const p of state.players.values()) {
      let b = this.buttons.get(p.id);
      if (!b) {
        b = document.createElement('button');
        b.type = 'button';
        b.className = 'meeting-player';
        b.onclick = () => {
          this.selected = p.id;
          this.frame();
        };
        this.buttons.set(p.id, b);
        this.root.querySelector('.meeting-grid')!.append(b);
      }
      const color = COLORS.find((c) => c.id === p.color)!;
      const label = `${p.alive ? '' : '× '}${p.name}${p.id === this.room.sessionId ? ' (you)' : ''} · ${color.name} #${color.number}${!p.alive ? ' · Dead' : !p.connected ? ' · Reconnecting' : m.voted.has(p.id) ? ' · Voted' : ''}`;
      if (b.textContent !== label) b.textContent = label;
      b.style.setProperty('--crew-color', color.hex);
      b.classList.toggle('is-dead', !p.alive);
      b.classList.toggle('has-voted', m.voted.has(p.id));
      b.disabled = !canVote || !p.alive || !p.connected;
      b.setAttribute('aria-pressed', String(this.selected === p.id));
    }
    const confirm =
        this.root.querySelector<HTMLButtonElement>('[data-confirm]')!,
      skip = this.root.querySelector<HTMLButtonElement>('[data-skip]')!;
    skip.disabled = !canVote;
    skip.setAttribute('aria-pressed', String(this.selected === null));
    confirm.disabled = !canVote || this.selected === undefined;
    confirm.textContent =
      this.selected === undefined
        ? 'Choose a player or Skip'
        : this.selected === null
          ? 'Confirm skip'
          : `Confirm vote: ${state.players.get(this.selected)?.name ?? 'player'}`;
    const help = !own?.alive
      ? 'You are dead: you can read this meeting and use Ghost chat, but cannot vote or send living chat.'
      : m.voted.has(this.room.sessionId)
        ? 'Your vote is locked. Waiting for the others.'
        : state.phase === 'meeting'
          ? 'Discuss first. Ballots unlock when the timer ends.'
          : 'Select a player or Skip, then confirm. Your vote cannot be changed.';
    const helpNode = this.root.querySelector('.ballot-help')!;
    if (helpNode.textContent !== help) helpNode.textContent = help;
    const canChat = Boolean(own?.alive && own.connected && !this.pending);
    this.root.querySelector('input')!.disabled = !own?.alive;
    this.root.querySelector<HTMLButtonElement>('form button')!.disabled =
      !canChat;
    const transcript = this.root.querySelector<HTMLElement>(
      '.meeting-transcript',
    )!;
    const atEnd =
      transcript.scrollHeight - transcript.scrollTop - transcript.clientHeight <
      40;
    let appended = false;
    for (const message of m.chat) {
      if (message.id <= this.chatId) continue;
      const p = document.createElement('p');
      p.textContent = `${message.name}: ${message.text}`;
      transcript.append(p);
      this.chatId = message.id;
      appended = true;
    }
    while (transcript.childElementCount > 100)
      transcript.firstElementChild!.remove();
    if (appended && atEnd) transcript.scrollTop = transcript.scrollHeight;
  }
  private identity() {
    return {
      roundId: this.room.state.roundId,
      meetingId: this.room.state.meeting!.id,
    };
  }
  private vote() {
    if (
      this.pending ||
      this.selected === undefined ||
      this.root.querySelector<HTMLButtonElement>('[data-confirm]')!.disabled
    )
      return;
    this.room.send('vote', { ...this.identity(), targetId: this.selected });
    this.wait('vote');
  }
  private chat() {
    const input = this.root.querySelector('input')!;
    if (this.pending || !input.value.trim() || input.disabled) return;
    this.sentText = input.value;
    this.room.send('chat', {
      ...this.identity(),
      channel: 'living',
      text: input.value,
    });
    this.wait('chat');
  }
  private wait(kind: 'chat' | 'vote') {
    this.pending = kind;
    this.notice(kind === 'vote' ? 'Submitting vote…' : 'Sending message…');
    this.timer = setTimeout(() => {
      this.settle();
      this.notice(
        'No confirmation received. Check your connection and try again.',
      );
    }, 5000);
    this.frame();
  }
  private settle() {
    clearTimeout(this.timer);
    this.pending = undefined;
  }
  private notice(text: string) {
    const node = this.root.querySelector('.meeting-feedback')!;
    if (node.textContent !== text) node.textContent = text;
  }
  private showResult(result: ServerMessages['voteResult']) {
    this.notice('');
    const title = this.root.querySelector<HTMLElement>('#ejection-title')!;
    title.textContent = result.ejectedId
      ? `${result.ejectedName} was ejected.`
      : 'No one was ejected.';
    this.root.querySelector('.ejection-role')!.textContent = result.role
      ? `${result.ejectedName} was ${result.role === 'impostor' ? 'an Impostor' : 'not an Impostor'}.`
      : result.ejectedId
        ? ''
        : 'The vote was tied or skipped.';
    this.root.querySelector('.ejection-remaining')!.textContent =
      `${result.impostorsRemaining} Impostor${result.impostorsRemaining === 1 ? '' : 's'} remain.`;
    const sky = this.root.querySelector('.ejection-space')!;
    for (let i = 0; i < 40; i++) {
      const star = document.createElement('i');
      star.style.left = `${(i * 73 + 19) % 100}%`;
      star.style.top = `${(i * 37 + 13) % 100}%`;
      star.style.width = star.style.height = `${1 + (i % 3)}px`;
      sky.append(star);
    }
    if (result.ejectedColor) {
      const portrait = new CharacterView(
        this.characters,
        '',
        result.ejectedColor,
      );
      portrait.nameTag.visible = false;
      try {
        const canvas = this.renderer.app.renderer.extract.canvas({
          target: portrait,
          resolution: 2,
        });
        if (canvas instanceof HTMLCanvasElement)
          this.root.querySelector('.ejection-engineer')!.append(canvas);
      } catch (error) {
        console.warn('Ejection portrait unavailable:', error);
      } finally {
        portrait.destroy({ children: true });
      }
    }
    const list = this.root.querySelector('.vote-counts')!;
    for (const [target, count] of [
      ...Object.entries(result.counts),
      ['skip', result.skipped] as const,
    ]) {
      const li = document.createElement('li');
      li.textContent = `${target === 'skip' ? 'Skip' : (this.room.state.players.get(target)?.name ?? result.ejectedName ?? 'Departed player')}: ${count}`;
      if (result.votes) {
        for (const vote of result.votes.filter(
          (v) => (v.targetId ?? 'skip') === target,
        )) {
          const voter = this.room.state.players.get(vote.voterId),
            color = COLORS.find((c) => c.id === voter?.color);
          const mark = document.createElement('span');
          mark.className = 'vote-stamp';
          mark.textContent = color ? `#${color.number}` : '?';
          mark.title = voter?.name ?? 'Departed player';
          mark.setAttribute(
            'aria-label',
            `${voter?.name ?? 'Departed player'} voted here`,
          );
          if (color) mark.style.setProperty('--crew-color', color.hex);
          li.append(mark);
        }
      }
      list.append(li);
    }
    title.focus();
  }
  destroy() {
    this.settle();
    this.off.forEach((f) => f());
    this.root.remove();
  }
}
