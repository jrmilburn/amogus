import type { WalkRoom } from '../movement/Walkaround';
import type { Renderer } from '../renderer/Renderer';
import './polish.css';
/** Effects communicate events already visible to this player; never reveal a hidden kill. */
export class GamePolish {
  private bodies = new Set<string>();
  private completed: number;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private vignette = document.createElement('div');
  private sparks = document.createElement('div');
  private reduced = matchMedia('(prefers-reduced-motion: reduce)');
  constructor(
    private host: HTMLElement,
    private room: WalkRoom,
    private renderer: Renderer,
  ) {
    this.completed = room.state.players.get(room.sessionId)?.tasksDone ?? 0;
    for (const id of room.state.bodies.keys()) this.bodies.add(id);
    this.vignette.className = 'witness-vignette';
    this.sparks.className = 'task-sparks';
    this.vignette.setAttribute('aria-hidden', 'true');
    this.sparks.setAttribute('aria-hidden', 'true');
    host.append(this.vignette, this.sparks);
  }
  frame() {
    const state = this.room.state,
      own = state.players.get(this.room.sessionId);
    if (!own) return;
    this.renderer.setAlarm(state.phase === 'playing' && !!state.sabotage);
    for (const [id, body] of state.bodies) {
      if (this.bodies.has(id)) continue;
      this.bodies.add(id);
      if (!own.alive || !this.renderer.isPointVisible(body)) continue;
      this.host.classList.add('witness-kill');
      this.timers.push(
        setTimeout(() => this.host.classList.remove('witness-kill'), 450),
      );
    }
    for (const id of this.bodies)
      if (!state.bodies.has(id)) this.bodies.delete(id);
    if (own.tasksDone > this.completed && !this.reduced.matches) {
      this.sparks.replaceChildren();
      for (let i = 0; i < 12; i++) {
        const spark = document.createElement('i');
        spark.style.setProperty(
          '--dx',
          `${Math.cos((i * Math.PI) / 6) * 90}px`,
        );
        spark.style.setProperty(
          '--dy',
          `${Math.sin((i * Math.PI) / 6) * 90}px`,
        );
        this.sparks.append(spark);
      }
      this.timers.push(setTimeout(() => this.sparks.replaceChildren(), 700));
    }
    this.completed = own.tasksDone;
  }
  destroy() {
    this.timers.forEach(clearTimeout);
    this.renderer.setAlarm(false);
    this.host.classList.remove('witness-kill');
    this.vignette.remove();
    this.sparks.remove();
  }
}
