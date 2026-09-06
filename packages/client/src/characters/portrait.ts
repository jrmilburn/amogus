import type { ColorId } from '@mutiny/shared';
import type { Renderer } from '../renderer/Renderer';
import type { CharacterAssets } from './assets';
import { CharacterView } from './CharacterView';

/** Reuse the real tinted engineer art; no network asset or second WebGL app. */
export function engineerPortrait(
  renderer: Renderer,
  assets: CharacterAssets,
  color: ColorId,
) {
  const view = new CharacterView(assets, '', color);
  view.nameTag.visible = false;
  try {
    const canvas = renderer.app.renderer.extract.canvas({
      target: view,
      resolution: 2,
    });
    if (canvas instanceof HTMLCanvasElement) {
      canvas.setAttribute('aria-hidden', 'true');
      return canvas;
    }
  } catch (error) {
    console.warn('Engineer portrait unavailable:', error);
  } finally {
    view.destroy({ children: true });
  }
  return undefined;
}
