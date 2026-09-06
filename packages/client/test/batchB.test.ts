import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  AccessSequence,
  CardSwipe,
  DebrisField,
  FuelMeter,
} from '../src/tasks/minigames/batchBModels.js';

test('fuel accumulates only while held, pauses on release and a cancelled/new stage starts fresh', () => {
  const fuel = new FuelMeter();
  assert.equal(fuel.advance(2000, true), 0.4);
  assert.equal(fuel.advance(1000, false), 0.4);
  assert.equal(fuel.advance(-100, true), 0.4);
  assert.equal(fuel.advance(3000, true), 1);
  assert.equal(fuel.advance(1000, true), 1);
  assert.equal(new FuelMeter().filledMs, 0);
});
test('debris requires an outside drop, rejects duplicates and counts all five pieces', () => {
  const field = new DebrisField();
  assert.equal(field.remove(0, false), false);
  assert.equal(field.remove(5, true), false);
  assert.equal(field.remove(-1, true), false);
  assert.equal(field.remove(0.5, true), false);
  for (let i = 0; i < 5; i++) {
    assert.equal(field.complete, false);
    assert.equal(field.remove(i, true), true);
    assert.equal(field.remove(i, true), false);
  }
  assert.equal(field.complete, true);
});
test('access code preserves leading zeros, hides at two seconds and supports correction/reveal retry', () => {
  const code = new AccessSequence('01234');
  code.digit('0', 0);
  assert.equal(code.input, '');
  code.reveal(100);
  assert.equal(code.visible(2099), true);
  code.digit('0', 2099);
  assert.equal(code.input, '');
  assert.equal(code.visible(2100), false);
  for (const digit of '01235') code.digit(digit, 2100);
  assert.equal(code.submit(2100), false);
  code.digit('9', 2100);
  assert.equal(code.input, '01235');
  code.erase();
  code.digit('4', 2200);
  assert.equal(code.submit(2200), true);
  code.reveal(3000);
  assert.equal(code.input, '');
  assert.equal(code.canEnter(4999), false);
  assert.throws(() => new AccessSequence('1234'));
});
test('ID reader validates distance, direction, time bounds and cancellation', () => {
  for (const [ms, expected] of [
    [799, 'fast'],
    [800, 'ok'],
    [1600, 'ok'],
    [1601, 'slow'],
  ] as const) {
    const card = new CardSwipe();
    card.begin(100);
    card.move(1);
    assert.equal(card.finish(100 + ms), expected);
    assert.equal(card.finish(100 + ms), 'incomplete');
  }
  const card = new CardSwipe();
  card.begin(0);
  card.move(0.5);
  assert.equal(card.finish(1000), 'incomplete');
  card.begin(0);
  card.move(0.8);
  card.move(0.75);
  card.move(0.7);
  card.move(1);
  assert.equal(card.finish(1000), 'reversed');
  card.begin(0);
  card.move(1);
  card.cancel();
  assert.equal(card.finish(1000), 'incomplete');
  card.begin(0);
  card.move(0.96);
  assert.equal(card.finish(1000), 'ok');
});
