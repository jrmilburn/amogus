import {
  MeetingState,
  REPORT_RADIUS,
  EMERGENCY_COOLDOWN_MS,
  meetingReachable,
  emergencyUnavailable,
  isRecord,
  type GameState,
  type ServerMessages,
} from '@mutiny/shared';
import { pointInPolygon, type MapDef } from '@mutiny/shared/maps';

/** Atomically validates and enters a meeting. Never reads or reveals private roles. */
export class MeetingSystem {
  private serial = 0;
  constructor(
    private state: GameState,
    private map: MapDef,
    private busy: (id: string) => boolean = () => false,
  ) {}
  private actor(id: string, roundId: unknown, now: number) {
    const p = this.state.players.get(id);
    if (
      this.state.phase !== 'playing' ||
      roundId !== this.state.roundId ||
      !p?.alive ||
      !p.connected ||
      p.inVent
    )
      throw new Error(
        'Only living players outside vents can call a meeting in the current round.',
      );
    if (this.busy(id))
      throw new Error('Close your station procedure before calling a meeting.');
    if (this.state.sabotage?.endsAt && now >= this.state.sabotage.endsAt)
      throw new Error('The system failure deadline has passed.');
    return p;
  }
  report(id: string, payload: unknown, now = Date.now()) {
    if (
      !isRecord(payload) ||
      typeof payload.bodyId !== 'string' ||
      !Number.isInteger(payload.roundId) ||
      Object.keys(payload).some((k) => !['bodyId', 'roundId'].includes(k))
    )
      throw new Error('Choose a nearby body to report.');
    this.actor(id, payload.roundId, now);
    const body = this.state.bodies.get(payload.bodyId),
      own = this.state.players.get(id)!;
    if (
      !body ||
      !meetingReachable(this.map, this.state, own, body, REPORT_RADIUS)
    )
      throw new Error('Move within 100px of a body with a clear path.');
    const meeting = new MeetingState();
    meeting.reason = 'report';
    meeting.bodyColor = body.color;
    meeting.location =
      this.map.rooms.find((r) => pointInPolygon(body, r.polygon))?.name ??
      'Station passage';
    return this.enter(id, meeting, now);
  }
  emergency(id: string, payload: unknown, now = Date.now()) {
    if (
      !isRecord(payload) ||
      !Number.isInteger(payload.roundId) ||
      Object.keys(payload).length !== 1
    )
      throw new Error('Use the emergency button in the current round.');
    const own = this.actor(id, payload.roundId, now),
      reason = emergencyUnavailable(this.map, this.state, own, now);
    if (reason) throw new Error(reason);
    const meeting = new MeetingState();
    meeting.reason = 'emergency';
    meeting.location =
      this.map.rooms.find((r) =>
        pointInPolygon(this.map.emergencyButton, r.polygon),
      )?.name ?? 'Commons';
    own.emergenciesUsed++;
    return this.enter(id, meeting, now);
  }
  private enter(
    id: string,
    meeting: MeetingState,
    now: number,
  ): ServerMessages['meetingStart'] {
    const caller = this.state.players.get(id)!;
    meeting.id = ++this.serial;
    meeting.callerId = id;
    meeting.callerName = caller.name;
    meeting.callerColor = caller.color;
    this.state.phase = 'meeting';
    this.state.phaseEndsAt = 0;
    this.state.serverNow = now;
    this.state.meeting = meeting;
    this.state.bodies.clear();
    this.state.emergencyReadyAt = 0;
    [...this.state.players.values()].forEach((p, i) => {
      Object.assign(p, this.map.spawnPoints[i]!);
      p.walking = false;
      p.inVent = false;
      p.facing = 1;
    });
    return {
      roundId: this.state.roundId,
      meetingId: meeting.id,
      reason: meeting.reason,
      callerId: id,
      location: meeting.location,
      ...(meeting.bodyColor ? { bodyColor: meeting.bodyColor } : {}),
    };
  }
  /** Call at game start and after #17 returns a meeting to play; preserves per-round usage. */
  beginPlaying(now = Date.now()) {
    this.state.emergencyReadyAt = now + EMERGENCY_COOLDOWN_MS;
  }
  clear() {
    this.state.meeting = undefined;
    this.state.emergencyReadyAt = 0;
    for (const p of this.state.players.values()) p.emergenciesUsed = 0;
  }
}
