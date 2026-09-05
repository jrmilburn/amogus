import { Assets, type Spritesheet, type Texture } from 'pixi.js';
export interface StationAssets {
  textures: Record<string, Texture>;
}
export async function loadStationAssets(
  progress: (amount: number) => void,
): Promise<StationAssets> {
  const sheet = await Assets.load<Spritesheet>(
    '/assets/station/station.json',
    progress,
  );
  for (const name of [
    'floor',
    'grate',
    'wall',
    'console',
    'vent',
    'crate',
    'tank',
    'emergency',
    'lamp',
    'glow',
  ]) {
    if (!sheet.textures[name])
      throw new Error(`Station atlas is missing ${name}.`);
  }
  return { textures: sheet.textures };
}
