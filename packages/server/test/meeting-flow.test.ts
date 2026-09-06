import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GameState, Player, DEFAULT_SETTINGS } from '@mutiny/shared';
import { MapDefSchema } from '@mutiny/shared/maps';
import data from '@mutiny/shared/maps/the-hollow.json' with { type: 'json' };
import { RoundAssignments } from '../src/round.js';
import { MeetingSystem } from '../src/meetings.js';
import { MeetingFlow, meetingText } from '../src/meeting-flow.js';
function fixture() {
  const state = new GameState(),
    map = MapDefSchema.parse(data);
  state.roundId = 1;
  state.phase = 'playing';
  state.settings.discussionTime = 5;
  state.settings.votingTime = 15;
  const players = Array.from({ length: 6 }, (_, i) =>
    Object.assign(new Player(), {
      id: String(i),
      name: `Crew ${i}`,
      ...map.emergencyButton,
    }),
  );
  players.forEach((p) => state.players.set(p.id, p));
  const round = new RoundAssignments(map);
  round.start(players, DEFAULT_SETTINGS);
  const meetings = new MeetingSystem(state, map);
  meetings.emergency('0', { roundId: 1 }, 0);
  const flow = new MeetingFlow(state, round, map);
  flow.prepare(0);
  const vote = (id: string, targetId: string | null, now = 5000) =>
    flow.vote(id, { roundId: 1, meetingId: state.meeting!.id, targetId }, now);
  return { state, map, round, players, meetings, flow, vote };
}
test('discussion, immutable ballots, tie, ejection timer and play resumption follow server time', () => {
  const f = fixture();
  assert.throws(() => f.vote('0', '1', 4999));
  f.flow.tick(5000);
  assert.equal(f.state.phase, 'voting');
  assert.equal(f.state.phaseEndsAt, 20000);
  f.vote('0', '1');
  assert.equal(f.state.meeting!.voted.get('0'), true);
  assert.equal(f.state.meeting!.result, '');
  assert.throws(() => f.vote('0', '2'));
  f.vote('1', '1');
  f.vote('2', '1');
  f.vote('3', '2');
  f.vote('4', '2');
  f.vote('5', '2');
  const result = f.flow.tick(5001);
  assert.ok(result && result !== 'resume');
  assert.equal(result.result.ejectedId, null);
  assert.equal(f.state.phase, 'ejection');
  assert.equal(f.flow.tick(11000), undefined);
  assert.equal(f.flow.tick(11001), 'resume');
  assert.equal(f.state.meeting, undefined);
  assert.equal(f.flow.ballots.size, 0);
  f.players.forEach((p, i) => assert.equal(p.x, f.map.spawnPoints[i]!.x));
});
test('successful ejection honors both privacy settings and creates no reportable body', () => {
  for (const anonymous of [true, false])
    for (const confirm of [true, false]) {
      const f = fixture();
      f.state.settings.anonymousVotes = anonymous;
      f.state.settings.confirmEjects = confirm;
      const imp = f.players.find(
        (p) => f.round.players.get(p.id)!.role === 'impostor',
      )!;
      f.players.forEach((p) => f.vote(p.id, imp.id));
      const event = f.flow.tick(5001);
      assert.ok(event && event !== 'resume');
      const result = event.result;
      assert.equal(result.ejectedId, imp.id);
      assert.equal(imp.alive, false);
      assert.equal(result.impostorsRemaining, 0);
      assert.equal(f.state.bodies.size, 0);
      assert.equal(Object.hasOwn(result, 'votes'), !anonymous);
      assert.equal(Object.hasOwn(result, 'role'), confirm);
      if (confirm) assert.equal(result.role, 'impostor');
      const synced = JSON.parse(f.state.meeting!.result);
      assert.equal(Object.hasOwn(synced, 'votes'), !anonymous);
      assert.equal(Object.hasOwn(synced, 'role'), confirm);
    }
});
test('skip majority, missing ballots, deadlines and departures cannot force or stall an ejection', () => {
  const f = fixture();
  f.vote('0', '1');
  f.vote('1', '1');
  f.vote('2', null);
  f.vote('3', null);
  assert.throws(() => f.vote('4', '1', 20000));
  const event = f.flow.tick(20000);
  assert.ok(event && event !== 'resume');
  assert.equal(event.result.skipped, 4);
  assert.equal(event.result.ejectedId, null);
  const g = fixture();
  g.vote('0', '1');
  g.vote('2', '1');
  g.vote('3', null);
  g.vote('4', null);
  g.vote('5', null);
  g.state.players.delete('1');
  const second = g.flow.tick(5001);
  assert.ok(second && second !== 'resume');
  assert.equal(second.result.skipped, 5);
  assert.equal(second.result.ejectedId, null);
});
test('dead, disconnected, stale and malformed ballot/chat submissions reject', () => {
  const f = fixture(),
    request = { roundId: 1, meetingId: f.state.meeting!.id, targetId: '1' };
  f.flow.tick(5000);
  for (const payload of [
    null,
    {},
    { ...request, roundId: 0 },
    { ...request, meetingId: 0 },
    { ...request, targetId: 42 },
    { ...request, actorId: '1' },
    { ...request, targetId: 'missing' },
  ])
    assert.throws(() => f.flow.vote('0', payload, 5000));
  f.players[0]!.alive = false;
  assert.throws(() => f.vote('0', '1'));
  assert.throws(() => f.vote('1', '0'));
  assert.throws(() =>
    f.flow.chat(
      '0',
      { roundId: 1, meetingId: 1, channel: 'living', text: 'hello' },
      5000,
    ),
  );
  f.players[0]!.alive = true;
  f.players[0]!.connected = false;
  assert.throws(() => f.vote('0', '1'));
  f.flow.clear();
  assert.equal(f.flow.ballots.size, 0);
});

test('reconnecting voter holds early tally; expired reservation counts as Skip', () => {
  const f = fixture();
  f.flow.tick(5000);
  f.players[0]!.connected = false;
  for (let i = 1; i < 6; i++) f.vote(String(i), null);
  assert.equal(f.flow.tick(5001), undefined);
  f.flow.expireVoter('0');
  f.state.players.delete('0');
  const event = f.flow.tick(5002);
  assert.ok(event && event !== 'resume');
  assert.equal(event.result.skipped, 6);
});
test('meeting chat is sanitized, limited, throttled, bounded and never accepts the ghost channel', () => {
  const f = fixture(),
    request = {
      roundId: 1,
      meetingId: 1,
      channel: 'living',
      text: 'hello shit',
    };
  f.flow.chat('0', request, 0);
  assert.equal(f.state.meeting!.chat[0]!.text, 'hello ••••');
  assert.throws(() => f.flow.chat('0', request, 999));
  f.flow.chat('0', request, 1000);
  for (const text of ['', ' '.repeat(200), 'x'.repeat(201), 42])
    assert.throws(() => f.flow.chat('1', { ...request, text }, 2000));
  assert.throws(() => f.flow.chat('1', { ...request, channel: 'ghost' }, 2000));
  assert.throws(() => f.flow.chat('1', { ...request, senderId: '0' }, 2000));
  assert.equal(
    meetingText('<script>alert(1)</script>'),
    '<script>alert(1)</script>',
    'rendering must use textContent, never HTML',
  );
  assert.equal(meetingText('a\u202eb'), 'ab');
  // Extend test deadline only to exercise bounded history without changing production settings.
  f.state.meeting!.votingEndsAt = 200000;
  for (let i = 2; i < 103; i++) f.flow.chat('0', request, i * 1000);
  assert.equal(f.state.meeting!.chat.length, 100);
  f.state.phase = 'playing';
  assert.throws(() => f.flow.chat('0', request, 150000));
});
