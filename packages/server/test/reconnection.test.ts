import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AddressInfo } from 'node:net';
import { Client, type Room } from '@colyseus/sdk';
import { matchMaker } from '@colyseus/core';
import { GAME_ROOM, GameState, type ServerMessages } from '@mutiny/shared';
import { createGameServer } from '../src/app.js';
import type { GameRoom } from '../src/rooms/GameRoom.js';
async function until(check: () => boolean) {
  for (let i = 0; i < 300; i++) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  assert.fail('Reconnect state did not arrive');
}
test(
  'fresh client reconnect retains identity/position/private assignments, migrates host and lobby idle kicks',
  { timeout: 15000 },
  async () => {
    const { gameServer, httpServer } = createGameServer();
    const clients: Room<unknown, GameState>[] = [];
    try {
      await gameServer.listen(0, '127.0.0.1');
      const sdk = new Client(
        `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`,
      );
      for (let i = 0; i < 4; i++) {
        const c = i
          ? await sdk.joinById<GameState>(
              clients[0]!.roomId,
              { name: `Crew ${i}`, color: 'coral' },
              GameState,
            )
          : await sdk.create<GameState>(
              GAME_ROOM,
              { name: 'Host', color: 'coral' },
              GameState,
            );
        c.reconnection.enabled = false;
        c.onMessage('*', () => {});
        clients.push(c);
      }
      const host = clients[0]!,
        peer = clients[1]!;
      await until(() => host.state?.players.size === 4);
      host.send('start', {});
      await until(() => host.state.phase === 'playing');
      const server = matchMaker.getLocalRoomById(host.roomId) as GameRoom;
      const id = host.sessionId,
        token = host.reconnectionToken,
        entry = JSON.stringify(server.round.players.get(id)),
        position = {
          x: server.state.players.get(id)!.x,
          y: server.state.players.get(id)!.y,
        };
      host.connection.close();
      await until(() => peer.state.players.get(id)?.connected === false);
      assert.equal(peer.state.players.get(peer.sessionId)!.isHost, true);
      assert.equal(server.round.players.has(id), true);
      const restored = await sdk.reconnect<GameState>(token, GameState);
      restored.reconnection.enabled = false;
      restored.onMessage('*', () => {});
      clients.push(restored);
      let role: ServerMessages['roleReveal'] | undefined,
        tasks: ServerMessages['taskList'] | undefined;
      restored.onMessage<ServerMessages['roleReveal']>(
        'roleReveal',
        (p) => (role = p),
      );
      restored.onMessage<ServerMessages['taskList']>(
        'taskList',
        (p) => (tasks = p),
      );
      await until(
        () =>
          !!role &&
          !!tasks &&
          restored.state.players.get(id)?.connected === true,
      );
      assert.equal(restored.sessionId, id);
      assert.equal(JSON.stringify(server.round.players.get(id)), entry);
      assert.equal(restored.state.players.get(id)!.x, position.x);
      assert.equal(restored.state.players.get(id)!.y, position.y);
      assert.equal(role!.role, server.round.players.get(id)!.role);
      assert.deepEqual(tasks!.tasks, server.round.players.get(id)!.tasks);
      assert.equal(restored.state.players.get(id)!.isHost, false);
      server.lastActivity.set(id, 0);
      server.tickLobbyIdle();
      assert.equal(restored.connection.isOpen, true);
      peer.send('cancelStart', {});
      await until(() => restored.state.phase === 'lobby');
      server.lastActivity.set(id, Date.now() - 180001);
      server.tickLobbyIdle();
      await until(() => !server.state.players.has(id));
      assert.equal(server.round.players.has(id), false);
    } finally {
      await Promise.allSettled(
        clients.filter((c) => c.connection.isOpen).map((c) => c.leave()),
      );
      await gameServer.gracefullyShutdown(false);
    }
  },
);

test(
  'an unused reconnect token expires after the 30 second reservation',
  { timeout: 40000 },
  async () => {
    const { gameServer, httpServer } = createGameServer();
    try {
      await gameServer.listen(0, '127.0.0.1');
      const sdk = new Client(
        `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`,
      );
      const host = await sdk.create<GameState>(
          GAME_ROOM,
          { name: 'Host', color: 'coral' },
          GameState,
        ),
        peer = await sdk.joinById<GameState>(
          host.roomId,
          { name: 'Peer', color: 'blue' },
          GameState,
        );
      host.reconnection.enabled = false;
      peer.reconnection.enabled = false;
      host.onMessage('*', () => {});
      peer.onMessage('*', () => {});
      await until(() => host.state?.players.size === 2);
      const token = peer.reconnectionToken;
      peer.connection.close();
      await until(
        () => host.state.players.get(peer.sessionId)?.connected === false,
      );
      const begin = Date.now();
      while (
        host.state.players.has(peer.sessionId) &&
        Date.now() - begin < 33000
      )
        await new Promise((r) => setTimeout(r, 100));
      assert.ok(Date.now() - begin >= 29000);
      assert.equal(host.state.players.has(peer.sessionId), false);
      await assert.rejects(() => sdk.reconnect(token, GameState));
      await host.leave();
    } finally {
      await gameServer.gracefullyShutdown(false);
    }
  },
);
