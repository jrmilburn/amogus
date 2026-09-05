import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import type { AddressInfo } from 'node:net';
import { Client } from '@colyseus/sdk';
import {
  MAX_PLAYERS,
  PLACEHOLDER_ROOM,
  type HealthResponse,
} from '@mutiny/shared';
import { createGameServer } from '../src/app.js';

test('health counts rooms and two clients share a live placeholder room', async () => {
  const { gameServer, httpServer } = createGameServer();
  try {
    await gameServer.listen(0, '127.0.0.1');
    const port = (httpServer.address() as AddressInfo).port;
    const endpoint = `http://127.0.0.1:${port}`;
    const health = async () => {
      const response = await fetch(`${endpoint}/health`);
      assert.equal(response.status, 200);
      return (await response.json()) as HealthResponse;
    };
    assert.deepEqual(await health(), { ok: true, rooms: 0 });
    const first = await new Client(endpoint).joinOrCreate(PLACEHOLDER_ROOM);
    const second = await new Client(endpoint).joinOrCreate(PLACEHOLDER_ROOM);
    assert.ok(first.sessionId);
    assert.notEqual(first.sessionId, second.sessionId);
    assert.equal(first.roomId, second.roomId);
    assert.deepEqual(await health(), { ok: true, rooms: 1 });
    // Fill the room to ensure its capacity is enforced and health includes locked rooms.
    const clients = [first, second];
    for (let i = 2; i < MAX_PLAYERS; i++) {
      clients.push(await new Client(endpoint).joinById(first.roomId));
    }
    assert.deepEqual(await health(), { ok: true, rooms: 1 });
    await assert.rejects(new Client(endpoint).joinById(first.roomId));
    const overflow = await new Client(endpoint).joinOrCreate(PLACEHOLDER_ROOM);
    assert.notEqual(overflow.roomId, first.roomId);
    assert.deepEqual(await health(), { ok: true, rooms: 2 });
    await Promise.all([...clients, overflow].map((room) => room.leave()));
    // Disposal completes asynchronously after clients acknowledge leave.
    for (let i = 0; i < 50 && (await health()).rooms !== 0; i++) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.deepEqual(await health(), { ok: true, rooms: 0 });
  } finally {
    const closed = httpServer.listening
      ? once(httpServer, 'close')
      : Promise.resolve();
    await gameServer.gracefullyShutdown(false);
    await closed;
  }
});
