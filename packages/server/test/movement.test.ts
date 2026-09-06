import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { Client, type Room } from '@colyseus/sdk';
import { matchMaker } from '@colyseus/core';
import {
  GAME_ROOM,
  GameState,
  Player,
  MAX_INPUT_QUEUE,
  DEFAULT_SETTINGS,
  TICK_RATE,
} from '@mutiny/shared';
import { MapDefSchema } from '@mutiny/shared/maps';
import mapData from '@mutiny/shared/maps/the-hollow.json' with { type: 'json' };
import { MovementSimulation } from '../src/movement.js';
import { createGameServer } from '../src/app.js';
import type { GameRoom } from '../src/rooms/GameRoom.js';

const map = MapDefSchema.parse(mapData);
const step = DEFAULT_SETTINGS.playerSpeed / TICK_RATE;
test('ghosts pass through walls but remain within map bounds and pause during meetings', () => {
  const state = new GameState();
  state.phase = 'playing';
  const p = Object.assign(new Player(), {
    id: 'ghost',
    x: 100,
    y: 250,
    alive: false,
  });
  state.players.set(p.id, p);
  const simulation = new MovementSimulation(state, {
    ...map,
    size: { width: 500, height: 500 },
    walls: [{ x: 150, y: 0, width: 10, height: 500 }],
  });
  for (let seq = 1; seq <= 100; seq++) {
    simulation.enqueue(p.id, { seq, dx: 1, dy: 0 });
    simulation.tick();
  }
  assert.ok(p.x > 160);
  assert.ok(p.x < 500);
  const stopped = p.x;
  state.phase = 'meeting';
  simulation.enqueue(p.id, { seq: 101, dx: -1, dy: 0 });
  simulation.tick();
  assert.equal(p.x, stopped);
});
test('server limits simulation time, rejects replays, and clears motion across frozen states', () => {
  const state = new GameState();
  const player = new Player();
  player.x = 4800;
  player.y = 6200;
  state.players.set('own', player);
  const simulation = new MovementSimulation(state, map);
  for (let seq = 1; seq <= 10; seq++)
    simulation.enqueue('own', { seq, dx: 1, dy: 0 });
  assert.equal(simulation.enqueue('own', { seq: 1, dx: -1, dy: 0 }), false);
  assert.equal(simulation.enqueue('other', { seq: 1, dx: 1, dy: 0 }), false);
  simulation.tick();
  assert.equal(player.x, 4800 + step);
  for (let tick = 0; tick < 10; tick++) simulation.tick();
  assert.equal(player.x, 4800 + MAX_INPUT_QUEUE * step);
  assert.equal(player.walking, false);
  for (const phase of [
    'starting',
    'meeting',
    'voting',
    'ejection',
    'ended',
  ] as const) {
    state.phase = 'lobby';
    simulation.enqueue('own', {
      seq: player.lastProcessedSeq + 100,
      dx: 1,
      dy: 0,
    });
    state.phase = phase;
    const x: number = player.x;
    simulation.tick();
    state.phase = 'playing';
    simulation.tick();
    assert.equal(player.x, x);
  }
  for (const property of ['inVent', 'connected'] as const) {
    player[property] = property === 'inVent';
    const x: number = player.x;
    simulation.enqueue('own', {
      seq: player.lastProcessedSeq + 100,
      dx: -1,
      dy: 0,
    });
    simulation.tick();
    assert.equal(player.x, x);
    player[property] = property !== 'inVent';
  }
  simulation.enqueue('own', {
    seq: player.lastProcessedSeq + 100,
    dx: -1,
    dy: 0,
  });
  simulation.tick();
  assert.equal(player.facing, -1);
  assert.equal(player.walking, true);
});

async function until(check: () => boolean) {
  for (let i = 0; i < 150; i++) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail('Timed out waiting for synchronized movement');
}

test(
  'two real clients synchronize position, acknowledgement, facing and stop in meetings',
  { timeout: 15000 },
  async () => {
    const { gameServer, httpServer } = createGameServer();
    const clients: Room<unknown, GameState>[] = [];
    try {
      await gameServer.listen(0, '127.0.0.1');
      const sdk = new Client(
        `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`,
      );
      const host = await sdk.create<GameState>(
        GAME_ROOM,
        { name: 'Walker', color: 'coral' },
        GameState,
      );
      clients.push(host);
      const peer = await sdk.joinById<GameState>(
        host.roomId,
        { name: 'Observer', color: 'blue' },
        GameState,
      );
      clients.push(peer);
      clients.forEach((room) => {
        room.reconnection.enabled = false;
      });
      await until(() => Boolean(peer.state?.players.get(host.sessionId)));
      const start = peer.state.players.get(host.sessionId)!;
      const x = start.x;
      assert.ok(x > 0 && start.y > 0);
      host.send('input', { seq: 1, dx: -1, dy: 0 });
      await until(
        () => peer.state.players.get(host.sessionId)?.lastProcessedSeq === 1,
      );
      assert.equal(peer.state.players.get(host.sessionId)!.x, x - step);
      assert.equal(peer.state.players.get(host.sessionId)!.facing, -1);
      host.send('input', { seq: 1, dx: -1, dy: 0 });
      host.send('input', { seq: 2, dx: 99, dy: 0 });
      host.send('input', { seq: 3, dx: 0, dy: 0 });
      await until(
        () => peer.state.players.get(host.sessionId)?.lastProcessedSeq === 3,
      );
      assert.equal(peer.state.players.get(host.sessionId)!.x, x - step);
      const serverRoom = matchMaker.getLocalRoomById(host.roomId) as GameRoom;
      serverRoom.state.phase = 'meeting';
      host.send('input', { seq: 4, dx: 1, dy: 0 });
      await until(
        () => peer.state.players.get(host.sessionId)?.lastProcessedSeq === 4,
      );
      assert.equal(peer.state.players.get(host.sessionId)!.x, x - step);
      assert.equal(peer.state.players.get(host.sessionId)!.walking, false);
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
