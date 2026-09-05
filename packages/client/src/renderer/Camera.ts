export interface Point {
  x: number;
  y: number;
}
export interface Size {
  width: number;
  height: number;
}
export interface Bounds extends Point, Size {}
export const WORLD_VIEW: Readonly<Size> = { width: 1920, height: 1080 };

export function letterbox(screen: Size, view: Size = WORLD_VIEW) {
  const scale = Math.min(
    screen.width / view.width,
    screen.height / view.height,
  );
  return {
    scale,
    x: (screen.width - view.width * scale) / 2,
    y: (screen.height - view.height * scale) / 2,
    width: view.width * scale,
    height: view.height * scale,
  };
}
export function overlaps(a: Bounds, b: Bounds) {
  return (
    a.x <= b.x + b.width &&
    a.x + a.width >= b.x &&
    a.y <= b.y + b.height &&
    a.y + a.height >= b.y
  );
}
export class Camera {
  x = 0;
  y = 0;
  private target: Point = { x: 0, y: 0 };
  constructor(
    readonly map: Size,
    readonly view: Readonly<Size> = WORLD_VIEW,
  ) {}
  constrain(point: Point): Point {
    return {
      x:
        this.map.width <= this.view.width
          ? this.map.width / 2
          : Math.max(
              this.view.width / 2,
              Math.min(point.x, this.map.width - this.view.width / 2),
            ),
      y:
        this.map.height <= this.view.height
          ? this.map.height / 2
          : Math.max(
              this.view.height / 2,
              Math.min(point.y, this.map.height - this.view.height / 2),
            ),
    };
  }
  /** Keep a live target reference for #7's own-player prediction state. */
  follow(target: Point, snap = false) {
    this.target = target;
    if (snap) Object.assign(this, this.constrain(target));
  }
  update(deltaSeconds: number, reducedMotion = false) {
    const target = this.constrain(this.target);
    const amount = reducedMotion
      ? 1
      : 1 - Math.exp(-10 * Math.max(0, Math.min(deltaSeconds, 0.1)));
    this.x += (target.x - this.x) * amount;
    this.y += (target.y - this.y) * amount;
  }
  bounds(padding = 0): Bounds {
    return {
      x: this.x - this.view.width / 2 - padding,
      y: this.y - this.view.height / 2 - padding,
      width: this.view.width + padding * 2,
      height: this.view.height + padding * 2,
    };
  }
  screenToWorld(point: Point, screen: Size): Point {
    const box = letterbox(screen, this.view);
    return {
      x: (point.x - box.x) / box.scale + this.x - this.view.width / 2,
      y: (point.y - box.y) / box.scale + this.y - this.view.height / 2,
    };
  }
}
