import type { MapDef, Point } from '@mutiny/shared/maps';
import { taskStation, type TaskAssignment } from '@mutiny/shared';

/** Input is exclusively the local connection's private task list. */
export function taskDestinations(
  map: MapDef,
  tasks: readonly TaskAssignment[],
) {
  return tasks
    .filter((task) => !task.completed)
    .flatMap((task) => {
      const station = taskStation(map, task);
      return station
        ? [
            {
              id: task.id,
              point: minimapPoint(map, station),
              room:
                map.rooms.find((room) => room.id === station.room)?.name ??
                station.room,
            },
          ]
        : [];
    });
}

/** Static public map geometry and one local point only; deliberately no room/player state. */
export function minimapPoint(map: Pick<MapDef, 'size'>, point: Point) {
  return {
    x:
      8 +
      (Math.max(0, Math.min(map.size.width, point.x)) / map.size.width) * 224,
    y:
      8 +
      (Math.max(0, Math.min(map.size.height, point.y)) / map.size.height) * 190,
  };
}
