import {
  clearActionPath,
  collisionMap,
  REPAIR_RADIUS,
  repairPointMatches,
  type GameState,
} from '@mutiny/shared';
import type { MapDef, Point } from '@mutiny/shared/maps';

export function repairCandidate(map: MapDef, state: GameState, own: Point) {
  const fault = state.sabotage;
  if (!fault) return undefined;
  return map.sabotagePoints.find(
    (p) =>
      repairPointMatches(fault.kind, p.kind) &&
      !fault.fixedPoints.includes(p.id) &&
      Math.hypot(p.x - own.x, p.y - own.y) <= REPAIR_RADIUS &&
      clearActionPath(own, p, collisionMap(map, state).walls),
  );
}
export function secondsLeft(deadline: number, serverNow: number) {
  return Math.max(0, Math.ceil((deadline - serverNow) / 1000));
}
export const faultLabels = {
  lights: 'Lights offline',
  reactor: 'Reactor meltdown',
  o2: 'Oxygen depleted',
  comms: 'Comms offline',
  doors: 'Doors sealed',
};
