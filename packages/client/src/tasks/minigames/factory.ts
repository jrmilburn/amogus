import type { TaskAssignment } from '@mutiny/shared';
import { createTaskGame as batchA, type TaskSoundHook } from './BatchA';
import { AccessCodeTask, ClearVentsTask, FuelTask, ScanIdTask } from './BatchB';
export function createTaskGame(
  task: TaskAssignment,
  duration: number,
  sound: TaskSoundHook = () => {},
) {
  switch (task.type) {
    case 'fuel-engines':
      return new FuelTask(task.step, duration, sound);
    case 'clear-vents':
      return new ClearVentsTask(duration, sound);
    case 'enter-access-code':
      return new AccessCodeTask(duration, sound);
    case 'scan-id':
      return new ScanIdTask(duration, sound);
    default:
      return batchA(task, duration, sound);
  }
}
