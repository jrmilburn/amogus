import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { Client, type Room } from '@colyseus/sdk';
import { matchMaker } from '@colyseus/core';
import {
  GAME_ROOM,
  GameState,
  taskStation,
  type ServerMessages,
} from '@mutiny/shared';
import { MapDefSchema } from '@mutiny/shared/maps';
import data from '@mutiny/shared/maps/the-hollow.json' with { type: 'json' };
import { createGameServer } from '../src/app.js';
import type { GameRoom } from '../src/rooms/GameRoom.js';
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(check: () => boolean) {
  for (let i = 0; i < 250; i++) {
    if (check()) return;
    await delay(20);
  }
  assert.fail('Timed out waiting for meeting');
}
test(
  'four clients report a real kill, cancel procedures/vents/faults, freeze at Commons, reset and call emergency',
  { timeout: 25000 },
  async () => {
    const map = MapDefSchema.parse(data),
      { gameServer, httpServer } = createGameServer(),
      clients: Room<unknown, GameState>[] = [];
    const roles = new Map<string, ServerMessages['roleReveal']>(),
      meetings = new Map<string, ServerMessages['meetingStart']>();
    const errors: ServerMessages['error'][] = [];
    let taskClosed = 0;
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
                { name: `Player ${i}`, color: 'coral' },
                GameState,
              )
            : await sdk.joinById<GameState>(
                clients[0]!.roomId,
                { name: `Player ${i}`, color: 'coral' },
                GameState,
              );
        clients.push(c);
        c.reconnection.enabled = false;
        c.onMessage<ServerMessages['roleReveal']>('roleReveal', (p) =>
          roles.set(c.sessionId, p),
        );
        for (const type of [
          'taskList',
          'impostorStatus',
          'killed',
          'repairClosed',
        ])
          c.onMessage(type, () => {});
        c.onMessage('taskClosed', () => taskClosed++);
        c.onMessage<ServerMessages['meetingStart']>('meetingStart', (p) => {
          assert.equal(c.state.phase, 'meeting');
          assert.equal(c.state.meeting!.id, p.meetingId);
          meetings.set(c.sessionId, p);
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
      const server = matchMaker.getLocalRoomById(host.roomId) as GameRoom,
        imp = clients.find((c) => roles.get(c.sessionId)!.role === 'impostor')!,
        crew = clients.filter((c) => roles.get(c.sessionId)!.role === 'crew');
      const victim = crew[0]!,
        reporter = crew[1]!,
        worker = crew[2]!;
      for (const c of [imp, victim, reporter])
        Object.assign(
          server.state.players.get(c.sessionId)!,
          map.emergencyButton,
        );
      server.round.players.get(imp.sessionId)!.killReadyAt = 0;
      imp.send('kill', { targetId: victim.sessionId, roundId: 1 });
      await until(() => host.state.bodies.size === 1);
      const task = server.round.players.get(worker.sessionId)!.tasks[0]!,
        station = taskStation(map, task)!;
      Object.assign(server.state.players.get(worker.sessionId)!, {
        x: station.x,
        y: station.y,
      });
      server.tasks.open(worker.sessionId, task.id, 1);
      server.state.sabotageReadyAt = 0;
      server.sabotage.activate(imp.sessionId, { kind: 'reactor', roundId: 1 });
      const repair = map.sabotagePoints.find((p) => p.kind === 'reactor-a')!;
      Object.assign(server.state.players.get(imp.sessionId)!, {
        x: repair.x,
        y: repair.y,
      });
      server.sabotage.open(imp.sessionId, {
        pointId: repair.id,
        sabotageId: server.state.sabotage!.id,
        roundId: 1,
      });
      // Artificial stale vent record exercises transition cleanup without making a second impostor.
      server.actions.vents.set(imp.sessionId, map.vents[0]!.id);
      reporter.send('report', {
        bodyId: [...host.state.bodies.keys()][0],
        roundId: 1,
      });
      await until(() => meetings.size === 4 && taskClosed === 1);
      assert.equal(server.tasks.active.size, 0);
      assert.equal(server.sabotage.sessions.size, 0);
      assert.equal(server.actions.vents.size, 0);
      for (const c of clients) {
        assert.equal(c.state.bodies.size, 0);
        assert.equal(c.state.sabotage, undefined);
        assert.equal(c.state.meeting!.reason, 'report');
        for (const p of c.state.players.values())
          assert.equal(Object.hasOwn(p, 'role'), false);
      }
      const oldX = server.state.players.get(reporter.sessionId)!.x;
      reporter.send('input', { seq: 1, dx: 1, dy: 0 });
      await delay(100);
      assert.equal(server.state.players.get(reporter.sessionId)!.x, oldX);
      host.send('cancelStart', {});
      await until(() => clients.every((c) => c.state.phase === 'lobby'));
      meetings.clear();
      roles.clear();
      host.send('start', {});
      await until(
        () =>
          roles.size === 4 && clients.every((c) => c.state.phase === 'playing'),
      );
      server.state.emergencyReadyAt = 0;
      Object.assign(
        server.state.players.get(host.sessionId)!,
        map.emergencyButton,
      );
      host.send('emergency', { roundId: 2 });
      await until(() => meetings.size === 4);
      assert.equal(host.state.meeting!.reason, 'emergency');
      assert.equal(host.state.players.get(host.sessionId)!.emergenciesUsed, 1);
      assert.deepEqual(errors, []);
      host.send('cancelStart', {});
      await until(() => host.state.phase === 'lobby');
      assert.equal(host.state.players.get(host.sessionId)!.emergenciesUsed, 0);
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
