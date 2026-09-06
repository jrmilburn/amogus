import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import sharp from 'sharp';
import { Texture, Ticker } from 'pixi.js';
import { CharacterView } from '../src/characters/CharacterView';
import {
  CHARACTER_ANIMATIONS,
  CHARACTER_LAYERS,
  animationKey,
  knowsImpostor,
  type CharacterAnimation,
} from '../src/characters/animations';

function fixture() {
  return {
    animations: Object.fromEntries(
      (Object.keys(CHARACTER_ANIMATIONS) as CharacterAnimation[]).flatMap(
        (name) =>
          CHARACTER_LAYERS.map((layer) => [
            animationKey(name, layer),
            Array.from(
              { length: CHARACTER_ANIMATIONS[name].frames },
              () => Texture.EMPTY,
            ),
          ]),
      ),
    ),
  };
}

test('character layers stay synchronized, only suit is tinted, and facing does not mirror labels', () => {
  const character = new CharacterView(fixture(), 'Engineer', 'coral', true);
  const ticker = new Ticker();
  ticker.deltaTime = 1;
  try {
    assert.equal(character.sprites.suit.tint, 0xee6677);
    assert.equal(character.sprites.visor.tint, 0xffffff);
    assert.equal(character.sprites.pack.tint, 0xffffff);
    character.sync({ alive: true, inVent: false, walking: true, facing: -1 });
    assert.equal(character.animation, 'walk');
    for (let i = 0; i < 12; i++) character.update(ticker, false);
    assert.ok(character.sprites.suit.currentFrame > 0);
    assert.equal(
      character.sprites.suit.currentFrame,
      character.sprites.visor.currentFrame,
    );
    assert.equal(
      character.sprites.suit.currentFrame,
      character.sprites.pack.currentFrame,
    );
    assert.equal(character.rig.scale.x, -1);
    assert.equal(character.nameTag.scale.x, 1);
    character.setScreenScale(0.25);
    assert.equal(character.nameTag.scale.x * 24 * 0.25, 12);
    character.sync({ alive: true, inVent: false, walking: false, facing: 1 });
    assert.equal(character.animation, 'idle');
    character.update(ticker, true);
    assert.equal(character.sprites.suit.currentFrame, 0);
    assert.equal(character.sprites.suit.playing, false);
    character.setIdentity('Friend', 'blue', false, true);
    assert.equal(character.sprites.suit.tint, 0x4477aa);
    assert.equal(character.nameTag.style.fill, 0xff8f99);
  } finally {
    character.destroy({ children: true });
    ticker.destroy();
  }
  assert.equal(
    Texture.EMPTY.destroyed,
    false,
    'closing a scene preserves cached atlas textures',
  );
});

test('confirmed killer strike is bounded, preserves labels and respects reduced motion', () => {
  const character = new CharacterView(fixture(), 'Impostor', 'coral');
  const ticker = new Ticker();
  ticker.deltaTime = 1;
  try {
    character.strike();
    character.update(ticker, false);
    assert.ok(character.rig.rotation > 0);
    assert.ok(character.rig.x > 0);
    assert.equal(character.nameTag.rotation, 0);
    for (let i = 0; i < 30; i++) character.update(ticker, false);
    assert.equal(character.rig.rotation, 0);
    assert.equal(character.rig.x, 0);
    character.strike();
    character.update(ticker, true);
    assert.equal(character.rig.rotation, 0);
    assert.equal(character.rig.x, 0);
  } finally {
    character.destroy({ children: true });
    ticker.destroy();
  }
});

test('death finishes at a body; revival interrupts death; vents hide public players immediately', () => {
  const character = new CharacterView(fixture(), 'Engineer', 'gold');
  const ticker = new Ticker();
  ticker.deltaTime = 1;
  try {
    const alive = { alive: true, inVent: false, walking: false, facing: 1 };
    character.sync(alive);
    character.sync({ ...alive, alive: false });
    assert.equal(character.animation, 'killed');
    for (let i = 0; i < 60; i++) character.update(ticker, false);
    assert.equal(character.animation, 'body');
    character.sync(alive);
    assert.equal(character.animation, 'idle');
    character.sync({ ...alive, alive: false });
    character.sync({ ...alive, walking: true });
    assert.equal(character.animation, 'walk');
    character.sync({ ...alive, inVent: true });
    assert.equal(character.visible, false);
    character.sync(alive);
    assert.equal(character.visible, true);
    assert.equal(character.animation, 'ventExit');
    character.update(ticker, true);
    assert.equal(character.animation, 'idle');
    character.play('ghost');
    for (let i = 0; i < 50; i++) character.update(ticker, false);
    assert.equal(character.animation, 'ghost');
  } finally {
    character.destroy({ children: true });
    ticker.destroy();
  }
});

test('impostor name colour requires private impostor knowledge, never merely teammate IDs', () => {
  assert.equal(
    knowsImpostor({ teammateIds: new Set(['other']) }, 'other', 'own'),
    false,
  );
  assert.equal(
    knowsImpostor(
      { role: 'crew', teammateIds: new Set(['other']) },
      'other',
      'own',
    ),
    false,
  );
  const view = { role: 'impostor' as const, teammateIds: new Set(['other']) };
  assert.equal(knowsImpostor(view, 'other', 'own'), true);
  assert.equal(knowsImpostor(view, 'own', 'own'), true);
  assert.equal(knowsImpostor(view, 'unknown', 'own'), false);
});

test('generated atlas contains every padded animation, grayscale suit, and independent coloured glass', async () => {
  const base = new URL('../public/assets/engineer/', import.meta.url);
  const manifest = JSON.parse(
    await readFile(new URL('engineer.json', base), 'utf8'),
  ) as {
    animations: Record<string, string[]>;
    frames: Record<
      string,
      { frame: { x: number; y: number; w: number; h: number } }
    >;
  };
  const png = await readFile(new URL('engineer.png', base));
  const metadata = await sharp(png).metadata();
  assert.equal(metadata.hasAlpha, true);
  assert.equal(Object.keys(manifest.frames).length, 111);
  for (const name of Object.keys(
    CHARACTER_ANIMATIONS,
  ) as CharacterAnimation[]) {
    for (const layer of CHARACTER_LAYERS) {
      const frames = manifest.animations[animationKey(name, layer)]!;
      assert.equal(frames.length, CHARACTER_ANIMATIONS[name].frames);
      for (const id of frames) {
        const f = manifest.frames[id]!.frame;
        assert.equal(f.w, 160);
        assert.equal(f.h, 160);
        assert.ok(
          f.x >= 2 &&
            f.y >= 2 &&
            f.x + f.w < metadata.width! &&
            f.y + f.h < metadata.height!,
        );
      }
    }
  }
  const suit = manifest.frames['idle-suit-0']!.frame;
  const raw = await sharp(png)
    .extract({ left: suit.x, top: suit.y, width: suit.w, height: suit.h })
    .raw()
    .toBuffer();
  let visible = 0;
  for (let i = 0; i < raw.length; i += 4) {
    if (!raw[i + 3]) continue;
    visible++;
    assert.equal(raw[i], raw[i + 1]);
    assert.equal(raw[i], raw[i + 2]);
  }
  assert.ok(visible > 3000);
  const visor = manifest.frames['idle-visor-0']!.frame;
  const glass = await sharp(png)
    .extract({ left: visor.x, top: visor.y, width: visor.w, height: visor.h })
    .raw()
    .toBuffer();
  assert.ok(
    glass.some((value, i) => i % 4 === 2 && value > glass[i - 2]! + 30),
    'visor retains blue glass',
  );
});
