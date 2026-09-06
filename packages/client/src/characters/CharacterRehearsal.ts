import { COLORS } from '@mutiny/shared';
import type { Renderer } from '../renderer/Renderer';
import { letterbox } from '../renderer/Camera';
import { CharacterView } from './CharacterView';
import type { CharacterAssets } from './assets';
import type { CharacterAnimation } from './animations';

/** A local art rehearsal in the existing map viewer; it creates no multiplayer room. */
export class CharacterRehearsal {
  private characters: CharacterView[] = [];
  private motion = matchMedia('(prefers-reduced-motion: reduce)');
  private columns = 0;
  constructor(
    private readonly renderer: Renderer,
    assets: CharacterAssets,
  ) {
    const center = renderer.map.emergencyButton;
    for (const [i, color] of COLORS.entries()) {
      const character = new CharacterView(assets, color.name, color.id);
      character.position.set(
        center.x + ((i % 6) - 2.5) * 210,
        center.y + (Math.floor(i / 6) - 0.5) * 320 + 70,
      );
      // The second row demonstrates facing-left while keeping labels upright.
      character.rig.scale.x = i < 6 ? 1 : -1;
      this.characters.push(character);
      renderer.setEntity(`rehearsal-${color.id}`, character);
    }
  }
  play(animation: CharacterAnimation) {
    for (const character of this.characters) character.play(animation);
  }
  update() {
    const screen = this.renderer.app.screen;
    const columns = screen.width < 600 && screen.height > screen.width ? 3 : 6;
    if (columns !== this.columns) {
      this.columns = columns;
      const center = this.renderer.map.emergencyButton;
      this.characters.forEach((character, i) =>
        character.position.set(
          center.x +
            ((i % columns) - (columns - 1) / 2) * (columns === 3 ? 480 : 210),
          center.y +
            (Math.floor(i / columns) - (12 / columns - 1) / 2) *
              (columns === 3 ? 230 : 320) +
            70,
        ),
      );
    }
    for (const character of this.characters) {
      character.setScreenScale(letterbox(screen).scale);
      character.update(this.renderer.app.ticker, this.motion.matches);
    }
  }
}
