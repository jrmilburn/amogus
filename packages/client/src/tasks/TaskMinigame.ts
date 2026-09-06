export interface TaskMinigame {
  mount(container: HTMLElement, onComplete: () => void): void;
  unmount(): void;
}

/** Defensive fallback for unknown future types; all eight mapped types have minigames. */
export class HoldTask implements TaskMinigame {
  private events = new AbortController();
  private timer?: ReturnType<typeof setInterval>;
  private root?: HTMLElement;
  constructor(private durationMs: number) {}
  mount(container: HTMLElement, onComplete: () => void) {
    this.root = document.createElement('div');
    this.root.innerHTML =
      '<p>Prototype station check. Hold for two seconds without releasing.</p><progress max="1" value="0" aria-label="Hold progress"></progress><button type="button" class="task-hold">Hold to complete</button>';
    container.append(this.root);
    const button = this.root.querySelector('button')!;
    const progress = this.root.querySelector('progress')!;
    const options = { signal: this.events.signal };
    let started = 0,
      done = false;
    const stop = () => {
      started = 0;
      if (!done) progress.value = 0;
    };
    const begin = () => {
      if (!started && !done) started = performance.now();
    };
    button.addEventListener(
      'pointerdown',
      (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        button.focus();
        button.setPointerCapture(e.pointerId);
        begin();
      },
      options,
    );
    for (const event of [
      'pointerup',
      'pointercancel',
      'lostpointercapture',
      'blur',
    ])
      button.addEventListener(event, stop, options);
    button.addEventListener(
      'keydown',
      (e) => {
        if (['Space', 'Enter'].includes(e.code)) {
          e.preventDefault();
          begin();
        }
      },
      options,
    );
    button.addEventListener(
      'keyup',
      (e) => {
        if (['Space', 'Enter'].includes(e.code)) {
          e.preventDefault();
          stop();
        }
      },
      options,
    );
    window.addEventListener('blur', stop, options);
    document.addEventListener('visibilitychange', stop, options);
    this.timer = setInterval(() => {
      if (!started || done) return;
      progress.value = Math.min(
        1,
        (performance.now() - started) / this.durationMs,
      );
      if (progress.value === 1) {
        done = true;
        button.disabled = true;
        button.textContent = 'Confirming…';
        onComplete();
      }
    }, 30);
    button.focus();
  }
  unmount() {
    this.events.abort();
    clearInterval(this.timer);
    this.root?.remove();
  }
}
