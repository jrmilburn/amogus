import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { Client, type Room } from '@colyseus/sdk';
import { matchMaker } from '@colyseus/core';
import {
  COLORS,
  GAME_ROOM,
  GameState,
  MeetingState,
  SabotageState,
  CLIENT_MESSAGES,
  SERVER_MESSAGES,
  DEFAULT_SETTINGS,
  SETTING_KEYS,
  sanitizeName,
  validateSettingsPatch,
  type ColorId,
  type ServerMessages,
} from '@mutiny/shared';
import { createGameServer } from '../src/app.js';
import type { GameRoom } from '../src/rooms/GameRoom.js';

type ClientRoom = Room<unknown, GameState>;
async function until(check: () => boolean, description: string) {
  for (let i = 0; i < 150; i++) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail(`Timed out: ${description}`);
}

test(
  'lobby authority, synchronized profiles/settings, capacity, start and host migration',
  { timeout: 20000 },
  async () => {
    const { gameServer, httpServer } = createGameServer();
    const clients: ClientRoom[] = [];
    const errors = new Map<ClientRoom, ServerMessages['error'][]>();
    try {
      await gameServer.listen(0, '127.0.0.1');
      const endpoint = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
      const sdk = new Client(endpoint);
      async function remember(room: ClientRoom) {
        room.reconnection.enabled = false;
        clients.push(room);
        room.onMessage(SERVER_MESSAGES.roleReveal, () => {});
        room.onMessage(SERVER_MESSAGES.taskList, () => {});
        const queue: ServerMessages['error'][] = [];
        errors.set(room, queue);
        room.onMessage<ServerMessages['error']>(
          SERVER_MESSAGES.error,
          (error) => queue.push(error),
        );
        await until(
          () => Boolean(room.state?.players.get(room.sessionId)),
          'first synchronized state',
        );
        return room;
      }
      async function rejected(
        room: ClientRoom,
        type: string,
        payload: unknown,
        code: string,
      ) {
        const queue = errors.get(room)!;
        queue.length = 0;
        room.send(type, payload);
        await until(() => queue.length > 0, `${type} rejection`);
        assert.equal(queue[0]?.code, code);
      }
      await assert.rejects(
        sdk.create(GAME_ROOM, { name: 'x', color: 'coral' }),
      );
      const host = await remember(
        await sdk.create<GameState>(
          GAME_ROOM,
          { name: '  Captain  ', color: 'coral' },
          GameState,
        ),
      );
      assert.match(host.roomId, /^[A-HJ-NP-Z]{5}$/);
      assert.equal(host.state.code, host.roomId);
      assert.equal(
        (await matchMaker.query({ roomId: host.roomId }))[0]?.private,
        true,
      );
      assert.equal(host.state.players.get(host.sessionId)?.name, 'Captain');
      assert.equal(host.state.players.get(host.sessionId)?.isHost, true);
      const peer = await remember(
        await sdk.joinById<GameState>(
          host.roomId,
          { name: 'Friend', color: 'coral' },
          GameState,
        ),
      );
      await until(
        () => host.state.players.size === 2,
        'second player visible to host',
      );
      assert.notEqual(peer.state.players.get(peer.sessionId)?.color, 'coral');
      await rejected(
        peer,
        CLIENT_MESSAGES.updateSettings,
        { killCooldown: 10 },
        'hostOnly',
      );
      await rejected(peer, CLIENT_MESSAGES.start, {}, 'hostOnly');
      await rejected(host, CLIENT_MESSAGES.start, {}, 'notEnoughPlayers');
      await rejected(
        peer,
        CLIENT_MESSAGES.updateProfile,
        { color: 'coral' },
        'colorTaken',
      );
      await rejected(
        peer,
        CLIENT_MESSAGES.updateProfile,
        { name: 'Changed', color: 'nope' },
        'invalidPayload',
      );
      assert.equal(host.state.players.get(peer.sessionId)?.name, 'Friend');
      await rejected(
        peer,
        CLIENT_MESSAGES.updateProfile,
        { isHost: true },
        'invalidPayload',
      );
      await rejected(
        peer,
        CLIENT_MESSAGES.ready,
        { ready: 'yes' },
        'invalidPayload',
      );
      await rejected(
        host,
        CLIENT_MESSAGES.updateSettings,
        { playerSpeed: 10000, killCooldown: 10 },
        'invalidPayload',
      );
      await rejected(
        host,
        CLIENT_MESSAGES.updateSettings,
        { tasksShort: 0, tasksLong: 0 },
        'invalidPayload',
      );
      assert.equal(host.state.settings.killCooldown, 30);
      assert.equal(host.state.settings.playerSpeed, 200);
      peer.send(CLIENT_MESSAGES.updateProfile, {
        name: '  Jo<>  ',
        color: 'cyan',
      });
      peer.send(CLIENT_MESSAGES.ready, { ready: true });
      await until(
        () =>
          host.state.players.get(peer.sessionId)?.name === 'Jo' &&
          host.state.players.get(peer.sessionId)?.ready === true,
        'profile and ready deltas',
      );
      assert.equal(host.state.players.get(peer.sessionId)?.color, 'cyan');
      host.send(CLIENT_MESSAGES.updateSettings, {
        killCooldown: 40,
        anonymousVotes: false,
        crewVision: 1.25,
      });
      await until(
        () =>
          peer.state.settings.killCooldown === 40 &&
          !peer.state.players.get(peer.sessionId)?.ready,
        'settings and ready reset',
      );
      assert.equal(peer.state.settings.anonymousVotes, false);
      assert.equal(peer.state.settings.crewVision, 1.25);

      for (let i = 2; i < 4; i++) {
        await remember(
          await sdk.joinById<GameState>(
            host.roomId,
            { name: `Player ${i}`, color: COLORS[i]!.id },
            GameState,
          ),
        );
      }
      await until(() => host.state.players.size === 4, 'four players');
      host.send(CLIENT_MESSAGES.updateSettings, { impostors: 2 });
      await until(
        () => host.state.settings.impostors === 2,
        'two impostor setting',
      );
      await rejected(host, CLIENT_MESSAGES.start, {}, 'notEnoughPlayers');
      host.send(CLIENT_MESSAGES.updateSettings, { impostors: 1 });
      host.send(CLIENT_MESSAGES.start, {});
      await until(
        () =>
          clients
            .slice(0, 4)
            .every((client) => client.state.phase === 'starting'),
        'start sync',
      );
      await assert.rejects(
        sdk.joinById(host.roomId, { name: 'Late join', color: 'olive' }),
      );
      await rejected(
        peer,
        CLIENT_MESSAGES.updateProfile,
        { name: 'Changed' },
        'wrongPhase',
      );
      await rejected(peer, CLIENT_MESSAGES.cancelStart, {}, 'hostOnly');
      host.send(CLIENT_MESSAGES.cancelStart, {});
      await until(() => peer.state.phase === 'lobby', 'return to lobby');

      for (let i = 4; i < 10; i++) {
        await remember(
          await sdk.joinById<GameState>(
            host.roomId,
            { name: `Player ${i}`, color: 'coral' },
            GameState,
          ),
        );
      }
      await until(() => host.state.players.size === 10, 'full room');
      const colors = new Set(
        [...host.state.players.values()].map((player) => player.color),
      );
      assert.equal(colors.size, 10);
      await assert.rejects(
        sdk.joinById(host.roomId, { name: 'Eleventh', color: 'olive' }),
      );

      // Dynamically attached secret data must not enter the schema wire format.
      const serverRoom = matchMaker.getLocalRoomById(host.roomId) as GameRoom;
      Object.assign(serverRoom.state.players.get(host.sessionId)!, {
        role: 'impostor',
      });
      serverRoom.state.meeting = new MeetingState();
      serverRoom.state.meeting.callerId = host.sessionId;
      serverRoom.state.sabotage = new SabotageState();
      serverRoom.state.sabotage.kind = 'reactor';
      serverRoom.state.players.get(host.sessionId)!.lastProcessedSeq = 42;
      await until(
        () => peer.state.players.get(host.sessionId)?.lastProcessedSeq === 42,
        'schema updates',
      );
      assert.equal(
        Object.hasOwn(peer.state.players.get(host.sessionId)!, 'role'),
        false,
      );
      assert.equal(peer.state.meeting?.callerId, host.sessionId);
      assert.equal(peer.state.sabotage?.kind, 'reactor');
      serverRoom.state.meeting = undefined;
      serverRoom.state.sabotage = undefined;
      await until(
        () =>
          peer.state.meeting === undefined && peer.state.sabotage === undefined,
        'optional schema removal',
      );

      await host.leave();
      await until(
        () =>
          peer.state.players.get(peer.sessionId)?.isHost === true &&
          peer.state.players.size === 9,
        'host transferred to longest connected player',
      );
      assert.equal(
        [...peer.state.players.values()].filter((p) => p.isHost).length,
        1,
      );
      // Abrupt socket close exercises migration without a consented leave message.
      peer.connection.close();
      const successor = clients[2]!;
      await until(
        () => successor.state.players.get(successor.sessionId)?.isHost === true,
        'host transfer after dropped connection',
      );
      await remember(
        await sdk.joinById<GameState>(
          successor.roomId,
          { name: 'Replacement', color: 'coral' },
          GameState,
        ),
      );
      assert.equal(successor.state.phase, 'lobby');
    } finally {
      await Promise.allSettled(
        clients
          .filter((room) => room.connection.isOpen)
          .map((room) => room.leave()),
      );
      const closed = httpServer.listening
        ? once(httpServer, 'close')
        : Promise.resolve();
      await gameServer.gracefullyShutdown(false);
      await closed;
    }
  },
);

test('shared settings and identity validation rejects malformed values', () => {
  assert.equal(sanitizeName('  Zoë  '), 'Zoë');
  assert.equal(sanitizeName('１２ engineer'), '12 engineer');
  for (const value of [null, [], {}, '', 'a', '<>', 'x'.repeat(13)])
    assert.throws(() => sanitizeName(value));
  for (const value of [
    null,
    [],
    {},
    { unknown: 1 },
    { confirmEjects: 1 },
    { crewVision: 0.6 },
    { killCooldown: Infinity },
    { tasksShort: 0, tasksLong: 0 },
  ]) {
    assert.throws(() => validateSettingsPatch(value, DEFAULT_SETTINGS));
  }
  assert.deepEqual(
    validateSettingsPatch(
      { crewVision: 1.25, confirmEjects: false },
      DEFAULT_SETTINGS,
    ),
    { crewVision: 1.25, confirmEjects: false },
  );
  assert.equal(SETTING_KEYS.length, 12);
  const colorIds = new Set<ColorId>(COLORS.map((color) => color.id));
  assert.equal(colorIds.size, 12);
  assert.equal(new Set(COLORS.map((color) => color.number)).size, 12);
});
