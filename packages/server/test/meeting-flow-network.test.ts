import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { Client, type Room } from '@colyseus/sdk';
import { matchMaker } from '@colyseus/core';
import { GAME_ROOM, GameState, type ServerMessages } from '@mutiny/shared';
import data from '@mutiny/shared/maps/the-hollow.json' with { type: 'json' };
import { createGameServer } from '../src/app.js';
import type { GameRoom } from '../src/rooms/GameRoom.js';
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(check: () => boolean) {
  for (let i = 0; i < 250; i++) {
    if (check()) return;
    await delay(20);
  }
  assert.fail('Timed out waiting for voting state');
}
test(
  'six clients discuss, lock a tied anonymous vote, resume, then visibly eject an impostor',
  { timeout: 25000 },
  async () => {
    const { gameServer, httpServer } = createGameServer(),
      clients: Room<unknown, GameState>[] = [];
    const roles = new Map<string, ServerMessages['roleReveal']>(),
      results = new Map<string, ServerMessages['voteResult']>(),
      errors: ServerMessages['error'][] = [];
    try {
      await gameServer.listen(0, '127.0.0.1');
      const sdk = new Client(
        `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`,
      );
      for (let i = 0; i < 6; i++) {
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
        for (const event of [
          'taskList',
          'impostorStatus',
          'meetingStart',
          'chatAccepted',
        ])
          c.onMessage(event, () => {});
        c.onMessage<ServerMessages['voteResult']>('voteResult', (p) => {
          assert.equal(c.state.phase, 'ejection');
          results.set(c.sessionId, p);
        });
        c.onMessage<ServerMessages['error']>('error', (p) => errors.push(p));
      }
      const host = clients[0]!;
      await until(() => host.state?.players.size === 6);
      host.send('start', {});
      await until(
        () =>
          roles.size === 6 && clients.every((c) => c.state.phase === 'playing'),
      );
      const server = matchMaker.getLocalRoomById(host.roomId) as GameRoom;
      server.state.emergencyReadyAt = 0;
      Object.assign(
        server.state.players.get(host.sessionId)!,
        data.emergencyButton,
      );
      host.send('emergency', { roundId: 1 });
      await until(() => clients.every((c) => c.state.phase === 'meeting'));
      const identity = { roundId: 1, meetingId: host.state.meeting!.id };
      host.send('chat', {
        ...identity,
        channel: 'living',
        text: 'Where was everyone? shit',
      });
      await until(() =>
        clients.every((c) => c.state.meeting!.chat.length === 1),
      );
      assert.match(host.state.meeting!.chat[0]!.text, /••••/);
      server.state.meeting!.discussionEndsAt = Date.now();
      await until(() => clients.every((c) => c.state.phase === 'voting'));
      clients[0]!.send('vote', {
        ...identity,
        targetId: clients[1]!.sessionId,
      });
      await until(() =>
        clients.every((c) => c.state.meeting!.voted.size === 1),
      );
      assert.equal(host.state.meeting!.result, '');
      assert.equal(Object.hasOwn(host.state.meeting!, 'ballots'), false);
      for (let i = 1; i < 6; i++)
        clients[i]!.send('vote', {
          ...identity,
          targetId: clients[i < 3 ? 1 : 2]!.sessionId,
        });
      await until(() => results.size === 6);
      for (const c of clients) {
        const r = results.get(c.sessionId)!;
        assert.equal(r.ejectedId, null);
        assert.equal(Object.hasOwn(r, 'votes'), false);
        assert.equal(
          Object.hasOwn(JSON.parse(c.state.meeting!.result), 'votes'),
          false,
        );
      }
      server.state.phaseEndsAt = Date.now();
      await until(() => clients.every((c) => c.state.phase === 'playing'));
      assert.ok(server.state.emergencyReadyAt > Date.now());
      for (const [id, p] of server.round.players)
        if (p.role === 'impostor')
          assert.ok(server.round.players.get(id)!.killReadyAt > Date.now());
      server.state.settings.anonymousVotes = false;
      server.state.settings.confirmEjects = true;
      results.clear();
      const caller = clients[1]!;
      Object.assign(
        server.state.players.get(caller.sessionId)!,
        data.emergencyButton,
      );
      server.state.emergencyReadyAt = 0;
      caller.send('emergency', { roundId: 1 });
      await until(() => clients.every((c) => c.state.phase === 'meeting'));
      server.state.meeting!.discussionEndsAt = Date.now();
      await until(() => clients.every((c) => c.state.phase === 'voting'));
      const imp = clients.find(
        (c) => roles.get(c.sessionId)!.role === 'impostor',
      )!;
      for (const c of clients)
        c.send('vote', {
          roundId: 1,
          meetingId: server.state.meeting!.id,
          targetId: imp.sessionId,
        });
      await until(() => results.size === 6);
      for (const c of clients) {
        const r = results.get(c.sessionId)!;
        assert.equal(r.ejectedId, imp.sessionId);
        assert.equal(r.role, 'impostor');
        assert.equal(r.votes!.length, 6);
        assert.equal(c.state.players.get(imp.sessionId)!.alive, false);
      }
      assert.equal(server.state.bodies.size, 0);
      server.state.phaseEndsAt = Date.now();
      await until(() => clients.every((c) => c.state.phase === 'ended'));
      assert.equal(server.state.winner, 'crew');
      assert.equal(server.state.endReason, 'noImpostors');
      assert.equal(server.state.meeting, undefined);
      assert.deepEqual(errors, []);
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
