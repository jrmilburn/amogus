import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AddressInfo } from 'node:net';
import { Client } from '@colyseus/sdk';
import { GAME_ROOM, GameState, PLACEHOLDER_ROOM } from '@mutiny/shared';
import { createGameServer } from '../src/app.js';
import { liveRooms, maxRooms } from '../src/ops.js';
test(
  'admin is opt-in, authenticated, CSRF-confirmed; room cap fails friendly and recovers',
  { timeout: 10000 },
  async () => {
    const previousPassword = process.env.ADMIN_PASSWORD,
      previousMax = process.env.MAX_ROOMS;
    delete process.env.ADMIN_PASSWORD;
    process.env.MAX_ROOMS = '1';
    const { gameServer, httpServer } = createGameServer();
    try {
      await gameServer.listen(0, '127.0.0.1');
      const endpoint = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`,
        sdk = new Client(endpoint);
      assert.equal((await fetch(endpoint + '/admin')).status, 404);
      process.env.ADMIN_PASSWORD = 'test-password';
      assert.equal((await fetch(endpoint + '/admin')).status, 401);
      const headers = {
        authorization:
          'Basic ' + Buffer.from('admin:test-password').toString('base64'),
      };
      assert.equal(
        (
          await fetch(endpoint + '/admin', {
            headers: {
              authorization:
                'Basic ' + Buffer.from('admin:wrong').toString('base64'),
            },
          })
        ).status,
        401,
      );
      await assert.rejects(() => sdk.create(PLACEHOLDER_ROOM));
      const room = await sdk.create<GameState>(
        GAME_ROOM,
        { name: 'Host', color: 'coral' },
        GameState,
      );
      room.reconnection.enabled = false;
      room.onMessage('*', () => {});
      await assert.rejects(
        () => sdk.create(GAME_ROOM, { name: 'Extra', color: 'blue' }),
        /Server full/,
      );
      assert.equal(liveRooms.size, 1);
      const response = await fetch(endpoint + '/admin', { headers }),
        html = await response.text();
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.match(html, new RegExp(room.roomId));
      assert.match(html, /Closing a room disconnects everyone/);
      const csrf = html.match(/name="csrf" value="([a-f0-9]+)"/)![1]!;
      const close = async (body: URLSearchParams) =>
        fetch(endpoint + '/admin/close', {
          method: 'POST',
          headers,
          body,
          redirect: 'manual',
        });
      assert.equal(
        (
          await close(
            new URLSearchParams({ room: room.roomId, confirm: 'yes' }),
          )
        ).status,
        403,
      );
      assert.equal(liveRooms.size, 1);
      assert.equal(
        (
          await close(
            new URLSearchParams({ room: room.roomId, csrf, confirm: 'yes' }),
          )
        ).status,
        303,
      );
      assert.equal(liveRooms.size, 0);
      const next = await sdk.create<GameState>(
        GAME_ROOM,
        { name: 'Next', color: 'coral' },
        GameState,
      );
      next.reconnection.enabled = false;
      await next.leave();
      process.env.MAX_ROOMS = 'NaN';
      assert.throws(maxRooms);
    } finally {
      if (previousPassword === undefined) delete process.env.ADMIN_PASSWORD;
      else process.env.ADMIN_PASSWORD = previousPassword;
      if (previousMax === undefined) delete process.env.MAX_ROOMS;
      else process.env.MAX_ROOMS = previousMax;
      await gameServer.gracefullyShutdown(false);
    }
  },
);
