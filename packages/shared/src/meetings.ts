import { clearActionPath } from './actions.js';
import { collisionMap, emergencyBlocked } from './sabotage.js';
import type { GameState, Player } from './state.js';
import type { MapDef, Point } from './maps/index.js';

export const REPORT_RADIUS = 100;
export const EMERGENCY_RADIUS = 80;
export const EMERGENCY_COOLDOWN_MS = 15000;
export const EJECTION_MS = 6000;
export function meetingReachable(
  map: MapDef,
  state: GameState,
  own: Point,
  target: Point,
  radius: number,
) {
  return (
    Math.hypot(own.x - target.x, own.y - target.y) <= radius &&
    clearActionPath(own, target, collisionMap(map, state).walls)
  );
}
export function nearestBody(map: MapDef, state: GameState, own: Point) {
  return [...state.bodies.values()]
    .filter((b) => meetingReachable(map, state, own, b, REPORT_RADIUS))
    .sort(
      (a, b) =>
        Math.hypot(a.x - own.x, a.y - own.y) -
        Math.hypot(b.x - own.x, b.y - own.y),
    )[0];
}
export function emergencyUnavailable(
  map: MapDef,
  state: GameState,
  own: Player,
  now = state.serverNow,
): string | undefined {
  if (emergencyBlocked(state))
    return 'Repair the reactor or oxygen crisis first.';
  if (own.emergenciesUsed >= state.settings.emergencyMeetings)
    return 'No emergency calls remaining.';
  if (now < state.emergencyReadyAt)
    return `Emergency ready in ${Math.ceil((state.emergencyReadyAt - now) / 1000)}s.`;
  if (!meetingReachable(map, state, own, map.emergencyButton, EMERGENCY_RADIUS))
    return 'Move close to the Commons emergency button.';
}
