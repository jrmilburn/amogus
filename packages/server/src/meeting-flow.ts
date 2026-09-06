import {
  MeetingChat,
  EJECTION_MS,
  isRecord,
  type GameState,
  type ServerMessages,
} from '@mutiny/shared';
import type { MapDef } from '@mutiny/shared/maps';
import type { RoundAssignments } from './round.js';

/** Deliberately basic whole-word filter, not a promise of comprehensive moderation. */
export function meetingText(value: unknown) {
  if (typeof value !== 'string' || value.length > 200)
    throw new Error('Messages must contain 1–200 characters.');
  const text = value
    .normalize('NFKC')
    .replace(
      // eslint-disable-next-line no-control-regex -- Strip control/bidi characters from untrusted chat.
      /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f]/g,
      '',
    )
    .trim();
  if (!text || text.length > 200)
    throw new Error('Messages must contain 1–200 characters.');
  return text.replace(
    /\b(fuck(?:ing|ed|s)?|shit(?:ty|s)?|bitch(?:es)?|asshole(?:s)?|bastard(?:s)?)\b/gi,
    (word) => '•'.repeat(word.length),
  );
}
/** Ballot targets and chat throttles are server-private; only sanitized tally leaves this class. */
export class MeetingFlow {
  readonly ballots = new Map<string, string | null>();
  private lastChat = new Map<string, number>();
  private chatSerial = 0;
  private timedOutVoters = new Set<string>();
  expireVoter(id: string) {
    if (
      ['meeting', 'voting'].includes(this.state.phase) &&
      this.state.players.get(id)?.alive
    )
      this.timedOutVoters.add(id);
  }
  constructor(
    private state: GameState,
    private round: RoundAssignments,
    private map: MapDef,
  ) {}
  prepare(now = Date.now()) {
    this.timedOutVoters.clear();
    this.ballots.clear();
    this.lastChat.clear();
    this.chatSerial = 0;
    const meeting = this.state.meeting!;
    meeting.discussionEndsAt = now + this.state.settings.discussionTime * 1000;
    meeting.votingEndsAt =
      meeting.discussionEndsAt + this.state.settings.votingTime * 1000;
    this.state.phaseEndsAt = meeting.discussionEndsAt;
  }
  private participant(id: string, payload: unknown) {
    const meeting = this.state.meeting,
      own = this.state.players.get(id);
    if (
      !isRecord(payload) ||
      payload.roundId !== this.state.roundId ||
      payload.meetingId !== meeting?.id ||
      !meeting ||
      !own?.alive ||
      !own.connected
    )
      throw new Error(
        'Only living players may speak or vote in the current meeting.',
      );
    return { meeting, own, payload };
  }
  chat(
    id: string,
    value: unknown,
    now = Date.now(),
  ): ServerMessages['chatAccepted'] {
    const { meeting, own, payload } = this.participant(id, value);
    if (
      !['meeting', 'voting'].includes(this.state.phase) ||
      now >= meeting.votingEndsAt ||
      payload.channel !== 'living' ||
      Object.keys(payload).some(
        (k) => !['text', 'channel', 'roundId', 'meetingId'].includes(k),
      )
    )
      throw new Error(
        'Living chat is available only during discussion and voting.',
      );
    const text = meetingText(payload.text);
    if (now - (this.lastChat.get(id) ?? -Infinity) < 1000)
      throw new Error('Wait one second between messages.');
    this.lastChat.set(id, now);
    const message = Object.assign(new MeetingChat(), {
      id: ++this.chatSerial,
      senderId: id,
      name: own.name,
      color: own.color,
      text,
    });
    if (meeting.chat.length >= 100) meeting.chat.shift();
    meeting.chat.push(message);
    return { roundId: this.state.roundId, meetingId: meeting.id };
  }
  vote(id: string, value: unknown, now = Date.now()) {
    const { meeting, payload } = this.participant(id, value);
    this.discussion(now);
    if (this.state.phase !== 'voting' || now >= meeting.votingEndsAt)
      throw new Error('Voting is not open.');
    if (
      Object.keys(payload).some(
        (k) => !['targetId', 'roundId', 'meetingId'].includes(k),
      ) ||
      (payload.targetId !== null && typeof payload.targetId !== 'string')
    )
      throw new Error('Choose one living player or Skip.');
    if (this.ballots.has(id)) throw new Error('Your vote is already locked.');
    if (payload.targetId !== null) {
      const target = this.state.players.get(payload.targetId as string);
      if (!target?.alive || !target.connected)
        throw new Error('That player is no longer eligible. Choose again.');
    }
    this.ballots.set(id, payload.targetId as string | null);
    meeting.voted.set(id, true);
  }
  private discussion(now: number) {
    if (
      this.state.phase === 'meeting' &&
      this.state.meeting &&
      now >= this.state.meeting.discussionEndsAt
    ) {
      this.state.phase = 'voting';
      this.state.phaseEndsAt = this.state.meeting.votingEndsAt;
    }
  }
  tick(
    now = Date.now(),
  ): { result: ServerMessages['voteResult'] } | 'resume' | undefined {
    const meeting = this.state.meeting;
    if (!meeting) return;
    this.discussion(now);
    if (this.state.phase === 'ejection' && now >= this.state.phaseEndsAt) {
      this.state.phase = 'playing';
      this.state.phaseEndsAt = 0;
      this.state.meeting = undefined;
      [...this.state.players.values()].forEach((p, i) => {
        Object.assign(p, this.map.spawnPoints[i]!);
        p.inVent = false;
        p.walking = false;
      });
      this.ballots.clear();
      this.lastChat.clear();
      return 'resume';
    }
    if (this.state.phase !== 'voting') return;
    const eligible = [...this.state.players.values()].filter((p) => p.alive);
    if (
      now < meeting.votingEndsAt &&
      !eligible.every((p) => p.connected && this.ballots.has(p.id))
    )
      return;
    const ids = new Set(eligible.map((p) => p.id)),
      counts: Record<string, number> = {},
      votes: { voterId: string; targetId: string | null }[] = [];
    let skipped = this.timedOutVoters.size;
    for (const voterId of this.timedOutVoters)
      votes.push({ voterId, targetId: null });
    for (const p of eligible) {
      const cast = p.connected ? this.ballots.get(p.id) : null;
      const target = cast && ids.has(cast) ? cast : null;
      votes.push({ voterId: p.id, targetId: target });
      if (target) counts[target] = (counts[target] ?? 0) + 1;
      else skipped++;
    }
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]),
      top = sorted[0];
    const ejectedId =
      top && top[1] > skipped && top[1] > (sorted[1]?.[1] ?? 0) ? top[0] : null;
    const ejected = ejectedId ? this.state.players.get(ejectedId) : undefined;
    if (ejected) ejected.alive = false;
    const result: ServerMessages['voteResult'] = {
      roundId: this.state.roundId,
      meetingId: meeting.id,
      ejectedId,
      counts,
      skipped,
      ...(ejected
        ? { ejectedName: ejected.name, ejectedColor: ejected.color }
        : {}),
      ...(this.state.settings.anonymousVotes ? {} : { votes }),
      ...(ejectedId && this.state.settings.confirmEjects
        ? { role: this.round.players.get(ejectedId)!.role }
        : {}),
      impostorsRemaining: [...this.state.players.values()].filter(
        (p) => p.alive && this.round.players.get(p.id)?.role === 'impostor',
      ).length,
    };
    this.state.phase = 'ejection';
    this.state.phaseEndsAt = now + EJECTION_MS;
    meeting.result = JSON.stringify(result);
    return { result };
  }
  clear() {
    this.timedOutVoters.clear();
    this.ballots.clear();
    this.lastChat.clear();
    this.chatSerial = 0;
  }
}
