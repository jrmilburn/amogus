import {
  AnimatedSprite,
  Container,
  Graphics,
  Text,
  type Ticker,
} from 'pixi.js';
import { COLORS, type ColorId } from '@mutiny/shared';
import {
  animationKey,
  CHARACTER_ANIMATIONS,
  CHARACTER_FRAME,
  CHARACTER_LAYERS,
  characterAnimation,
  type CharacterAnimation,
  type CharacterLayer,
} from './animations';
import type { CharacterAssets } from './assets';

/** Extends the station's existing visual world: articulated workwear, a compact helmet,
 * cyan glass and amber equipment. A 128px figure stands on the 24px collision footprint.
 * Only the suit is tinted; names and stable colour numbers stay upright when facing flips.
 * Idle/walk respond to movement; other clips are ready for the later game-loop milestones.
 */
export class CharacterView extends Container {
  readonly rig = new Container();
  readonly sprites: Record<CharacterLayer, AnimatedSprite>;
  readonly nameTag: Text;
  private number: Text;
  private badge = new Container();
  private shadow: Graphics;
  private current: CharacterAnimation = 'idle';
  private previousAlive?: boolean;
  private previousVent?: boolean;
  private strikeTime = 0;
  strike() {
    this.strikeTime = 0.36;
  }

  constructor(
    private readonly assets: CharacterAssets,
    name: string,
    color: ColorId,
    own = false,
  ) {
    super();
    this.shadow = new Graphics()
      .ellipse(0, 3, 27, 9)
      .fill({ color: 0x091219, alpha: 0.55 });
    this.addChild(this.shadow, this.rig);
    this.sprites = Object.fromEntries(
      CHARACTER_LAYERS.map((layer) => {
        const sprite = new AnimatedSprite({
          textures: assets.animations[animationKey('idle', layer)]!,
          autoUpdate: false,
        });
        sprite.anchor.set(
          CHARACTER_FRAME.footX / CHARACTER_FRAME.width,
          CHARACTER_FRAME.footY / CHARACTER_FRAME.height,
        );
        this.rig.addChild(sprite);
        return [layer, sprite];
      }),
    ) as Record<CharacterLayer, AnimatedSprite>;
    this.nameTag = new Text({
      text: '',
      style: {
        fontFamily: 'Trebuchet MS',
        fontSize: 24,
        fontWeight: 'bold',
        fill: 0xdde6e4,
        stroke: { color: 0x091219, width: 5 },
      },
    });
    this.nameTag.anchor.set(0.5, 1);
    this.nameTag.y = -136;
    this.badge.addChild(
      new Graphics().roundRect(-14, -11, 28, 22, 5).fill(0x091219),
    );
    this.number = new Text({
      text: '',
      style: {
        fontFamily: 'Trebuchet MS',
        fontSize: 16,
        fontWeight: 'bold',
        fill: 0xdde6e4,
      },
    });
    this.number.anchor.set(0.5);
    this.badge.addChild(this.number);
    this.badge.y = 17;
    this.addChild(this.badge, this.nameTag);
    this.setIdentity(name, color, own);
    this.play('idle');
  }

  setIdentity(
    name: string,
    colorId: ColorId,
    own = false,
    knownImpostor = false,
  ) {
    const color = COLORS.find((entry) => entry.id === colorId)!;
    this.sprites.suit.tint = color.hex;
    this.number.text = String(color.number);
    this.nameTag.text = `${name}${own ? ' (you)' : ''}`;
    this.nameTag.style.fill = knownImpostor ? 0xff8f99 : 0xdde6e4;
    this.label = `${name}, ${color.name}, number ${color.number}`;
  }

  get animation() {
    return this.current;
  }

  /** Names/numbers remain legible when the fixed world view shrinks onto a phone. */
  setScreenScale(worldToScreen: number) {
    const scale = Math.max(0.01, worldToScreen);
    this.nameTag.scale.set(Math.max(1, 12 / (24 * scale)));
    this.badge.scale.set(Math.max(1, 12 / (16 * scale)));
  }

  /** Explicit presentation API for private vent/ghost effects and body entities in #14/#18. */
  play(animation: CharacterAnimation) {
    this.current = animation;
    const spec = CHARACTER_ANIMATIONS[animation];
    for (const layer of CHARACTER_LAYERS) {
      const sprite = this.sprites[layer];
      sprite.textures = this.assets.animations[animationKey(animation, layer)]!;
      sprite.loop = spec.loop;
      sprite.animationSpeed = spec.fps / 60;
      sprite.gotoAndPlay(0);
    }
    this.shadow.visible = animation !== 'ghost';
    this.nameTag.y = animation === 'body' ? -48 : -136;
  }

  sync(state: {
    ghost?: boolean;
    alive: boolean;
    walking: boolean;
    inVent: boolean;
    facing: number;
  }) {
    this.rig.scale.x = state.facing < 0 ? -1 : 1;
    // Public vent state must never reveal a venting player's position to crew.
    this.visible = !state.inVent;
    if (state.ghost) {
      if (this.current !== 'ghost') this.play('ghost');
      this.previousAlive = false;
      this.previousVent = false;
      return;
    }
    if (this.previousAlive === false && state.alive)
      this.play(characterAnimation(true, state.walking));
    else if (this.previousAlive === true && !state.alive) this.play('killed');
    else if (state.alive && this.previousVent === true && !state.inVent)
      this.play('ventExit');
    else if (this.current !== 'killed' && this.current !== 'ventExit') {
      const next = characterAnimation(state.alive, state.walking);
      if (next !== this.current) this.play(next);
    }
    this.previousAlive = state.alive;
    this.previousVent = state.inVent;
  }

  update(ticker: Ticker, reducedMotion: boolean, speedMultiplier = 1) {
    this.strikeTime = reducedMotion
      ? 0
      : Math.max(0, this.strikeTime - ticker.deltaTime / 60);
    const strike = Math.sin((this.strikeTime / 0.36) * Math.PI);
    this.rig.rotation = strike * 0.24 * this.rig.scale.x;
    this.rig.x = strike * 16 * this.rig.scale.x;
    const spec = CHARACTER_ANIMATIONS[this.current];
    if (reducedMotion) {
      const frame = spec.loop ? 0 : spec.frames - 1;
      for (const sprite of Object.values(this.sprites))
        sprite.gotoAndStop(frame);
    } else {
      for (const sprite of Object.values(this.sprites)) {
        sprite.animationSpeed =
          (spec.fps / 60) * (this.current === 'walk' ? speedMultiplier : 1);
        if (spec.loop && !sprite.playing) sprite.play();
        sprite.update(ticker);
      }
    }
    if (!this.sprites.suit.playing) {
      if (this.current === 'killed') this.play('body');
      else if (this.current === 'ventExit') this.play('idle');
    }
  }
}
