import {
  taskStation,
  TASK_USE_RADIUS,
  type TaskAssignment,
} from '@mutiny/shared';
import type { MapDef, Point } from '@mutiny/shared/maps';

export const TASK_SPOT_COLOR = 0x99ddcc;
export const TRACKED_SPOT_COLOR = 0xffffff;
export const READY_SPOT_COLOR = 0xe6a65a;
export function taskName(type: string) {
  const name = type.replaceAll('-', ' ');
  return name.charAt(0).toUpperCase() + name.slice(1);
}
/** Visibility is filtered before proximity: an unseen station cannot steal targeting. */
export function visibleTaskSpots(
  map: MapDef,
  tasks: readonly TaskAssignment[],
  own: Point,
  visible: (point: Point) => boolean,
) {
  return tasks
    .flatMap((task) => {
      if (task.completed) return [];
      const station = taskStation(map, task);
      if (!station || !visible(station)) return [];
      const distance = Math.hypot(own.x - station.x, own.y - station.y);
      return [
        { task, station, distance, reachable: distance <= TASK_USE_RADIUS },
      ];
    })
    .sort((a, b) => a.distance - b.distance);
}
