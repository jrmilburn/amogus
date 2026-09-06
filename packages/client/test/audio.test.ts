import assert from 'node:assert/strict';
import { test } from 'node:test';
import { volumes, falloff } from '../src/audio/AudioManager';
test('audio settings clamp corrupted storage and support independent mute', () => {
  assert.deepEqual(volumes({ master: 0, music: 5, sfx: -1 }), {
    master: 0,
    music: 1,
    sfx: 0,
  });
  assert.deepEqual(volumes({ master: NaN, music: 'loud' }), volumes(null));
  assert.equal(falloff(0), 1);
  assert.equal(falloff(300), 0.25);
  assert.equal(falloff(600), 0);
  assert.equal(falloff(900), 0);
});
