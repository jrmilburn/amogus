import { audio } from './AudioManager';
import type { WalkRoom } from '../movement/Walkaround';
import type { Renderer } from '../renderer/Renderer';
/** Spatial cues follow the same visibility boundary as characters. */
export class GameAudio {
  private phase = '';
  private completed = 0;
  private votes = 0;
  private lastStep = 0;
  private lastAlarm = 0;
  private vents = new Map<string, boolean>();
  private off: (() => void)[] = [];
  constructor(
    private room: WalkRoom,
    private renderer: Renderer,
  ) {
    this.completed = room.state.players.get(room.sessionId)?.tasksDone ?? 0;
    this.off.push(room.onMessage('killed', () => audio.play('kill')));
  }
  frame() {
    const state = this.room.state,
      own = state.players.get(this.room.sessionId);
    if (!own) return;
    const now = performance.now();
    if (this.phase !== state.phase) {
      if (state.phase === 'meeting') audio.play('meeting');
      if (state.phase === 'ejection') audio.play('ejection');
      if (state.phase === 'ended') audio.play('end');
      this.phase = state.phase;
      audio.setAmbient(state.phase === 'playing');
    }
    if (own.tasksDone > this.completed) audio.play('task');
    this.completed = own.tasksDone;
    const voted = state.meeting?.voted.size ?? 0;
    if (voted > this.votes) audio.play('vote');
    this.votes = voted;
    if (
      state.phase === 'playing' &&
      state.sabotage &&
      now - this.lastAlarm > 1800
    ) {
      audio.play('alarm');
      this.lastAlarm = now;
    }
    const step = now - this.lastStep > 360;
    if (step) this.lastStep = now;
    for (const [id, p] of state.players) {
      const prior = this.vents.get(id);
      this.vents.set(id, p.inVent);
      if (!p.alive || !p.connected || !this.renderer.isPointVisible(p))
        continue;
      const distance = Math.hypot(p.x - own.x, p.y - own.y),
        pan = (p.x - own.x) / 600;
      if (prior !== undefined && prior !== p.inVent)
        audio.play('vent', distance, pan);
      if (step && p.walking && !p.inVent && state.phase === 'playing')
        audio.play('step', distance, pan);
    }
    for (const id of this.vents.keys())
      if (!state.players.has(id)) this.vents.delete(id);
  }
  destroy() {
    this.off.forEach((off) => off());
    audio.setAmbient(false);
  }
}
