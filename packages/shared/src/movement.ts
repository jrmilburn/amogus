import { TICK_RATE } from './constants.js';
import type { ClientMessages } from './protocol.js';
import type { Phase } from './state.js';
import type { Point, Rect } from './maps/geometry.js';

export const PLAYER_RADIUS = 24;
export const MOVEMENT_STEP = 1 / TICK_RATE;
export const MAX_INPUT_QUEUE = 4;
export type MovementInput = ClientMessages['input'];
export interface CollisionMap {
  size: { width: number; height: number };
  walls: readonly Rect[];
}

export function validMovementInput(value: unknown): value is MovementInput {
  if (!value || typeof value !== 'object') return false;
  const input = value as MovementInput;
  return (
    Object.keys(value).length === 3 &&
    Number.isInteger(input.seq) &&
    input.seq > 0 &&
    input.seq <= 0xffffffff &&
    Number.isFinite(input.dx) &&
    Math.abs(input.dx) <= 1 &&
    Number.isFinite(input.dy) &&
    Math.abs(input.dy) <= 1
  );
}

/** Lobby walkaround is available before #9 introduces actual game rounds. */
export function canMove(
  phase: Phase,
  player: { alive: boolean; inVent: boolean; connected: boolean },
) {
  return (
    (phase === 'lobby' || phase === 'playing') &&
    (player.alive || phase === 'playing') &&
    !player.inVent &&
    player.connected
  );
}

/** Swept circle against axis-aligned walls, resolving X then Y for sliding.
 * Each axis sweep clamps at the first contact, even across thin walls.
 * Client prediction and authoritative simulation MUST use this same function.
 */
export function movePlayer(
  position: Point,
  input: Pick<MovementInput, 'dx' | 'dy'>,
  speed: number,
  map: CollisionMap,
  seconds = MOVEMENT_STEP,
): Point {
  const length = Math.max(1, Math.hypot(input.dx, input.dy));
  const distance = (speed * seconds) / length;
  const result = { x: position.x, y: position.y };
  for (const axis of ['x', 'y'] as const) {
    const other = axis === 'x' ? 'y' : 'x';
    const extent = axis === 'x' ? 'width' : 'height';
    const otherExtent = axis === 'x' ? 'height' : 'width';
    const delta = (axis === 'x' ? input.dx : input.dy) * distance;
    let end = Math.max(
      PLAYER_RADIUS,
      Math.min(map.size[extent] - PLAYER_RADIUS, result[axis] + delta),
    );
    for (const wall of map.walls) {
      const separation = Math.max(
        wall[other] - result[other],
        0,
        result[other] - wall[other] - wall[otherExtent],
      );
      if (separation >= PLAYER_RADIUS) continue;
      const clearance = Math.sqrt(PLAYER_RADIUS ** 2 - separation ** 2);
      const near = wall[axis] - clearance;
      const far = wall[axis] + wall[extent] + clearance;
      if (delta > 0 && result[axis] <= near + 1e-7 && end > near)
        end = Math.min(end, near);
      if (delta < 0 && result[axis] >= far - 1e-7 && end < far)
        end = Math.max(end, far);
    }
    result[axis] = end;
  }
  return result;
}
