import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { Client, type Room } from '@colyseus/sdk';
import { matchMaker } from '@colyseus/core';
import {
  DEFAULT_SETTINGS,
  GAME_ROOM,
  GameState,
  Player,
  type ServerMessages,
} from '@mutiny/shared';
import { MapDefSchema } from '@mutiny/shared/maps';
import mapData from '@mutiny/shared/maps/the-hollow.json' with { type: 'json' };
import { RoundAssignments } from '../src/round.js';
import { createGameServer } from '../src/app.js';
import type { GameRoom } from '../src/rooms/GameRoom.js';

const map = MapDefSchema.parse(mapData);
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check: () => boolean) {
  for (let i = 0; i < 250; i++) {
    if (check()) return;
    await delay(20);
  }
  assert.fail('Timed out waiting for round state');
}

test('assignments are unique, exact, private, and fake tasks never count toward progress', () => {
  const round = new RoundAssignments(map);
  const players = Array.from({ length: 7 }, (_, i) =>
    Object.assign(new Player(), { id: String(i) }),
  );
  round.start(players, {
    ...DEFAULT_SETTINGS,
    impostors: 2,
    tasksShort: 5,
    tasksLong: 3,
  });
  assert.equal(
    [...round.players.values()].filter((p) => p.role === 'impostor').length,
    2,
  );
  for (const player of round.players.values()) {
    assert.equal(player.tasks.length, 8);
    assert.equal(new Set(player.tasks.map((t) => t.id)).size, 8);
    assert.equal(
      player.tasks.filter((t) => t.length === 'long' && t.steps === 2).length,
      3,
    );
    assert.equal(player.killReadyAt, Infinity);
    if (player.role === 'impostor')
      player.tasks.forEach((t) => {
        t.completed = true;
      });
  }
  assert.equal(round.progress(), 0);
  const crew = [...round.players.values()].filter((p) => p.role === 'crew');
  crew[0]!.tasks[0]!.completed = true;
  assert.equal(round.progress(), 1 / 40);
  crew.forEach((p) =>
    p.tasks.forEach((t) => {
      t.completed = true;
    }),
  );
  assert.equal(round.progress(), 1);
  round.beginPlaying(1000, 30);
  for (const p of round.players.values())
    assert.equal(p.killReadyAt, p.role === 'impostor' ? 31000 : Infinity);
  assert.throws(() =>
    round.start(players, { ...DEFAULT_SETTINGS, tasksLong: 99 }),
  );
  assert.equal(
    round.players.size,
    7,
    'invalid assignment does not partially replace the round',
  );
  round.clear();
  assert.equal(round.progress(), 0);
});

test(
  'five-client start delivers only own secrets, freezes reveal, enters play, and clears cancelled rounds',
  { timeout: 30000 },
  async () => {
    const { gameServer, httpServer } = createGameServer();
    const clients: Room<unknown, GameState>[] = [];
    const roles = new Map<string, ServerMessages['roleReveal']>();
    const lists = new Map<string, ServerMessages['taskList']>();
    const errors: ServerMessages['error'][] = [];
    const statuses = new Map<string, ServerMessages['impostorStatus']>();
    const kills = new Map<string, ServerMessages['killed']>();
    try {
      await gameServer.listen(0, '127.0.0.1');
      const sdk = new Client(
        `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`,
      );
      for (let i = 0; i < 5; i++) {
        const options = { name: `Player ${i}`, color: 'coral' };
        const client =
          i === 0
            ? await sdk.create<GameState>(GAME_ROOM, options, GameState)
            : await sdk.joinById<GameState>(
                clients[0]!.roomId,
                options,
                GameState,
              );
        client.reconnection.enabled = false;
        clients.push(client);
        client.onMessage<ServerMessages['impostorStatus']>(
          'impostorStatus',
          (payload) => statuses.set(client.sessionId, payload),
        );
        client.onMessage<ServerMessages['killed']>('killed', (payload) =>
          kills.set(client.sessionId, payload),
        );
        client.onMessage<ServerMessages['roleReveal']>(
          'roleReveal',
          (payload) => {
            assert.equal(
              client.state.roundId,
              payload.roundId,
              'state patch precedes private payload',
            );
            roles.set(client.sessionId, payload);
          },
        );
        client.onMessage<ServerMessages['taskList']>('taskList', (payload) =>
          lists.set(client.sessionId, payload),
        );
        client.onMessage<ServerMessages['error']>('error', (payload) =>
          errors.push(payload),
        );
      }
      const host = clients[0]!;
      await until(() => host.state?.players.size === 5);
      const server = matchMaker.getLocalRoomById(host.roomId) as GameRoom;
      host.send('start', {});
      await until(() => roles.size === 5 && lists.size === 5);
      assert.equal(host.state.phase, 'starting');
      assert.equal(
        [...roles.values()].filter((r) => r.role === 'impostor').length,
        1,
      );
      for (const [index, client] of clients.entries()) {
        const role = roles.get(client.sessionId)!;
        const list = lists.get(client.sessionId)!;
        assert.deepEqual(role.teammates, []);
        assert.equal(role.durationMs, 3000);
        assert.equal(
          list.tasks.length,
          DEFAULT_SETTINGS.tasksShort + DEFAULT_SETTINGS.tasksLong,
        );
        assert.equal(list.fake, role.role === 'impostor');
        assert.deepEqual(
          list.tasks,
          server.round.players.get(client.sessionId)!.tasks,
        );
        const player = client.state.players.get(client.sessionId)!;
        assert.equal(player.x, map.spawnPoints[index]!.x);
        assert.equal(player.y, map.spawnPoints[index]!.y);
        for (const publicPlayer of client.state.players.values()) {
          assert.equal(Object.hasOwn(publicPlayer, 'role'), false);
          assert.equal(Object.hasOwn(publicPlayer, 'tasks'), false);
        }
      }
      const x = host.state.players.get(host.sessionId)!.x;
      host.send('input', { seq: 1, dx: 1, dy: 0 });
      await until(
        () => host.state.players.get(host.sessionId)!.lastProcessedSeq === 1,
      );
      assert.equal(host.state.players.get(host.sessionId)!.x, x);
      await until(() => clients.every((c) => c.state.phase === 'playing'));
      const impostor = clients.find(
        (c) => roles.get(c.sessionId)!.role === 'impostor',
      )!;
      assert.ok(
        server.round.players.get(impostor.sessionId)!.killReadyAt >
          Date.now() + 29000,
      );
      impostor.send('taskComplete', {
        taskId: lists.get(impostor.sessionId)!.tasks[0]!.id,
      });
      await until(() => errors.length > 0);
      assert.equal(errors.at(-1)!.code, 'invalidPayload');
      assert.equal(host.state.taskProgress, 0);
      host.send('input', { seq: 2, dx: 1, dy: 0 });
      await until(() => host.state.players.get(host.sessionId)!.x > x);
      // Authoritative fixture positioning isolates task protocol from the already-tested walk circuit.
      const crewClient = clients.find(
        (c) => roles.get(c.sessionId)!.role === 'crew',
      )!;
      const assigned = server.round.players
        .get(crewClient.sessionId)!
        .tasks.find((t) => t.length === 'short')!;
      const station = map.tasks.find((t) => t.id === assigned.id)!;
      const actor = server.state.players.get(crewClient.sessionId)!;
      actor.x = station.x;
      actor.y = station.y;
      let opened: ServerMessages['taskOpened'] | undefined;
      let closed: ServerMessages['taskClosed'] | undefined;
      crewClient.onMessage<ServerMessages['taskOpened']>('taskOpened', (p) => {
        opened = p;
      });
      crewClient.onMessage<ServerMessages['taskClosed']>('taskClosed', (p) => {
        closed = p;
      });
      crewClient.send('useTask', { taskId: assigned.id, roundId: 1 });
      await until(() => Boolean(opened));
      crewClient.send('input', { seq: 100, dx: 1, dy: 0 });
      await until(
        () =>
          crewClient.state.players.get(crewClient.sessionId)!
            .lastProcessedSeq === 100,
      );
      assert.equal(
        actor.x,
        station.x,
        'server freezes movement during the private minigame',
      );
      await delay(opened!.durationMs + 50);
      crewClient.send('taskComplete', {
        taskId: assigned.id,
        roundId: 1,
        token: opened!.token,
      });
      await until(
        () => Boolean(closed) && clients.every((c) => c.state.taskProgress > 0),
      );
      assert.equal(closed!.error, undefined);
      assert.equal(
        lists
          .get(crewClient.sessionId)!
          .tasks.find((t) => t.id === assigned.id)!.completed,
        true,
      );
      assert.equal(server.tasks.active.size, 0);
      for (const c of clients)
        assert.ok(
          Math.abs(c.state.taskProgress - 1 / 12) < 1e-6,
          'float32 aggregate progress',
        );
      // Exercise #14 through real authenticated messages, not just the action service.
      await until(() => statuses.has(impostor.sessionId));
      assert.equal(
        statuses.size,
        1,
        'only the impostor receives cooldown/vent secrets',
      );
      const killer = server.state.players.get(impostor.sessionId)!;
      killer.x = actor.x;
      killer.y = actor.y;
      const killRequest = { targetId: crewClient.sessionId, roundId: 1 };
      let beforeErrors = errors.length;
      crewClient.send('kill', { targetId: impostor.sessionId, roundId: 1 });
      crewClient.send('vent', {
        action: 'enter',
        ventId: map.vents[0]!.id,
        roundId: 1,
      });
      impostor.send('kill', killRequest);
      await until(() => errors.length === beforeErrors + 3);
      assert.equal(
        server.state.bodies.size,
        0,
        'forged crew actions and initial cooldown reject',
      );
      // Victim is killed while a station session is open; it must close without credit.
      const unfinished = server.round.players
        .get(crewClient.sessionId)!
        .tasks.find((t) => !t.completed)!;
      const otherStation = map.tasks.find((t) => t.id === unfinished.id)!;
      Object.assign(actor, { x: otherStation.x, y: otherStation.y });
      Object.assign(killer, { x: actor.x, y: actor.y });
      opened = undefined;
      closed = undefined;
      crewClient.send('useTask', { taskId: unfinished.id, roundId: 1 });
      await until(() => Boolean(opened));
      server.round.players.get(impostor.sessionId)!.killReadyAt =
        Date.now() - 1;
      impostor.send('kill', killRequest);
      await until(
        () =>
          kills.size === 2 && clients.every((c) => c.state.bodies.size === 1),
      );
      assert.ok(
        kills.has(impostor.sessionId) && kills.has(crewClient.sessionId),
      );
      assert.match(closed!.error!, /killed/);
      assert.equal(server.tasks.active.size, 0);
      for (const c of clients) {
        assert.equal(c.state.players.get(crewClient.sessionId)!.alive, false);
        const body = [...c.state.bodies.values()][0]!;
        assert.equal(body.victimId, crewClient.sessionId);
        assert.equal(body.x, actor.x);
        assert.equal(Object.hasOwn(body, 'killerId'), false);
      }
      const nextCrew = clients.find((c) => c !== crewClient && c !== impostor)!;
      Object.assign(server.state.players.get(nextCrew.sessionId)!, {
        x: killer.x,
        y: killer.y,
      });
      beforeErrors = errors.length;
      impostor.send('kill', { targetId: nextCrew.sessionId, roundId: 1 });
      await until(() => errors.length === beforeErrors + 1);
      assert.equal(
        server.state.bodies.size,
        1,
        'cooldown prevents an immediate second kill',
      );
      const vent = map.vents[0]!;
      Object.assign(killer, { x: vent.x, y: vent.y });
      impostor.send('vent', { action: 'enter', ventId: vent.id, roundId: 1 });
      await until(
        () =>
          statuses.get(impostor.sessionId)?.ventId === vent.id &&
          clients.every((c) => c.state.players.get(impostor.sessionId)!.inVent),
      );
      const linked = map.vents.find((v) => v.id === vent.links[0])!;
      impostor.send('vent', { action: 'move', ventId: linked.id, roundId: 1 });
      await until(() => statuses.get(impostor.sessionId)?.ventId === linked.id);
      assert.equal(killer.x, linked.x);
      impostor.send('input', { seq: 1000, dx: 1, dy: 0 });
      await until(() => killer.lastProcessedSeq === 1000);
      assert.equal(
        killer.x,
        linked.x,
        'vented input is acknowledged without moving',
      );
      impostor.send('vent', { action: 'exit', ventId: linked.id, roundId: 1 });
      await until(
        () =>
          statuses.get(impostor.sessionId)?.ventId === null &&
          clients.every(
            (c) => !c.state.players.get(impostor.sessionId)!.inVent,
          ),
      );
      host.send('cancelStart', {});
      await until(() => host.state.phase === 'lobby');
      assert.equal(server.round.players.size, 0);
      assert.equal(server.state.bodies.size, 0);
      assert.equal(server.actions.vents.size, 0);
      host.send('start', {});
      await until(
        () => host.state.phase === 'starting' && host.state.roundId === 2,
      );
      await clients[4]!.leave();
      await until(() => host.state.phase === 'lobby');
      await delay(3100);
      assert.equal(
        server.state.phase,
        'lobby',
        'cancelled timer cannot restart play',
      );
      assert.equal(server.round.players.size, 0);
      assert.equal(server.state.phaseEndsAt, 0);
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
