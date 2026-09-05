import { Room, ServerError, type Client } from '@colyseus/core';
import {
  COLORS,
  MAX_PLAYERS,
  TICK_RATE,
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

  onCreate(options: unknown) {
    // Reject bad create requests before reserving a code.
    try {
      profile(options);
    } catch (error) {
      throw new ServerError(400, (error as Error).message);
    }
    this.roomId = reserveRoomCode();
    this.state.code = this.roomId;
    void this.setPrivate(true);
    this.setPatchRate(1000 / TICK_RATE);
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
      this.state.phase = 'starting';
      void this.lock();
    });
    this.onMessage(CLIENT_MESSAGES.cancelStart, (client, payload: unknown) => {
      const player = this.state.players.get(client.sessionId);
      if (
        !player ||
        !this.requireHost(client, player) ||
        !this.emptyPayload(client, payload)
      )
        return;
      if (this.state.phase !== 'starting')
        return this.error(client, 'wrongPhase', 'The room is not starting.');
      this.returnToLobby();
    });
    this.onMessage('*', (client) =>
      this.error(
        client,
        'notImplemented',
        'That action is not available in the lobby build.',
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
    this.state.players.set(player.id, player);
  }

  onLeave(client: Client) {
    const player = this.state.players.get(client.sessionId);
    this.state.players.delete(client.sessionId);
    // Map insertion order is join order, regardless of profile changes.
    if (player?.isHost) {
      const successor = this.state.players.values().next().value;
      if (successor) successor.isHost = true;
    }
    if (
      this.state.phase === 'starting' &&
      startRequirement(this.state.players.size, this.state.settings.impostors)
    ) {
      this.returnToLobby();
    }
  }

  onDispose() {
    releaseRoomCode(this.roomId);
  }

  private returnToLobby() {
    this.state.phase = 'lobby';
    this.state.players.forEach((player) => {
      player.ready = false;
    });
    void this.unlock();
  }

  private lobbyPlayer(client: Client): Player | undefined {
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
