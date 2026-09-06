import assert from 'node:assert/strict';
import test from 'node:test';
import {
  entryPresentation,
  lobbyRequirement,
  validCode,
} from '../src/lobby/entry';

test('create never requires a hidden room code, including after an invitation', () => {
  for (const invite of [undefined, 'ABCDE']) {
    const view = entryPresentation('create', invite);
    assert.equal(view.joining, false);
    assert.equal(view.showInvite, false);
    assert.equal(view.codeRequired, false);
    assert.equal(view.codeDisabled, true);
    assert.equal(view.action, 'Create game');
  }
});

test('manual join requires a code; invite join requires only a name', () => {
  const manual = entryPresentation('join');
  assert.equal(manual.joining, true);
  assert.equal(manual.showCode, true);
  assert.equal(manual.codeRequired, true);
  assert.equal(manual.codeDisabled, false);
  const invite = entryPresentation('join', 'ABCDE');
  assert.equal(invite.joining, true);
  assert.equal(invite.showCode, false);
  assert.equal(invite.showInvite, true);
  assert.equal(invite.codeRequired, false);
  assert.equal(invite.codeDisabled, true);
  assert.equal(invite.action, 'Join ABCDE');
});

test('busy and retry retain the selected flow and restore the right controls', () => {
  for (const mode of ['create', 'join'] as const) {
    for (const invite of [undefined, 'ABCDE']) {
      const before = entryPresentation(mode, invite);
      const busy = entryPresentation(mode, invite, true);
      assert.equal(busy.action, 'Connecting…');
      assert.equal(busy.codeDisabled, true);
      assert.equal(busy.joining, before.joining);
      assert.deepEqual(entryPresentation(mode, invite, false), before);
    }
  }
});

test('codes use exactly five unambiguous uppercase letters', () => {
  assert.equal(validCode('ABCDE'), true);
  for (const code of [
    '',
    'abcd',
    'abcde',
    'ABCDEF',
    'ABIDE',
    'ABODE',
    'AB1DE',
    'AB DE',
  ])
    assert.equal(validCode(code), false, code);
});

test('launch respects player minimum and reconnects, but readiness is advisory', () => {
  const players = (count: number) =>
    Array.from({ length: count }, () => ({ connected: true, ready: false }));
  assert.match(lobbyRequirement(players(3), 1)!, /1 more player/);
  assert.equal(lobbyRequirement(players(4), 1), undefined);
  assert.match(lobbyRequirement(players(6), 2)!, /7 players/);
  assert.equal(lobbyRequirement(players(7), 2), undefined);
  const dropped = players(4);
  dropped[0]!.connected = false;
  assert.match(lobbyRequirement(dropped, 1)!, /reconnect/);
});
