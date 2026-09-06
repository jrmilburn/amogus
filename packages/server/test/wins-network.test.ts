import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AddressInfo } from 'node:net';
import { Client, type Room } from '@colyseus/sdk';
import { matchMaker } from '@colyseus/core';
import { GAME_ROOM, GameState, type ServerMessages } from '@mutiny/shared';
import { createGameServer } from '../src/app.js';
import type { GameRoom } from '../src/rooms/GameRoom.js';
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(check: () => boolean) {
  for (let i = 0; i < 300; i++) {
    if (check()) return;
    await pause(20);
  }
  assert.fail('Round result did not arrive');
}
test(
  'all five victory paths publish roles only at end and host replay retains room/settings; ghost chat is private',
  { timeout: 30000 },
  async () => {
    const { gameServer, httpServer } = createGameServer();
    const clients: Room<unknown, GameState>[] = [];
    try {
      await gameServer.listen(0, '127.0.0.1');
      const sdk = new Client(
        `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`,
      );
      const histories = new Map<string, ServerMessages['ghostHistory']>();
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
        clients.push(c);
        c.reconnection.enabled = false;
        c.onMessage('*', () => {});
        c.onMessage<ServerMessages['ghostHistory']>('ghostHistory', (p) =>
          histories.set(c.sessionId, p),
        );
      }
      const host = clients[0]!;
      await until(() => host.state?.players.size === 4);
      const server = matchMaker.getLocalRoomById(host.roomId) as GameRoom;
      for (const reason of [
        'tasks',
        'noImpostors',
        'parity',
        'reactor',
        'o2',
      ] as const) {
        host.send('start', {});
        await until(() => clients.every((c) => c.state.phase === 'playing'));
        assert.equal(host.state.finalResult, '');
        assert.equal(
          Object.hasOwn(host.state.players.get(host.sessionId)!, 'role'),
          false,
        );
        const imp = [...server.round.players].find(
          ([, p]) => p.role === 'impostor',
        )![0];
        const crew = [...server.round.players]
          .filter(([, p]) => p.role === 'crew')
          .map(([id]) => id);
        if (reason === 'tasks') {
          const ghost = clients.find((c) => c.sessionId === crew[0])!;
          server.state.players.get(ghost.sessionId)!.alive = false;
          await until(
            () => ghost.state.players.get(ghost.sessionId)!.alive === false,
          );
          ghost.send('ghostChat', {
            roundId: server.state.roundId,
            text: 'Still finishing tasks',
          });
          await until(
            () => histories.get(ghost.sessionId)?.messages.length === 1,
          );
          assert.equal(histories.size, 1);
          for (const id of crew)
            server.round.players
              .get(id)!
              .tasks.forEach((t) => (t.completed = true));
        } else if (reason === 'noImpostors')
          server.state.players.get(imp)!.alive = false;
        else if (reason === 'parity')
          crew
            .slice(0, 2)
            .forEach((id) => (server.state.players.get(id)!.alive = false));
        else {
          server.state.sabotageReadyAt = 0;
          server.sabotage.activate(imp, {
            kind: reason,
            roundId: server.state.roundId,
          });
          server.state.sabotage!.endsAt = Date.now() - 1;
        }
        await until(() =>
          clients.every(
            (c) => c.state.phase === 'ended' && !!c.state.finalResult,
          ),
        );
        for (const c of clients) {
          const result = JSON.parse(
            c.state.finalResult,
          ) as ServerMessages['gameOver'];
          assert.equal(result.reason, reason);
          assert.equal(
            result.winner,
            ['tasks', 'noImpostors'].includes(reason) ? 'crew' : 'impostor',
          );
          assert.equal(Object.keys(result.roles).length, 4);
          assert.equal(result.lineup.length, 4);
        }
        const code = host.state.code,
          speed = host.state.settings.playerSpeed;
        host.send('cancelStart', {});
        await until(() => clients.every((c) => c.state.phase === 'lobby'));
        assert.equal(host.state.code, code);
        assert.equal(host.state.settings.playerSpeed, speed);
        assert.equal(host.state.finalResult, '');
        assert.ok([...host.state.players.values()].every((p) => p.alive));
      }
    } finally {
      await Promise.allSettled(
        clients.filter((c) => c.connection.isOpen).map((c) => c.leave()),
      );
      await gameServer.gracefullyShutdown(false);
    }
  },
);
