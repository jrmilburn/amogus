import {
  Application,
  Container,
  Graphics,
  Sprite,
  Text,
  TilingSprite,
  type Texture,
} from 'pixi.js';
import { pointInPolygon, type MapDef } from '@mutiny/shared/maps';
import { Camera, letterbox, overlaps, type Bounds, type Point } from './Camera';
import { floorBoundaries } from './boundaries';
import type { StationAssets } from './assets';
import { VisionLighting } from './VisionLighting';
import { ROOM_THEMES, roomFixtures, TASK_ART } from './roomThemes';

type LayerName =
  'floor' | 'walls' | 'objects' | 'entities' | 'lighting' | 'hud';
interface StaticItem {
  node: Container;
  bounds: Bounds;
}
export class Renderer {
  readonly app = new Application();
  readonly camera: Camera;
  readonly layers = Object.fromEntries(
    ['floor', 'walls', 'objects', 'entities', 'lighting', 'hud'].map((name) => [
      name,
      new Container({ label: name }),
    ]),
  ) as Record<LayerName, Container>;
  private world = new Container({ label: 'world' });
  private ownForeground = new Container({ label: 'own engineer foreground' });
  private ownClip = new Graphics();
  private localEntityId?: string;
  private limitedVision = false;
  private clip = new Graphics();
  private items: StaticItem[] = [];
  private entities = new Map<string, Container>();
  private screen = { width: 0, height: 0 };
  private motion = matchMedia('(prefers-reduced-motion: reduce)');
  private destroyed = false;
  private initialized = false;
  private running = true;
  private tickCost = 0;
  private previousCull = { x: Infinity, y: Infinity };
  private vision?: VisionLighting;
  private closedDoorArt = new Graphics();
  private doorSignature = '';
  private emissives: Sprite[] = [];
  private alarm = false;
  setAlarm(active: boolean) {
    this.alarm = active;
  }
  private visibility = () => {
    if (document.hidden) this.app.stop();
    else if (this.running) this.app.start();
  };
  onFrame?: (seconds: number) => void;
  constructor(
    readonly map: MapDef,
    private readonly assets: StationAssets,
  ) {
    this.camera = new Camera(map.size);
    this.camera.follow(map.emergencyButton, true);
  }
  async init(host: HTMLElement) {
    if (this.destroyed) return;
    try {
      await this.app.init({
        resizeTo: window,
        preference: 'webgl',
        background: 0x091219,
        antialias: true,
        resolution: Math.min(devicePixelRatio || 1, 2),
        autoDensity: true,
        powerPreference: 'high-performance',
      });
      this.initialized = true;
      if (this.destroyed) {
        this.app.destroy(true, { children: true });
        this.initialized = false;
        return;
      }
      host.append(this.app.canvas);
      this.app.canvas.setAttribute(
        'aria-label',
        'The Hollow station map. Drag to explore or choose a room.',
      );
      this.app.canvas.setAttribute('role', 'img');
      for (const name of [
        'floor',
        'walls',
        'objects',
        'entities',
        'lighting',
      ] as const)
        this.world.addChild(this.layers[name]);
      this.layers.entities.sortableChildren = true;
      this.app.stage.addChild(
        this.world,
        this.clip,
        this.layers.hud,
        this.ownForeground,
        this.ownClip,
      );
      this.world.mask = this.clip;
      this.ownForeground.mask = this.ownClip;
      this.buildMap();
      this.layers.objects.addChild(this.closedDoorArt);
      this.vision = new VisionLighting(this.app, this.layers.hud, this.map);
      this.app.ticker.maxFPS = 60;
      this.app.ticker.add((ticker) => this.update(ticker.deltaMS / 1000));
      document.addEventListener('visibilitychange', this.visibility);
      this.update(0);
    } catch (error) {
      this.destroy();
      throw error;
    }
  }
  private texture(name: string): Texture {
    return this.assets.textures[name]!;
  }
  private add(layer: LayerName, node: Container, bounds: Bounds) {
    this.layers[layer].addChild(node);
    this.items.push({ node, bounds });
    return node;
  }
  private tile(
    layer: LayerName,
    name: string,
    bounds: Bounds,
    tint = 0xffffff,
  ) {
    const node = new TilingSprite({
      texture: this.texture(name),
      width: bounds.width,
      height: bounds.height,
    });
    node.position.set(bounds.x, bounds.y);
    node.tint = tint;
    this.add(layer, node, bounds);
    return node;
  }
  private sprite(
    layer: LayerName,
    name: string,
    point: Point,
    width: number,
    height = width,
    tint = 0xffffff,
  ) {
    const node = new Sprite({ texture: this.texture(name), anchor: 0.5 });
    node.position.set(point.x, point.y);
    node.width = width;
    node.height = height;
    node.tint = tint;
    this.add(layer, node, {
      x: point.x - width / 2,
      y: point.y - height / 2,
      width,
      height,
    });
    return node;
  }
  private light(point: Point, width = 540) {
    const glow = this.sprite('lighting', 'glow', point, width);
    glow.blendMode = 'add';
    glow.alpha = 0.45;
    this.emissives.push(glow);
  }
  private buildMap() {
    for (const corridor of this.map.corridors)
      this.tile('floor', 'grate', corridor, 0xc3ccd1);
    for (const room of this.map.rooms) {
      const xs = room.polygon.map((p) => p.x),
        ys = room.polygon.map((p) => p.y);
      const bounds = {
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
      };
      const floor = this.tile(
        'floor',
        'floor',
        bounds,
        ROOM_THEMES[room.id]?.tint ?? 0xc5d1d8,
      );
      if (room.polygon.length !== 4) {
        const mask = new Graphics()
          .poly(room.polygon.flatMap((p) => [p.x, p.y]))
          .fill(0xffffff);
        this.layers.floor.addChild(mask);
        floor.mask = mask;
      }
      const cx = bounds.x + bounds.width / 2,
        cy = bounds.y + bounds.height / 2;
      const markings = new Graphics()
        .roundRect(
          bounds.x + 84,
          bounds.y + 84,
          bounds.width - 168,
          bounds.height - 168,
          28,
        )
        .stroke({ width: 3, color: 0x839695, alpha: 0.25 });
      this.add('floor', markings, bounds);
      const label = new Text({
        text: room.name.toUpperCase(),
        style: {
          fontFamily: 'Trebuchet MS, sans-serif',
          fontSize: 46,
          fontWeight: 'bold',
          fill: 0xa3b0ad,
          letterSpacing: 5,
        },
      });
      label.anchor.set(0.5);
      label.position.set(cx, cy - 130);
      label.alpha = 0.5;
      this.add('floor', label, {
        x: cx - 600,
        y: cy - 160,
        width: 1200,
        height: 70,
      });
      const theme = ROOM_THEMES[room.id];
      if (theme) {
        const purpose = new Text({
          text: theme.purpose,
          style: {
            fontFamily: 'Trebuchet MS, sans-serif',
            fontSize: 18,
            fill: theme.accent,
            letterSpacing: 2,
          },
        });
        purpose.anchor.set(0.5);
        purpose.position.set(cx, cy - 86);
        purpose.alpha = 0.8;
        this.add('floor', purpose, bounds);
        // Flush service channels connect machinery to its room's instruments.
        const channels = new Graphics();
        for (const task of this.map.tasks.filter((t) => t.room === room.id)) {
          channels
            .moveTo(task.x, task.y)
            .lineTo(task.x, cy + 65)
            .lineTo(cx, cy + 65);
        }
        channels.stroke({ color: theme.accent, width: 5, alpha: 0.22 });
        this.add('floor', channels, bounds);
        for (const fixture of roomFixtures(this.map, room)) {
          this.sprite(
            'objects',
            fixture.art,
            fixture,
            fixture.width,
            fixture.height,
          );
        }
      }
      if (room.id === 'commons') {
        const ring = new Graphics()
          .circle(cx, cy, 230)
          .stroke({ width: 5, color: 0x9eaa9c, alpha: 0.45 })
          .circle(cx, cy, 260)
          .stroke({ width: 2, color: 0x869f9c, alpha: 0.3 });
        this.add('floor', ring, bounds);
        for (const spawn of this.map.spawnPoints) {
          const pad = new Graphics()
            .circle(spawn.x, spawn.y, 35)
            .stroke({ width: 3, color: 0xe6a65a, alpha: 0.55 });
          this.add('floor', pad, {
            x: spawn.x - 40,
            y: spawn.y - 40,
            width: 80,
            height: 80,
          });
        }
      }
    }
    for (const edge of floorBoundaries(this.map)) {
      const horizontal = edge.axis === 'horizontal';
      const bounds = {
        x: edge.x + (horizontal ? 0 : edge.outward < 0 ? -56 : 0),
        y: edge.y + (horizontal && edge.outward < 0 ? -56 : 0),
        width: horizontal ? edge.length : 56,
        height: horizontal ? 56 : edge.length,
      };
      const wall = this.tile('walls', 'wall', bounds);
      if (!horizontal) wall.tileRotation = Math.PI / 2;
      const rim = new Graphics()
        .moveTo(edge.x, edge.y)
        .lineTo(
          edge.x + (horizontal ? edge.length : 0),
          edge.y + (horizontal ? 0 : edge.length),
        )
        .stroke({ width: 6, color: 0x879394 });
      this.add('walls', rim, {
        x: bounds.x - 6,
        y: bounds.y - 6,
        width: bounds.width + 12,
        height: bounds.height + 12,
      });
      for (let distance = 240; distance < edge.length - 160; distance += 900) {
        const p = {
          x: edge.x + (horizontal ? distance : -edge.outward * 14),
          y: edge.y + (horizontal ? -edge.outward * 14 : distance),
        };
        const lamp = this.sprite(
          'objects',
          'lamp',
          p,
          horizontal ? 130 : 45,
          horizontal ? 45 : 130,
        );
        if (!horizontal) {
          lamp.width = 130;
          lamp.height = 45;
          lamp.rotation = Math.PI / 2;
        }
        this.light({
          x: p.x + (horizontal ? 0 : -edge.outward * 120),
          y: p.y + (horizontal ? -edge.outward * 120 : 0),
        });
      }
    }
    for (const door of this.map.doors) {
      const g = new Graphics()
        .rect(door.x, door.y, door.width, door.height)
        .fill({ color: 0x16262e, alpha: 0.8 });
      const horizontal = door.width > door.height;
      for (
        let offset = 0;
        offset < (horizontal ? door.width : door.height);
        offset += 48
      ) {
        g.rect(
          door.x + (horizontal ? offset : 0),
          door.y + (horizontal ? 0 : offset),
          horizontal ? 22 : door.width,
          horizontal ? door.height : 22,
        ).fill({ color: 0xd49c58, alpha: 0.65 });
      }
      this.add('objects', g, door);
    }
    for (const task of this.map.tasks) {
      this.sprite('objects', TASK_ART[task.type] ?? 'console', task, 144);
      const dot = new Graphics()
        .circle(task.x + 46, task.y - 48, 6)
        .fill(0xa8d5c4);
      this.add('objects', dot, {
        x: task.x + 36,
        y: task.y - 58,
        width: 20,
        height: 20,
      });
    }
    for (const vent of this.map.vents)
      this.sprite('objects', 'vent', vent, 136);
    for (const panel of this.map.sabotagePoints) {
      this.sprite(
        'objects',
        panel.kind === 'lights'
          ? 'switchboard'
          : panel.kind.startsWith('o2')
            ? 'scrubber'
            : panel.kind === 'comms'
              ? 'servers'
              : 'console',
        panel,
        156,
        156,
        0xeac69a,
      );
      this.light(panel, 340);
    }
    for (const camera of this.map.cameras ?? []) {
      const fixture = this.sprite('objects', 'console', camera, 72);
      fixture.rotation = camera.facing;
    }
    if (this.map.id !== 'boarding')
      this.sprite('objects', 'emergency', this.map.emergencyButton, 220);
    this.light(this.map.emergencyButton, 600);
  }
  private update(seconds: number) {
    const start = performance.now();
    this.onFrame?.(seconds);
    this.camera.update(seconds, this.motion.matches);
    const screen = this.app.screen;
    if (
      screen.width !== this.screen.width ||
      screen.height !== this.screen.height
    ) {
      this.screen = { width: screen.width, height: screen.height };
      const box = letterbox(this.screen);
      this.clip
        .clear()
        .rect(box.x, box.y, box.width, box.height)
        .fill(0xffffff);
      this.world.scale.set(box.scale);
      this.ownForeground.scale.set(box.scale);
      this.ownClip
        .clear()
        .rect(box.x, box.y, box.width, box.height)
        .fill(0xffffff);
    }
    const box = letterbox(this.screen);
    this.world.position.set(
      box.x + box.width / 2 - this.camera.x * box.scale,
      box.y + box.height / 2 - this.camera.y * box.scale,
    );
    this.ownForeground.position.copyFrom(this.world.position);
    const own = this.localEntityId
      ? this.entities.get(this.localEntityId)
      : undefined;
    if (own) {
      const parent = this.limitedVision
        ? this.ownForeground
        : this.layers.entities;
      if (own.parent !== parent) parent.addChild(own);
    }
    if (
      Math.abs(this.previousCull.x - this.camera.x) > 4 ||
      Math.abs(this.previousCull.y - this.camera.y) > 4
    ) {
      const view = this.camera.bounds(100);
      for (const item of this.items)
        item.node.visible = overlaps(view, item.bounds);
      this.previousCull = { x: this.camera.x, y: this.camera.y };
    }
    this.vision?.update(this.camera);
    for (const glow of this.emissives) {
      glow.tint = this.alarm ? 0xf59185 : 0xffffff;
      glow.alpha = this.alarm
        ? this.motion.matches
          ? 0.5
          : 0.38 + 0.18 * Math.sin(performance.now() / 700)
        : 0.45;
    }
    for (const entity of this.entities.values()) {
      entity.zIndex = entity.y;
      entity.renderable = entity === own || this.isPointVisible(entity);
    }
    this.tickCost = performance.now() - start;
  }
  /** Public lifecycle/API for the movement renderer in #7. Containers are renderer-owned. */
  setEntity(id: string, entity: Container) {
    this.removeEntity(id);
    this.entities.set(id, entity);
    this.layers.entities.addChild(entity);
  }
  removeEntity(id: string) {
    const entity = this.entities.get(id);
    if (entity) {
      entity.destroy({ children: true });
      this.entities.delete(id);
      if (this.localEntityId === id) this.localEntityId = undefined;
    }
  }
  setLocalEntity(id: string) {
    this.localEntityId = id;
  }
  roomAt(point: Point) {
    return this.map.rooms.find((room) => pointInPolygon(point, room.polygon));
  }
  setVision(origin?: Point, radius = 0, affectedByLights = true) {
    this.limitedVision = Boolean(origin);
    this.vision?.setView(origin, radius, affectedByLights);
  }
  setVisionMultiplier(n: number) {
    this.vision?.setVisionMultiplier(n);
  }
  setClosedVisionDoors(walls: MapDef['walls']) {
    this.vision?.setClosedDoors(walls);
    const signature = walls.map((w) => `${w.x},${w.y}`).join(';');
    if (signature === this.doorSignature) return;
    this.doorSignature = signature;
    this.closedDoorArt.clear();
    for (const wall of walls)
      this.closedDoorArt
        .rect(wall.x, wall.y, wall.width, wall.height)
        .fill(0x6f7d85)
        .stroke({ color: 0xff8f99, width: 6 });
  }
  isPointVisible(point: Point) {
    return this.vision?.canSee(point) ?? true;
  }
  pause() {
    this.running = false;
    this.app.stop();
  }
  resume() {
    this.running = true;
    if (!document.hidden) this.app.start();
  }
  get stats() {
    return {
      staticItems: this.items.length,
      visibleItems: this.items.filter((item) => item.node.visible).length,
      entities: this.entities.size,
      updateMs: this.tickCost,
      fps: this.app.ticker.FPS,
      resolution: this.app.renderer.resolution,
      lightingUpdateMs: this.vision?.updateMs ?? 0,
      lightingMaskUpdates: this.vision?.maskUpdates ?? 0,
    };
  }
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.running = false;
    document.removeEventListener('visibilitychange', this.visibility);
    this.vision?.destroy();
    this.vision = undefined;
    // Assets are cached for reopening the preview; destroying a scene must not destroy shared textures.
    if (this.initialized)
      this.app.destroy(true, {
        children: true,
        texture: false,
        textureSource: false,
      });
    this.initialized = false;
    this.items = [];
    this.entities.clear();
  }
}
