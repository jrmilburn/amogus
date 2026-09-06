import type { MapDef } from './maps/schema.js';
import type { GameState } from './state.js';

export const SABOTAGE_COOLDOWN_MS = 30000;
export const DOOR_COOLDOWN_MS = 15000;
export const DOOR_LOCK_MS = 10000;
export const CRISIS_MS = 45000;
export const REACTOR_HOLD_MS = 3000;
export const COMMS_HOLD_MS = 5000;
export const REPAIR_RADIUS = 80;
export const REPAIR_HEARTBEAT_MS = 800;
export function closedDoorRects(
  map: MapDef,
  state: Pick<GameState, 'closedDoors'>,
) {
  return map.doors.filter((door) => state.closedDoors.has(door.room));
}
export function collisionMap(
  map: MapDef,
  state: Pick<GameState, 'closedDoors'>,
) {
  return {
    size: map.size,
    walls: [...map.walls, ...closedDoorRects(map, state)],
  };
}
export function emergencyBlocked(state: Pick<GameState, 'sabotage'>) {
  return state.sabotage?.kind === 'reactor' || state.sabotage?.kind === 'o2';
}
export function repairPointMatches(kind: string, pointKind: string) {
  return (
    kind === pointKind ||
    (kind === 'reactor' && pointKind.startsWith('reactor-')) ||
    (kind === 'o2' && pointKind.startsWith('o2-'))
  );
}
