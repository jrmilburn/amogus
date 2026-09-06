import { Room, ServerError, CloseCode, type Client } from '@colyseus/core';
import {
  COLORS,
  MAX_PLAYERS,
  TICK_RATE,
  ROLE_REVEAL_MS,
  GameState,
  Player,
  CLIENT_MESSAGES,
  SERVER_MESSAGES,
  isColorId,
  isRecord,
  sanitizeName,
  startRequirement,
  validateSettingsPatch,
  type ErrorCode,
  type JoinOptions,
  type ServerMessages,
} from '@mutiny/shared';
import { reserveRoomCode, releaseRoomCode } from '../lobby/room-codes.js';
import mapData from '@mutiny/shared/maps/the-hollow.json' with { type: 'json' };
import { MapDefSchema } from '@mutiny/shared/maps';
import { MovementSimulation } from '../movement.js';
import { RoundAssignments } from '../round.js';
import { TaskSessions } from '../tasks.js';
import { ImpostorActions } from '../actions.js';
import { SabotageSystem } from '../sabotage.js';
import { MeetingSystem } from '../meetings.js';
import { MeetingFlow, meetingText } from '../meeting-flow.js';
import { evaluateWin, resultPayload } from '../wins.js';
import { liveRooms, maxRooms, log } from '../ops.js';

const map = MapDefSchema.parse(mapData);

function profile(value: unknown): JoinOptions {
  if (!isRecord(value)) throw new Error('Enter a name and choose a colour.');
  const name = sanitizeName(value.name);
  if (!isColorId(value.color))
    throw new Error('Choose one of the available colours.');
  return { name, color: value.color };
}

export class GameRoom extends Room<{ state: GameState }> {
  state = new GameState();
  maxClients = MAX_PLAYERS;
  maxMessagesPerSecond = 30;
  readonly round = new RoundAssignments(map);
  readonly tasks = new TaskSessions(this.state, map, this.round);
  readonly sabotage = new SabotageSystem(
    this.state,
    map,
    this.round,
    this.tasks,
    (id, payload) =>
      this.clients
        .find((c) => c.sessionId === id)
        ?.send(SERVER_MESSAGES.repairClosed, payload),
  );
  readonly actions = new ImpostorActions(
    this.state,
    map,
    this.round,
    this.tasks,
    (id) => this.sabotage.sessions.has(id),
  );
  private readonly movement = new MovementSimulation(
    this.state,
    map,
    (id) => this.tasks.active.has(id) || this.sabotage.sessions.has(id),
  );
  private revealTimer?: { clear(): void };
  private ghostMessages: ServerMessages['ghostHistory']['messages'] = [];
  private ghostTimes = new Map<string, number>();
  private ghostSerial = 0;
  readonly lastActivity = new Map<string, number>();
  readonly meetingFlow = new MeetingFlow(this.state, this.round, map);
  readonly meetings = new MeetingSystem(
    this.state,
    map,
    (id) => this.tasks.active.has(id) || this.sabotage.sessions.has(id),
  );

  onCreate(options: unknown) {
    // Reject bad create requests before reserving a code.
    try {
      profile(options);
    } catch (error) {
      throw new ServerError(400, (error as Error).message);
    }
    if (liveRooms.size >= maxRooms())
      throw new ServerError(
        503,
        'Server full. Please try again after a room closes.',
      );
    this.roomId = reserveRoomCode();
    liveRooms.set(this.roomId, { room: this, created: Date.now() });
    log.info({ event: 'room.created', roomId: this.roomId }, 'Room opened');
    this.state.code = this.roomId;
    void this.setPrivate(true);
    this.setPatchRate(1000 / TICK_RATE);
    this.setSimulationInterval(() => {
      this.tickLobbyIdle();
      const meetingEvent = this.meetingFlow.tick();
      if (meetingEvent === 'resume') {
        this.movement.flush();
        this.round.beginPlaying(Date.now(), this.state.settings.killCooldown);
        this.meetings.beginPlaying();
        this.sabotage.begin();
        this.clients.forEach((client) => this.sendActionStatus(client));
      } else if (meetingEvent) {
        this.clients.forEach((c) => {
          if (this.state.players.get(c.sessionId)?.alive === false)
            this.sendGhostHistory(c);
        });
        this.movement.flush();
        this.broadcast(SERVER_MESSAGES.voteResult, meetingEvent.result, {
          afterNextPatch: true,
        });
      }
      const reason = this.sabotage.tick();
      if (reason) {
        this.finishRound({ winner: 'impostor', reason });
      }
      this.checkWin();
      for (const [id, session] of this.tasks.active) {
        const player = this.state.players.get(id);
        if (
          this.state.phase !== 'playing' ||
          !player ||
          !player.connected ||
          player.inVent ||
          Date.now() > session.readyAt + 60000
        ) {
          this.tasks.active.delete(id);
          this.clients
            .find((c) => c.sessionId === id)
            ?.send(SERVER_MESSAGES.taskClosed, {
              token: session.token,
              error: 'Station session ended. Open it again to retry.',
            });
        }
      }
      this.movement.tick();
    }, 1000 / TICK_RATE);
    this.onMessage(CLIENT_MESSAGES.input, (client, payload: unknown) => {
      // Ignore malformed/replayed input without amplifying spam with error replies.
      if (
        this.movement.enqueue(client.sessionId, payload) &&
        isRecord(payload) &&
        (payload.dx || payload.dy)
      )
        this.lastActivity.set(client.sessionId, Date.now());
    });
    this.onMessage(CLIENT_MESSAGES.ghostChat, (client, payload: unknown) => {
      try {
        const own = this.state.players.get(client.sessionId);
        if (
          !isRecord(payload) ||
          payload.roundId !== this.state.roundId ||
          Object.keys(payload).some((k) => !['roundId', 'text'].includes(k)) ||
          !own ||
          own.alive ||
          !own.connected ||
          !['playing', 'meeting', 'voting', 'ejection'].includes(
            this.state.phase,
          )
        )
          throw new Error(
            'Ghost chat is only available to dead players in this round.',
          );
        const text = meetingText(payload.text),
          now = Date.now();
        if (now - (this.ghostTimes.get(own.id) ?? 0) < 1000)
          throw new Error('Wait one second between messages.');
        this.ghostTimes.set(own.id, now);
        this.ghostMessages.push({
          id: ++this.ghostSerial,
          senderId: own.id,
          name: own.name,
          text,
        });
        if (this.ghostMessages.length > 100) this.ghostMessages.shift();
        this.clients.forEach((c) => {
          if (this.state.players.get(c.sessionId)?.alive === false)
            this.sendGhostHistory(c);
        });
      } catch (error) {
        this.error(client, 'invalidPayload', (error as Error).message);
      }
    });
    this.onMessage(CLIENT_MESSAGES.sabotage, (client, payload: unknown) => {
      try {
        this.sabotage.activate(client.sessionId, payload);
      } catch (error) {
        this.error(client, 'invalidPayload', (error as Error).message);
      }
    });
    this.onMessage(CLIENT_MESSAGES.openRepair, (client, payload: unknown) => {
      try {
        const opened = this.sabotage.open(client.sessionId, payload);
        this.movement.flush(client.sessionId);
        client.send(SERVER_MESSAGES.repairOpened, opened);
      } catch (error) {
        this.error(client, 'invalidPayload', (error as Error).message);
      }
    });
    this.onMessage(CLIENT_MESSAGES.fixSabotage, (client, payload: unknown) => {
      try {
        this.sabotage.fix(client.sessionId, payload);
      } catch (error) {
        this.error(client, 'invalidPayload', (error as Error).message);
      }
    });
    this.onMessage(CLIENT_MESSAGES.cancelRepair, (client, payload: unknown) => {
      if (
        isRecord(payload) &&
        Object.keys(payload).length === 1 &&
        (typeof payload.token === 'string' || payload.token === null)
      )
        this.sabotage.cancel(client.sessionId, payload.token);
    });
    this.onMessage(CLIENT_MESSAGES.report, (client, payload: unknown) => {
      try {
        this.enterMeeting(this.meetings.report(client.sessionId, payload));
      } catch (error) {
        this.error(client, 'invalidPayload', (error as Error).message);
      }
    });
    this.onMessage(CLIENT_MESSAGES.chat, (client, payload: unknown) => {
      try {
        client.send(
          SERVER_MESSAGES.chatAccepted,
          this.meetingFlow.chat(client.sessionId, payload),
          { afterNextPatch: true },
        );
      } catch (error) {
        this.error(client, 'invalidPayload', (error as Error).message);
      }
    });
    this.onMessage(CLIENT_MESSAGES.vote, (client, payload: unknown) => {
      try {
        this.meetingFlow.vote(client.sessionId, payload);
      } catch (error) {
        this.error(client, 'invalidPayload', (error as Error).message);
      }
    });
    this.onMessage(CLIENT_MESSAGES.emergency, (client, payload: unknown) => {
      try {
        this.enterMeeting(this.meetings.emergency(client.sessionId, payload));
      } catch (error) {
        this.error(client, 'invalidPayload', (error as Error).message);
      }
    });
    this.onMessage(CLIENT_MESSAGES.kill, (client, payload: unknown) => {
      try {
        const result = this.actions.kill(client.sessionId, payload);
        this.movement.flush(client.sessionId);
        this.movement.flush(result.victimId);
        const victim = this.clients.find(
          (c) => c.sessionId === result.victimId,
        );
        const session = this.tasks.active.get(result.victimId);
        if (session) {
          this.tasks.active.delete(result.victimId);
          victim?.send(SERVER_MESSAGES.taskClosed, {
            token: session.token,
            error: 'You were killed. Station check cancelled.',
          });
        }
        client.send(SERVER_MESSAGES.killed, result, { afterNextPatch: true });
        victim?.send(SERVER_MESSAGES.killed, result, { afterNextPatch: true });
        this.sendActionStatus(client);
        if (victim) this.sendGhostHistory(victim);
        this.checkWin();
      } catch (error) {
        this.error(client, 'invalidPayload', (error as Error).message);
      }
    });
    this.onMessage(CLIENT_MESSAGES.vent, (client, payload: unknown) => {
      try {
        this.actions.vent(client.sessionId, payload);
        this.movement.flush(client.sessionId);
        this.sendActionStatus(client);
      } catch (error) {
        this.error(client, 'invalidPayload', (error as Error).message);
      }
    });
    this.onMessage(CLIENT_MESSAGES.useTask, (client, payload: unknown) => {
      if (
        !isRecord(payload) ||
        typeof payload.taskId !== 'string' ||
        !Number.isInteger(payload.roundId) ||
        Object.keys(payload).some((k) => !['taskId', 'roundId'].includes(k))
      )
        return this.error(client, 'invalidPayload', 'Choose an assigned task.');
      try {
        if (this.sabotage.sessions.has(client.sessionId))
          throw new Error('Close your repair panel first.');
        const opened = this.tasks.open(
          client.sessionId,
          payload.taskId,
          payload.roundId as number,
        );
        this.movement.flush(client.sessionId);
        client.send(SERVER_MESSAGES.taskOpened, opened);
      } catch (error) {
        this.error(client, 'invalidPayload', (error as Error).message);
      }
    });
    this.onMessage(CLIENT_MESSAGES.cancelTask, (client, payload: unknown) => {
      if (
        !isRecord(payload) ||
        (payload.token !== null && typeof payload.token !== 'string') ||
        Object.keys(payload).some((k) => k !== 'token')
      )
        return;
      const token =
        payload.token ?? this.tasks.active.get(client.sessionId)?.token;
      if (token) {
        this.tasks.cancel(client.sessionId, token);
        client.send(SERVER_MESSAGES.taskClosed, { token });
      }
    });
    this.onMessage(CLIENT_MESSAGES.taskComplete, (client, payload: unknown) => {
      if (
        !isRecord(payload) ||
        typeof payload.taskId !== 'string' ||
        typeof payload.token !== 'string' ||
        !Number.isInteger(payload.roundId) ||
        Object.keys(payload).some(
          (k) => !['taskId', 'roundId', 'token'].includes(k),
        )
      )
        return this.error(
          client,
          'invalidPayload',
          'Open a task before completing it.',
        );
      try {
        this.tasks.complete(
          client.sessionId,
          payload.taskId,
          payload.roundId as number,
          payload.token,
        );
        const entry = this.round.players.get(client.sessionId)!;
        client.send(SERVER_MESSAGES.taskList, {
          roundId: this.state.roundId,
          tasks: entry.tasks,
          fake: false,
        } satisfies ServerMessages['taskList']);
        client.send(SERVER_MESSAGES.taskClosed, { token: payload.token });
        this.checkWin();
      } catch (error) {
        this.tasks.cancel(client.sessionId, payload.token);
        client.send(SERVER_MESSAGES.taskClosed, {
          token: payload.token,
          error: (error as Error).message,
        });
      }
    });
    this.onMessage(
      CLIENT_MESSAGES.updateProfile,
      (client, payload: unknown) => {
        const player = this.lobbyPlayer(client);
        if (!player) return;
        if (
          !isRecord(payload) ||
          !Object.keys(payload).length ||
          Object.keys(payload).some((key) => key !== 'name' && key !== 'color')
        ) {
          return this.error(
            client,
            'invalidPayload',
            'Update your name or colour.',
          );
        }
        try {
          const name = Object.hasOwn(payload, 'name')
            ? sanitizeName(payload.name)
            : player.name;
          const color = Object.hasOwn(payload, 'color')
            ? payload.color
            : player.color;
          if (!isColorId(color))
            throw new Error('Choose one of the available colours.');
          if (
            [...this.state.players.values()].some(
              (other) => other.id !== player.id && other.color === color,
            )
          ) {
            return this.error(
              client,
              'colorTaken',
              'That colour was just taken. Choose another.',
            );
          }
          player.name = name;
          player.color = color;
        } catch (error) {
          this.error(client, 'invalidPayload', (error as Error).message);
        }
      },
    );
    this.onMessage(CLIENT_MESSAGES.ready, (client, payload: unknown) => {
      const player = this.lobbyPlayer(client);
      if (!player) return;
      if (
        !isRecord(payload) ||
        typeof payload.ready !== 'boolean' ||
        Object.keys(payload).some((key) => key !== 'ready')
      ) {
        return this.error(client, 'invalidPayload', 'Ready must be on or off.');
      }
      player.ready = payload.ready;
    });
    this.onMessage(
      CLIENT_MESSAGES.updateSettings,
      (client, payload: unknown) => {
        const player = this.lobbyPlayer(client);
        if (!player || !this.requireHost(client, player)) return;
        try {
          const patch = validateSettingsPatch(payload, this.state.settings);
          Object.assign(this.state.settings, patch);
          // Readiness describes agreement to the current settings.
          this.state.players.forEach((entry) => {
            entry.ready = false;
          });
        } catch (error) {
          this.error(client, 'invalidPayload', (error as Error).message);
        }
      },
    );
    this.onMessage(CLIENT_MESSAGES.start, (client, payload: unknown) => {
      const player = this.lobbyPlayer(client);
      if (
        !player ||
        !this.requireHost(client, player) ||
        !this.emptyPayload(client, payload)
      )
        return;
      const reason = startRequirement(
        this.state.players.size,
        this.state.settings.impostors,
      );
      if (reason) return this.error(client, 'notEnoughPlayers', reason);
      if ([...this.state.players.values()].some((p) => !p.connected))
        return this.error(
          client,
          'invalidPayload',
          'Wait for reconnecting players before starting.',
        );
      this.startRound(client);
    });
    this.onMessage(CLIENT_MESSAGES.cancelStart, (client, payload: unknown) => {
      const player = this.state.players.get(client.sessionId);
      if (
        !player ||
        !this.requireHost(client, player) ||
        !this.emptyPayload(client, payload)
      )
        return;
      if (
        this.state.phase !== 'starting' &&
        this.state.phase !== 'playing' &&
        this.state.phase !== 'meeting' &&
        this.state.phase !== 'voting' &&
        this.state.phase !== 'ejection' &&
        this.state.phase !== 'ended'
      )
        return this.error(
          client,
          'wrongPhase',
          'There is no active round to reset.',
        );
      this.returnToLobby();
    });
    this.onMessage('*', (client) =>
      this.error(
        client,
        'notImplemented',
        'That action is not available in this build yet.',
      ),
    );
  }

  onAuth(_client: Client, options: unknown) {
    if (this.state.phase !== 'lobby')
      throw new ServerError(
        409,
        'This game has already started. Join the next round.',
      );
    try {
      return profile(options);
    } catch (error) {
      throw new ServerError(400, (error as Error).message);
    }
  }

  onJoin(client: Client, _options: unknown, auth: JoinOptions) {
    // Auth and seat reservations can precede a host's start message.
    if (this.state.phase !== 'lobby')
      throw new ServerError(
        409,
        'This game has already started. Join the next round.',
      );
    const used = new Set(
      [...this.state.players.values()].map((entry) => entry.color),
    );
    const color = used.has(auth.color)
      ? COLORS.find((entry) => !used.has(entry.id))?.id
      : auth.color;
    if (!color) throw new ServerError(409, 'This room is full.');
    const player = new Player();
    player.id = client.sessionId;
    player.name = auth.name;
    player.color = color;
    player.isHost = this.state.players.size === 0;
    const spawn =
      map.spawnPoints.find((point) =>
        [...this.state.players.values()].every(
          (other) => Math.hypot(other.x - point.x, other.y - point.y) >= 48,
        ),
      ) ?? map.spawnPoints[0]!;
    player.x = spawn.x;
    player.y = spawn.y;
    this.state.players.set(player.id, player);
    this.lastActivity.set(player.id, Date.now());
  }

  onDrop(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    player.connected = false;
    player.walking = false;
    player.inVent = false;
    this.sabotage.cancel(client.sessionId, null);
    this.tasks.active.delete(client.sessionId);
    this.actions.vents.delete(client.sessionId);
    this.movement.remove(client.sessionId);
    if (player.isHost) {
      player.isHost = false;
      this.migrateHost();
    }
    this.allowReconnection(client, 30);
  }
  onReconnect(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    player.connected = true;
    this.lastActivity.set(client.sessionId, Date.now());
    this.migrateHost();
    const entry = this.round.players.get(client.sessionId);
    if (entry) {
      const teammates =
        entry.role === 'impostor'
          ? [...this.round.players]
              .filter(
                ([id, p]) => id !== client.sessionId && p.role === 'impostor',
              )
              .map(([id]) => ({ id, name: this.state.players.get(id)!.name }))
          : [];
      client.send(
        SERVER_MESSAGES.roleReveal,
        {
          roundId: this.state.roundId,
          role: entry.role,
          teammates,
          durationMs: Math.max(0, this.state.phaseEndsAt - Date.now()),
        } satisfies ServerMessages['roleReveal'],
        { afterNextPatch: true },
      );
      client.send(
        SERVER_MESSAGES.taskList,
        {
          roundId: this.state.roundId,
          tasks: entry.tasks.map((t) => ({ ...t })),
          fake: entry.role === 'impostor',
        } satisfies ServerMessages['taskList'],
        { afterNextPatch: true },
      );
      this.sendActionStatus(client);
      if (!player.alive) this.sendGhostHistory(client);
    }
  }
  private migrateHost() {
    if ([...this.state.players.values()].some((p) => p.isHost && p.connected))
      return;
    const next = [...this.state.players.values()].find((p) => p.connected);
    if (next) next.isHost = true;
  }
  tickLobbyIdle(now = Date.now()) {
    if (this.state.phase !== 'lobby') {
      for (const id of this.lastActivity.keys()) this.lastActivity.set(id, now);
      return;
    }
    for (const c of this.clients)
      if (now - (this.lastActivity.get(c.sessionId) ?? now) >= 180000) {
        this.error(
          c,
          'invalidPayload',
          'Removed after 3 minutes idle in the lobby. You can join again.',
        );
        c.leave(CloseCode.CONSENTED);
      }
  }

  onLeave(client: Client) {
    if (this.state.players.get(client.sessionId)?.connected === false)
      this.meetingFlow.expireVoter(client.sessionId);
    this.lastActivity.delete(client.sessionId);
    this.sabotage.cancel(client.sessionId, null);
    this.actions.vents.delete(client.sessionId);
    this.tasks.active.delete(client.sessionId);
    this.movement.remove(client.sessionId);
    const player = this.state.players.get(client.sessionId);
    this.state.players.delete(client.sessionId);
    this.round.players.delete(client.sessionId);
    this.state.taskProgress = this.round.progress();
    // Map insertion order is join order, regardless of profile changes.
    if (player?.isHost) {
      this.migrateHost();
    }
    // Any departure during reveal invalidates the already-distributed teams.
    if (this.state.phase === 'starting') {
      this.returnToLobby();
    }
  }

  onDispose() {
    liveRooms.delete(this.roomId);
    log.info({ event: 'room.closed', roomId: this.roomId }, 'Room closed');
    this.meetingFlow.clear();
    this.meetings.clear();
    this.sabotage.clear();
    this.actions.clear();
    this.tasks.active.clear();
    this.revealTimer?.clear();
    this.round.clear();
    releaseRoomCode(this.roomId);
  }

  private returnToLobby() {
    this.state.finalResult = '';
    this.ghostMessages = [];
    this.ghostTimes.clear();
    this.meetingFlow.clear();
    this.meetings.clear();
    this.sabotage.clear();
    this.state.endReason = '';
    this.actions.clear();
    this.tasks.active.clear();
    this.revealTimer?.clear();
    this.revealTimer = undefined;
    this.movement.flush();
    this.round.clear();
    this.state.phase = 'lobby';
    this.state.phaseEndsAt = 0;
    this.state.taskProgress = 0;
    this.state.winner = undefined;
    this.state.meeting = undefined;
    this.state.sabotage = undefined;
    this.state.players.forEach((player) => {
      player.ready = false;
      player.tasksDone = 0;
      player.tasksTotal = 0;
      player.alive = true;
      player.inVent = false;
      player.walking = false;
    });
    void this.unlock();
  }

  private startRound(client: Client) {
    const players = [...this.state.players.values()];
    try {
      this.round.start(players, this.state.settings);
    } catch (error) {
      return this.error(client, 'invalidPayload', (error as Error).message);
    }
    this.revealTimer?.clear();
    const roundId = ++this.state.roundId;
    this.state.finalResult = '';
    this.ghostMessages = [];
    this.ghostTimes.clear();
    this.meetingFlow.clear();
    this.meetings.clear();
    this.sabotage.clear();
    this.state.endReason = '';
    this.actions.clear();
    this.state.phase = 'starting';
    this.state.phaseEndsAt = Date.now() + ROLE_REVEAL_MS;
    this.state.taskProgress = 0;
    this.state.winner = undefined;
    this.state.meeting = undefined;
    this.state.sabotage = undefined;
    this.movement.flush();
    players.forEach((player, index) => {
      Object.assign(player, map.spawnPoints[index]!);
      player.alive = true;
      player.inVent = false;
      player.walking = false;
      player.facing = 1;
      player.tasksDone = 0;
      player.tasksTotal = this.round.players.get(player.id)!.tasks.length;
    });
    void this.lock();
    for (const connection of this.clients) {
      const entry = this.round.players.get(connection.sessionId)!;
      const teammates =
        entry.role === 'impostor'
          ? players
              .filter(
                (player) =>
                  player.id !== connection.sessionId &&
                  this.round.players.get(player.id)!.role === 'impostor',
              )
              .map((player) => ({ id: player.id, name: player.name }))
          : [];
      connection.send(
        SERVER_MESSAGES.roleReveal,
        {
          roundId,
          role: entry.role,
          teammates,
          durationMs: ROLE_REVEAL_MS,
        } satisfies ServerMessages['roleReveal'],
        { afterNextPatch: true },
      );
      connection.send(
        SERVER_MESSAGES.taskList,
        {
          roundId,
          tasks: entry.tasks.map((task) => ({ ...task })),
          fake: entry.role === 'impostor',
        } satisfies ServerMessages['taskList'],
        { afterNextPatch: true },
      );
    }
    this.revealTimer = this.clock.setTimeout(() => {
      if (this.state.phase !== 'starting' || this.state.roundId !== roundId)
        return;
      this.round.beginPlaying(Date.now(), this.state.settings.killCooldown);
      this.state.phaseEndsAt = 0;
      this.state.phase = 'playing';
      this.sabotage.begin();
      this.meetings.beginPlaying();
      this.clients.forEach((connection) => this.sendActionStatus(connection));
      this.revealTimer = undefined;
    }, ROLE_REVEAL_MS);
  }

  private enterMeeting(payload: ServerMessages['meetingStart']) {
    this.meetingFlow.prepare();
    this.movement.flush();
    this.sabotage.clear();
    this.actions.vents.clear();
    for (const [id, session] of this.tasks.active) {
      this.clients
        .find((c) => c.sessionId === id)
        ?.send(SERVER_MESSAGES.taskClosed, {
          token: session.token,
          error: 'Meeting called. Earlier task stages stay saved.',
        } satisfies ServerMessages['taskClosed']);
    }
    this.tasks.active.clear();
    this.broadcast(SERVER_MESSAGES.meetingStart, payload, {
      afterNextPatch: true,
    });
  }

  private sendGhostHistory(client: Client) {
    client.send(
      SERVER_MESSAGES.ghostHistory,
      {
        roundId: this.state.roundId,
        messages: this.ghostMessages,
      } satisfies ServerMessages['ghostHistory'],
      { afterNextPatch: true },
    );
  }
  private checkWin() {
    if (this.state.phase !== 'playing') return;
    const result = evaluateWin(this.state, this.round);
    if (result) this.finishRound(result);
  }
  private finishRound(
    result: Pick<ServerMessages['gameOver'], 'winner' | 'reason'>,
  ) {
    if (this.state.finalResult) return;
    const payload = resultPayload(this.state, this.round, result);
    log.info(
      {
        event: 'round.ended',
        roomId: this.roomId,
        roundId: this.state.roundId,
        ...result,
      },
      'Round ended',
    );
    this.state.phase = 'ended';
    this.state.winner = result.winner;
    this.state.endReason = result.reason;
    this.state.phaseEndsAt = 0;
    this.state.finalResult = JSON.stringify(payload);
    this.state.meeting = undefined;
    this.sabotage.clear();
    this.meetingFlow.clear();
    this.actions.vents.clear();
    this.movement.flush();
    this.tasks.active.clear();
    this.state.players.forEach((p) => {
      p.walking = false;
      p.inVent = false;
    });
    this.broadcast(SERVER_MESSAGES.gameOver, payload, { afterNextPatch: true });
  }

  private sendActionStatus(client: Client) {
    const status = this.actions.status(client.sessionId);
    if (status)
      client.send(SERVER_MESSAGES.impostorStatus, status, {
        afterNextPatch: true,
      });
  }

  private lobbyPlayer(client: Client): Player | undefined {
    this.lastActivity.set(client.sessionId, Date.now());
    if (this.state.phase !== 'lobby') {
      this.error(
        client,
        'wrongPhase',
        'Wait until the room returns to the lobby.',
      );
      return;
    }
    return this.state.players.get(client.sessionId);
  }
  private requireHost(client: Client, player: Player) {
    if (player.isHost) return true;
    this.error(client, 'hostOnly', 'Only the host can do that.');
    return false;
  }
  private emptyPayload(client: Client, value: unknown) {
    if (isRecord(value) && Object.keys(value).length === 0) return true;
    this.error(client, 'invalidPayload', 'This action takes no options.');
    return false;
  }
  private error(client: Client, code: ErrorCode, message: string) {
    client.send(SERVER_MESSAGES.error, {
      code,
      message,
    } satisfies ServerMessages['error']);
  }
}
