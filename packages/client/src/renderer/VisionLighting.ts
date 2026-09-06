import {
  Container,
  Graphics,
  RenderTexture,
  Sprite,
  Texture,
  type Application,
} from 'pixi.js';
import type { MapDef, Point, Rect } from '@mutiny/shared/maps';
import { letterbox } from './Camera';
import { VisibilityField } from './visibility';

/** THESIS: nearby station light ends at solid walls; unknown rooms stay unknown.
 * OWN-WORLD: existing cold-metal darkness and warm lamp glow, no new neon effects.
 * STORY: see down an open passage, lose sight around corners, approach to discover.
 * FIRST VIEWPORT: own engineer at the centre of a soft radial pool; HUD unaffected.
 * FORM: a fullscreen dark veil with an inverse alpha render-texture visibility mask.
 */
export class VisionLighting {
  readonly field: VisibilityField;
  private overlay = new Graphics();
  private target = RenderTexture.create({
    width: 1024,
    height: 1024,
    resolution: 1,
  });
  private mask = new Sprite(this.target);
  private scratch = new Container();
  private polygon = new Graphics();
  private radial: Sprite;
  private gradient: Texture;
  private view?: { origin: Point; radius: number; affectedByLights: boolean };
  private multiplier = 1;
  private screenKey = '';
  private enabled = false;
  updateMs = 0;
  maskUpdates = 0;
  constructor(
    private app: Application,
    hud: Container,
    map: MapDef,
  ) {
    this.field = new VisibilityField(map);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const context = canvas.getContext('2d')!;
    const gradient = context.createRadialGradient(128, 128, 0, 128, 128, 128);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.72, 'rgba(255,255,255,1)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 256, 256);
    this.gradient = Texture.from(canvas);
    this.radial = new Sprite(this.gradient);
    this.radial.width = this.radial.height = 1024;
    this.scratch.addChild(this.radial, this.polygon);
    this.radial.mask = this.polygon;
    hud.addChild(this.overlay, this.mask);
    this.overlay.setMask({ mask: this.mask, inverse: true, channel: 'alpha' });
    this.overlay.visible = false;
  }
  setView(origin: Point | undefined, radius = 0, affectedByLights = true) {
    this.view = origin
      ? { origin: { ...origin }, radius, affectedByLights }
      : undefined;
  }
  /** #15: crew dimming; impostor views explicitly bypass this multiplier. */
  setVisionMultiplier(n: number) {
    if (!Number.isFinite(n) || n < 0 || n > 1)
      throw new Error('Vision multiplier must be within 0..1.');
    this.multiplier = n;
  }
  setClosedDoors(walls: readonly Rect[]) {
    this.field.setClosedDoors(walls);
  }
  canSee(point: Point) {
    return !this.enabled || this.field.canSee(point);
  }
  update(camera: Point) {
    const start = performance.now();
    this.enabled = Boolean(this.view);
    this.overlay.visible = this.enabled;
    if (!this.view) {
      this.updateMs = performance.now() - start;
      return;
    }
    const { origin, affectedByLights } = this.view;
    const radius = this.view.radius * (affectedByLights ? this.multiplier : 1);
    if (this.field.update(origin, radius)) {
      const scale = 512 / Math.max(radius, 1);
      this.polygon.clear();
      if (this.field.polygon.length >= 3)
        this.polygon
          .poly(
            this.field.polygon.flatMap((p) => [
              512 + (p.x - origin.x) * scale,
              512 + (p.y - origin.y) * scale,
            ]),
          )
          .fill(0xffffff);
      this.app.renderer.render({
        container: this.scratch,
        target: this.target,
        clear: true,
        clearColor: [0, 0, 0, 0],
      });
      this.maskUpdates++;
    }
    const screen = this.app.screen,
      box = letterbox(screen);
    const key = `${screen.width}:${screen.height}`;
    if (key !== this.screenKey) {
      this.screenKey = key;
      this.overlay
        .clear()
        .rect(0, 0, screen.width, screen.height)
        .fill(0x091219);
    }
    this.mask.position.set(
      box.x + box.width / 2 + (origin.x - camera.x - radius) * box.scale,
      box.y + box.height / 2 + (origin.y - camera.y - radius) * box.scale,
    );
    this.mask.width = this.mask.height = Math.max(
      0.001,
      radius * 2 * box.scale,
    );
    this.updateMs = performance.now() - start;
  }
  destroy() {
    this.overlay.mask = null;
    this.overlay.destroy();
    this.mask.destroy();
    this.scratch.destroy({ children: true });
    this.target.destroy(true);
    this.gradient.destroy(true);
  }
}
