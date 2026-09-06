import { randomInt, randomUUID } from 'node:crypto';
import {
  SabotageState,
  SABOTAGE_COOLDOWN_MS,
  DOOR_COOLDOWN_MS,
  DOOR_LOCK_MS,
  CRISIS_MS,
  REACTOR_HOLD_MS,
  COMMS_HOLD_MS,
  REPAIR_RADIUS,
  REPAIR_HEARTBEAT_MS,
  PLAYER_RADIUS,
  collisionMap,
  clearActionPath,
  repairPointMatches,
  isRecord,
  type GameState,
  type ServerMessages,
} from '@mutiny/shared';
import { circleIntersectsRect, type MapDef } from '@mutiny/shared/maps';
import type { RoundAssignments } from './round.js';
import type { TaskSessions } from './tasks.js';

interface RepairSession {
  pointId: string;
  sabotageId: number;
  token: string;
  expiresAt: number;
  holdingSince?: number;
  heartbeat: number;
}
/** Private panel permissions/codes and authoritative continuous-hold repair timing. */
export class SabotageSystem {
  readonly sessions = new Map<string, RepairSession>();
  private codes = new Map<string, string>();
  private serial = 0;
  constructor(
    private state: GameState,
    private map: MapDef,
    private round: RoundAssignments,
    private tasks: TaskSessions,
    private closed: (
      id: string,
      payload: ServerMessages['repairClosed'],
    ) => void = () => {},
  ) {}
  private actor(id: string, roundId: unknown) {
    const player = this.state.players.get(id);
    if (
      roundId !== this.state.roundId ||
      this.state.phase !== 'playing' ||
      !player?.alive ||
      !player.connected ||
      player.inVent
    )
      throw new Error(
        'This action needs a living player outside a vent in the current round.',
      );
    return player;
  }
  begin(now = Date.now()) {
    this.clear();
    this.state.sabotageReadyAt = now + SABOTAGE_COOLDOWN_MS;
    this.state.doorsReadyAt = now;
    this.state.serverNow = now;
  }
  activate(id: string, payload: unknown, now = Date.now()) {
    if (
      !isRecord(payload) ||
      !['lights', 'reactor', 'o2', 'comms', 'doors'].includes(
        String(payload.kind),
      ) ||
      !Number.isInteger(payload.roundId) ||
      Object.keys(payload).some(
        (k) => !['kind', 'roomId', 'roundId'].includes(k),
      )
    )
      throw new Error('Choose a station system to sabotage.');
    this.actor(id, payload.roundId);
    if (this.round.players.get(id)?.role !== 'impostor')
      throw new Error('Only an impostor can sabotage.');
    if (this.tasks.active.has(id) || this.sessions.has(id))
      throw new Error('Close your station procedure first.');
    if (payload.kind === 'doors') {
      if (now < this.state.doorsReadyAt)
        throw new Error('Door controls are cooling down.');
      const doors = this.map.doors.filter((d) => d.room === payload.roomId);
      if (!doors.length) throw new Error('Choose a room with doors.');
      if (
        [...this.state.players.values()].some(
          (p) =>
            p.alive &&
            !p.inVent &&
            doors.some((d) => circleIntersectsRect(p, PLAYER_RADIUS + 1, d)),
        )
      )
        throw new Error('A doorway is occupied. Wait until it is clear.');
      this.state.closedDoors.set(payload.roomId as string, now + DOOR_LOCK_MS);
      this.state.doorsReadyAt = now + DOOR_COOLDOWN_MS;
      return;
    }
    if (payload.roomId !== undefined)
      throw new Error('This system does not take a room selection.');
    if (this.state.sabotage || now < this.state.sabotageReadyAt)
      throw new Error(
        'Wait for the active fault to be repaired and the sabotage cooldown to finish.',
      );
    const fault = new SabotageState();
    fault.id = ++this.serial;
    fault.kind = payload.kind as SabotageState['kind'];
    fault.endsAt =
      fault.kind === 'reactor' || fault.kind === 'o2' ? now + CRISIS_MS : 0;
    if (fault.kind === 'lights') {
      for (let i = 0; i < 5; i++) {
        const target = Boolean(randomInt(2));
        fault.targetSwitches.push(target);
        fault.switches.push(!target);
      }
    }
    if (fault.kind === 'o2')
      for (const p of this.map.sabotagePoints.filter((p) =>
        p.kind.startsWith('o2-'),
      ))
        this.codes.set(p.id, String(randomInt(100000)).padStart(5, '0'));
    this.state.sabotage = fault;
    this.state.sabotageReadyAt = now + SABOTAGE_COOLDOWN_MS;
  }
  private point(
    id: string,
    pointId: string,
    sabotageId: unknown,
    roundId: unknown,
  ) {
    const player = this.actor(id, roundId);
    const fault = this.state.sabotage;
    const point = this.map.sabotagePoints.find((p) => p.id === pointId);
    if (
      !fault ||
      fault.id !== sabotageId ||
      !point ||
      !repairPointMatches(fault.kind, point.kind) ||
      fault.fixedPoints.includes(point.id)
    )
      throw new Error('That panel is not awaiting repair in this fault.');
    if (
      Math.hypot(player.x - point.x, player.y - point.y) > REPAIR_RADIUS ||
      !clearActionPath(player, point, collisionMap(this.map, this.state).walls)
    )
      throw new Error(
        'Move within 80px of the repair panel with a clear path.',
      );
    return { player, point, fault };
  }
  open(
    id: string,
    payload: unknown,
    now = Date.now(),
  ): ServerMessages['repairOpened'] {
    if (
      !isRecord(payload) ||
      typeof payload.pointId !== 'string' ||
      !Number.isInteger(payload.sabotageId) ||
      !Number.isInteger(payload.roundId) ||
      Object.keys(payload).some(
        (k) => !['pointId', 'sabotageId', 'roundId'].includes(k),
      )
    )
      throw new Error('Choose a nearby repair panel.');
    const { fault, point } = this.point(
      id,
      payload.pointId,
      payload.sabotageId,
      payload.roundId,
    );
    if (fault.endsAt && now >= fault.endsAt)
      throw new Error('The repair deadline has passed.');
    if (this.tasks.active.has(id) || this.sessions.has(id))
      throw new Error('Close your current station procedure first.');
    const token = randomUUID();
    this.sessions.set(id, {
      pointId: point.id,
      sabotageId: fault.id,
      token,
      expiresAt: now + 60000,
      heartbeat: 0,
    });
    const code = this.codes.get(point.id);
    return {
      roundId: this.state.roundId,
      sabotageId: fault.id,
      pointId: point.id,
      token,
      ...(code === undefined ? {} : { code }),
    };
  }
  fix(id: string, payload: unknown, now = Date.now()) {
    if (
      !isRecord(payload) ||
      typeof payload.pointId !== 'string' ||
      typeof payload.token !== 'string' ||
      !Number.isInteger(payload.roundId) ||
      !Number.isInteger(payload.sabotageId) ||
      !['switch', 'hold', 'release', 'code'].includes(String(payload.action))
    )
      throw new Error('Open a repair panel before operating it.');
    const allowed = [
      'pointId',
      'token',
      'roundId',
      'sabotageId',
      'action',
      ...(payload.action === 'switch'
        ? ['switchIndex']
        : payload.action === 'code'
          ? ['code']
          : []),
    ];
    if (Object.keys(payload).some((k) => !allowed.includes(k)))
      throw new Error('Invalid repair action.');
    const session = this.sessions.get(id);
    if (
      !session ||
      now >= session.expiresAt ||
      session.token !== payload.token ||
      session.pointId !== payload.pointId ||
      session.sabotageId !== payload.sabotageId
    )
      throw new Error('Panel session expired. Open it again.');
    const { fault } = this.point(
      id,
      payload.pointId,
      payload.sabotageId,
      payload.roundId,
    );
    if (fault.endsAt && now >= fault.endsAt)
      throw new Error('The repair deadline has passed.');
    if (payload.action === 'release') {
      session.holdingSince = undefined;
      return;
    }
    if (fault.kind === 'lights' && payload.action === 'switch') {
      const index = payload.switchIndex;
      if (
        !Number.isInteger(index) ||
        (index as number) < 0 ||
        (index as number) > 4
      )
        throw new Error('Choose one of the five switches.');
      fault.switches[index as number] = !fault.switches[index as number];
      if (fault.switches.every((v, i) => v === fault.targetSwitches[i]))
        this.repaired(now);
      return;
    }
    if (fault.kind === 'o2' && payload.action === 'code') {
      if (
        typeof payload.code !== 'string' ||
        !/^\d{5}$/.test(payload.code) ||
        payload.code !== this.codes.get(session.pointId)
      )
        throw new Error(
          'Code does not match this panel. Enter its five digits again.',
        );
      fault.fixedPoints.push(session.pointId);
      for (const [actor, open] of this.sessions)
        if (open.pointId === session.pointId) this.cancel(actor, open.token);
      if (fault.fixedPoints.length === 2) this.repaired(now);
      return;
    }
    if (
      (fault.kind === 'reactor' || fault.kind === 'comms') &&
      payload.action === 'hold'
    ) {
      if (
        session.holdingSince === undefined ||
        now - session.heartbeat > REPAIR_HEARTBEAT_MS
      )
        session.holdingSince = now;
      session.heartbeat = now;
      return;
    }
    throw new Error('That control does not belong to this panel.');
  }
  tick(now = Date.now()): 'reactor' | 'o2' | undefined {
    this.state.serverNow = now;
    for (const [room, end] of this.state.closedDoors)
      if (now >= end || this.state.phase !== 'playing')
        this.state.closedDoors.delete(room);
    for (const [id, session] of this.sessions) {
      try {
        this.point(id, session.pointId, session.sabotageId, this.state.roundId);
        if (now >= session.expiresAt) throw new Error('Panel session expired.');
      } catch {
        this.cancel(id, session.token, 'Panel session ended.');
        continue;
      }
      if (now - session.heartbeat > REPAIR_HEARTBEAT_MS)
        session.holdingSince = undefined;
    }
    const fault = this.state.sabotage;
    if (!fault || this.state.phase !== 'playing') return;
    // Deadline takes priority over a repair received on or after it.
    if (fault.endsAt && now >= fault.endsAt) {
      const reason = fault.kind as 'reactor' | 'o2';
      this.state.phase = 'ended';
      this.state.winner = 'impostor';
      this.state.endReason = reason;
      this.clear();
      return reason;
    }
    const holding = [...this.sessions.values()].filter(
      (s) => s.holdingSince !== undefined,
    );
    let elapsed = 0;
    if (fault.kind === 'reactor') {
      const a = holding.find(
        (s) =>
          this.map.sabotagePoints.find((p) => p.id === s.pointId)?.kind ===
          'reactor-a',
      );
      const b = holding.find(
        (s) =>
          this.map.sabotagePoints.find((p) => p.id === s.pointId)?.kind ===
          'reactor-b',
      );
      if (a && b) elapsed = now - Math.max(a.holdingSince!, b.holdingSince!);
    } else if (fault.kind === 'comms' && holding.length)
      elapsed = Math.max(...holding.map((s) => now - s.holdingSince!));
    const held = [...new Set(holding.map((s) => s.pointId))].sort();
    if (held.join() !== [...fault.heldPoints].join()) {
      fault.heldPoints.clear();
      fault.heldPoints.push(...held);
    }
    const duration = fault.kind === 'reactor' ? REACTOR_HOLD_MS : COMMS_HOLD_MS;
    fault.holdProgress = Math.min(1, Math.max(0, elapsed / duration));
    if (elapsed >= duration) this.repaired(now);
  }
  cancel(id: string, token: string | null, error?: string) {
    const session = this.sessions.get(id);
    if (!session || (token !== null && token !== session.token)) return;
    this.sessions.delete(id);
    this.closed(id, { token: session.token, ...(error ? { error } : {}) });
  }
  private repaired(now: number) {
    for (const [id, s] of this.sessions) this.cancel(id, s.token);
    this.codes.clear();
    this.state.sabotage = undefined;
    this.state.sabotageReadyAt = now + SABOTAGE_COOLDOWN_MS;
  }
  clear() {
    for (const [id, s] of this.sessions) this.cancel(id, s.token);
    this.codes.clear();
    this.state.sabotage = undefined;
    this.state.closedDoors.clear();
    this.state.sabotageReadyAt = 0;
    this.state.doorsReadyAt = 0;
  }
}
