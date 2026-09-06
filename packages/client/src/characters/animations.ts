/** Shared by the atlas builder and renderer; frame dimensions include transparent padding. */
export const CHARACTER_FRAME = {
  width: 160,
  height: 160,
  footX: 80,
  footY: 144,
} as const;
export const CHARACTER_ANIMATIONS = {
  idle: { frames: 4, fps: 3, loop: true },
  walk: { frames: 8, fps: 12, loop: true },
  ventEnter: { frames: 6, fps: 12, loop: false },
  ventExit: { frames: 6, fps: 12, loop: false },
  killed: { frames: 8, fps: 10, loop: false },
  ghost: { frames: 4, fps: 3, loop: true },
  body: { frames: 1, fps: 1, loop: false },
} as const;
export type CharacterAnimation = keyof typeof CHARACTER_ANIMATIONS;
export const CHARACTER_LAYERS = ['pack', 'suit', 'visor'] as const;
export type CharacterLayer = (typeof CHARACTER_LAYERS)[number];
export const animationKey = (
  animation: CharacterAnimation,
  layer: CharacterLayer,
) => `${animation}-${layer}`;

export interface PrivateAppearance {
  role?: 'crew' | 'impostor';
  teammateIds: ReadonlySet<string>;
}
/** No public Player role field: only private roleReveal knowledge can colour a name red. */
export function knowsImpostor(
  viewer: PrivateAppearance,
  id: string,
  ownId: string,
) {
  return (
    viewer.role === 'impostor' && (id === ownId || viewer.teammateIds.has(id))
  );
}

/** State choice is independent of Pixi and is safe to test without a browser. */
export function characterAnimation(
  alive: boolean,
  walking: boolean,
): CharacterAnimation {
  return !alive ? 'body' : walking ? 'walk' : 'idle';
}
