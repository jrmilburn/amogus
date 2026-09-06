import type { MapDef, Point } from './maps/index.js';
import type { TaskAssignment } from './protocol.js';

export const TASK_USE_RADIUS = 80;
export const TASK_HOLD_MS = 2000;
export function taskDurationMs(type: string) {
  if (type === 'data-transfer') return 8000;
  if (
    [
      'reroute-power',
      'calibrate-gyro',
      'sort-samples',
      'fuel-engines',
      'clear-vents',
      'enter-access-code',
      'scan-id',
    ].includes(type)
  )
    return 5000;
  return TASK_HOLD_MS;
}
/** Assignment IDs remain stable while the current station follows the stage chain. */
export function taskStation(map: MapDef, task: TaskAssignment) {
  let station = map.tasks.find((entry) => entry.id === task.id);
  for (let step = 1; step < task.step && station; step++)
    station = map.tasks.find((entry) => entry.id === station!.nextTaskId);
  return station;
}
export function nearestTask(
  map: MapDef,
  tasks: TaskAssignment[],
  position: Point,
) {
  return tasks
    .filter((task) => !task.completed)
    .map((task) => {
      const station = taskStation(map, task);
      return {
        task,
        station,
        distance: station
          ? Math.hypot(position.x - station.x, position.y - station.y)
          : Infinity,
      };
    })
    .filter((entry) => entry.distance <= TASK_USE_RADIUS)
    .sort((a, b) => a.distance - b.distance)[0];
}
