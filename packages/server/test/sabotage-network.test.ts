import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { Client, type Room } from '@colyseus/sdk';
import { matchMaker } from '@colyseus/core';
import { GAME_ROOM, GameState, type ServerMessages } from '@mutiny/shared';
import mapData from '@mutiny/shared/maps/the-hollow.json' with { type: 'json' };
import { createGameServer } from '../src/app.js';
import type { GameRoom } from '../src/rooms/GameRoom.js';
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(check: () => boolean) {
  for (let i = 0; i < 250; i++) {
    if (check()) return;
    await delay(20);
  }
  assert.fail('Timed out waiting for sabotage state');
}

test(
  'four clients share faults/doors, keep panel codes private, freeze repairs, receive timed defeat and reset',
  { timeout: 25000 },
  async () => {
    const { gameServer, httpServer } = createGameServer(),
      clients: Room<unknown, GameState>[] = [];
    const roles = new Map<string, ServerMessages['roleReveal']>(),
      panels = new Map<string, ServerMessages['repairOpened']>();
    const ended = new Map<string, ServerMessages['gameOver']>(),
      errors: ServerMessages['error'][] = [];
    try {
      await gameServer.listen(0, '127.0.0.1');
      const sdk = new Client(
        `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`,
      );
      for (let i = 0; i < 4; i++) {
        const c =
          i === 0
            ? await sdk.create<GameState>(
                GAME_ROOM,
                { name: `Crew ${i}`, color: 'coral' },
                GameState,
              )
            : await sdk.joinById<GameState>(
                clients[0]!.roomId,
                { name: `Crew ${i}`, color: 'coral' },
                GameState,
              );
        clients.push(c);
        c.reconnection.enabled = false;
        c.onMessage<ServerMessages['roleReveal']>('roleReveal', (p) =>
          roles.set(c.sessionId, p),
        );
        c.onMessage('taskList', () => {});
        c.onMessage('impostorStatus', () => {});
        c.onMessage('repairClosed', () => {});
        c.onMessage<ServerMessages['repairOpened']>('repairOpened', (p) =>
          panels.set(c.sessionId, p),
        );
        c.onMessage<ServerMessages['gameOver']>('gameOver', (p) => {
          assert.equal(c.state.phase, 'ended');
          ended.set(c.sessionId, p);
        });
        c.onMessage<ServerMessages['error']>('error', (p) => errors.push(p));
      }
      const host = clients[0]!;
      await until(() => host.state?.players.size === 4);
      host.send('start', {});
      await until(
        () =>
          roles.size === 4 && clients.every((c) => c.state.phase === 'playing'),
      );
      const server = matchMaker.getLocalRoomById(host.roomId) as GameRoom;
      const imp = clients.find(
          (c) => roles.get(c.sessionId)!.role === 'impostor',
        )!,
        crew = clients.find((c) => roles.get(c.sessionId)!.role === 'crew')!;
      server.state.sabotageReadyAt = 0;
      imp.send('sabotage', { kind: 'lights', roundId: 1 });
      await until(() =>
        clients.every((c) => c.state.sabotage?.kind === 'lights'),
      );
      const lights = mapData.sabotagePoints.find((p) => p.kind === 'lights')!;
      Object.assign(server.state.players.get(crew.sessionId)!, {
        x: lights.x,
        y: lights.y,
      });
      crew.send('openRepair', {
        pointId: lights.id,
        sabotageId: server.state.sabotage!.id,
        roundId: 1,
      });
      await until(() => panels.has(crew.sessionId));
      assert.equal(panels.size, 1);
      const s = panels.get(crew.sessionId)!;
      assert.equal(s.code, undefined);
      crew.send('input', { seq: 1, dx: 1, dy: 0 });
      await delay(100);
      assert.equal(server.state.players.get(crew.sessionId)!.x, lights.x);
      for (let i = 0; i < 5; i++)
        crew.send('fixSabotage', { ...s, action: 'switch', switchIndex: i });
      await until(() => clients.every((c) => !c.state.sabotage));
      assert.equal(server.sabotage.sessions.size, 0);
      imp.send('sabotage', { kind: 'doors', roomId: 'commons', roundId: 1 });
      await until(() =>
        clients.every((c) => c.state.closedDoors.has('commons')),
      );
      server.state.closedDoors.set('commons', Date.now() - 1);
      await until(() => clients.every((c) => c.state.closedDoors.size === 0));
      server.state.sabotageReadyAt = 0;
      imp.send('sabotage', { kind: 'o2', roundId: 1 });
      await until(() => clients.every((c) => c.state.sabotage?.kind === 'o2'));
      panels.clear();
      const oxygen = mapData.sabotagePoints.find((p) => p.kind === 'o2-a')!;
      Object.assign(server.state.players.get(crew.sessionId)!, {
        x: oxygen.x,
        y: oxygen.y,
      });
      crew.send('openRepair', {
        pointId: oxygen.id,
        sabotageId: server.state.sabotage!.id,
        roundId: 1,
      });
      await until(() => panels.size === 1);
      assert.match(panels.get(crew.sessionId)!.code!, /^\d{5}$/);
      assert.equal(panels.has(imp.sessionId), false);
      for (const c of clients) {
        assert.equal(Object.hasOwn(c.state.sabotage!, 'code'), false);
        for (const p of c.state.players.values())
          assert.equal(Object.hasOwn(p, 'role'), false);
      }
      crew.send('emergency', { roundId: 1 });
      await until(() => errors.some((e) => e.code === 'invalidPayload'));
      server.state.sabotage!.endsAt = Date.now() + 100;
      await until(() => ended.size === 4);
      assert.equal(server.sabotage.sessions.size, 0);
      assert.equal(host.state.winner, 'impostor');
      assert.equal(ended.get(host.sessionId)!.reason, 'o2');
      assert.equal(Object.keys(ended.get(host.sessionId)!.roles).length, 4);
      host.send('cancelStart', {});
      await until(() => clients.every((c) => c.state.phase === 'lobby'));
      assert.equal(host.state.endReason, '');
      assert.equal(host.state.closedDoors.size, 0);
      assert.equal(host.state.sabotage, undefined);
      assert.deepEqual(
        errors.map((e) => e.code),
        ['invalidPayload'],
      );
    } finally {
      await Promise.allSettled(
        clients.filter((c) => c.connection.isOpen).map((c) => c.leave()),
      );
      const closed = httpServer.listening
        ? once(httpServer, 'close')
        : Promise.resolve();
      await gameServer.gracefullyShutdown(false);
      await closed;
    }
  },
);
