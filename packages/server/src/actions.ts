import { randomUUID } from 'node:crypto';
import {
  Body,
  KILL_RADIUS,
  VENT_USE_RADIUS,
  clearActionPath,
  collisionMap,
  isRecord,
  type GameState,
  type ServerMessages,
} from '@mutiny/shared';
import type { MapDef } from '@mutiny/shared/maps';
import type { RoundAssignments } from './round.js';
import type { TaskSessions } from './tasks.js';

/** Authority and private vent/cooldown state; no role data enters the schema. */
export class ImpostorActions {
  readonly vents = new Map<string, string>();
  constructor(
    private state: GameState,
    private map: MapDef,
    private round: RoundAssignments,
    private tasks: TaskSessions,
    private repairing: (id: string) => boolean = () => false,
  ) {}

  private actor(id: string, roundId: unknown) {
    const player = this.state.players.get(id);
    const entry = this.round.players.get(id);
    if (
      this.state.phase !== 'playing' ||
      roundId !== this.state.roundId ||
      !player?.alive ||
      !player.connected ||
      entry?.role !== 'impostor'
    )
      throw new Error(
        'That action is only available to a living impostor in this round.',
      );
    if (this.tasks.active.has(id) || this.repairing(id))
      throw new Error('Close your task before using an impostor action.');
    return { player, entry };
  }

  kill(
    id: string,
    payload: unknown,
    now = Date.now(),
  ): ServerMessages['killed'] {
    if (
      !isRecord(payload) ||
      typeof payload.targetId !== 'string' ||
      !Number.isInteger(payload.roundId) ||
      Object.keys(payload).some((k) => !['targetId', 'roundId'].includes(k))
    )
      throw new Error('Choose a nearby target.');
    const { player, entry } = this.actor(id, payload.roundId);
    if (player.inVent || now < entry.killReadyAt)
      throw new Error('Wait for your kill cooldown and exit the vent first.');
    const victim = this.state.players.get(payload.targetId);
    if (
      !victim?.alive ||
      !victim.connected ||
      victim.inVent ||
      this.round.players.get(victim.id)?.role !== 'crew'
    )
      throw new Error('Choose a living crew member.');
    if (
      Math.hypot(player.x - victim.x, player.y - victim.y) > KILL_RADIUS ||
      !clearActionPath(player, victim, collisionMap(this.map, this.state).walls)
    )
      throw new Error(
        `Move within ${KILL_RADIUS}px of a crew member with no wall between you.`,
      );
    const body = new Body();
    Object.assign(body, {
      id: randomUUID(),
      victimId: victim.id,
      name: victim.name,
      color: victim.color,
      x: victim.x,
      y: victim.y,
    });
    victim.alive = false;
    victim.walking = false;
    player.x = victim.x;
    player.y = victim.y;
    player.walking = false;
    this.state.bodies.set(body.id, body);
    entry.killReadyAt = now + this.state.settings.killCooldown * 1000;
    return {
      roundId: this.state.roundId,
      victimId: victim.id,
      bodyId: body.id,
      x: body.x,
      y: body.y,
    };
  }

  vent(id: string, payload: unknown) {
    if (
      !isRecord(payload) ||
      typeof payload.ventId !== 'string' ||
      !Number.isInteger(payload.roundId) ||
      !['enter', 'move', 'exit'].includes(String(payload.action)) ||
      Object.keys(payload).some(
        (k) => !['action', 'ventId', 'roundId'].includes(k),
      )
    )
      throw new Error('Choose a linked vent or exit at your current vent.');
    const { player } = this.actor(id, payload.roundId);
    const target = this.map.vents.find((v) => v.id === payload.ventId);
    if (!target) throw new Error('That vent does not exist.');
    const current = this.map.vents.find((v) => v.id === this.vents.get(id));
    if (payload.action === 'enter') {
      if (
        player.inVent ||
        Math.hypot(player.x - target.x, player.y - target.y) >
          VENT_USE_RADIUS ||
        !clearActionPath(
          player,
          target,
          collisionMap(this.map, this.state).walls,
        )
      )
        throw new Error(`Move within ${VENT_USE_RADIUS}px of a vent to enter.`);
      player.inVent = true;
      this.vents.set(id, target.id);
    } else {
      if (!player.inVent || !current) throw new Error('Enter a vent first.');
      if (payload.action === 'move') {
        if (!current.links.includes(target.id))
          throw new Error('That vent is not linked to your current vent.');
        this.vents.set(id, target.id);
      } else {
        if (target.id !== current.id)
          throw new Error('Exit at your current vent.');
        player.inVent = false;
        this.vents.delete(id);
      }
    }
    player.x = target.x;
    player.y = target.y;
    player.walking = false;
  }

  status(
    id: string,
    now = Date.now(),
  ): ServerMessages['impostorStatus'] | undefined {
    const entry = this.round.players.get(id);
    if (entry?.role !== 'impostor' || !Number.isFinite(entry.killReadyAt))
      return;
    return {
      roundId: this.state.roundId,
      killReadyAt: entry.killReadyAt,
      serverNow: now,
      ventId: this.vents.get(id) ?? null,
    };
  }
  clear() {
    this.vents.clear();
    this.state.bodies.clear();
  }
}
