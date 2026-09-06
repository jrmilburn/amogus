import { Assets, type Spritesheet, type Texture } from 'pixi.js';
import {
  animationKey,
  CHARACTER_ANIMATIONS,
  CHARACTER_LAYERS,
  type CharacterAnimation,
} from './animations';

export interface CharacterAssets {
  animations: Record<string, Texture[]>;
}
export async function loadCharacterAssets(
  progress: (amount: number) => void,
): Promise<CharacterAssets> {
  const sheet = await Assets.load<Spritesheet>(
    '/assets/engineer/engineer.json',
    progress,
  );
  for (const animation of Object.keys(
    CHARACTER_ANIMATIONS,
  ) as CharacterAnimation[]) {
    for (const layer of CHARACTER_LAYERS) {
      const key = animationKey(animation, layer);
      if (
        sheet.animations[key]?.length !== CHARACTER_ANIMATIONS[animation].frames
      )
        throw new Error(
          `Engineer atlas has invalid animation ${key}. Rebuild client assets.`,
        );
    }
  }
  return { animations: sheet.animations };
}
