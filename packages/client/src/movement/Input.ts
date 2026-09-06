const directions: Record<string, readonly [number, number]> = {
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

/** Pointer capture keeps the thumbstick usable outside its activation zone. */
export class MovementInput {
  private events = new AbortController();
  private keys = new Set<string>();
  private pointer?: { id: number; x: number; y: number };
  private touch = { dx: 0, dy: 0 };
  private stick: HTMLElement;
  private knob: HTMLElement;
  constructor(
    dialog: HTMLElement,
    private readonly zone: HTMLElement,
  ) {
    zone.innerHTML =
      '<span class="walk-stick" hidden><span class="walk-knob"></span></span><span class="walk-touch-hint">Drag here to walk</span>';
    this.stick = zone.querySelector<HTMLElement>('.walk-stick')!;
    this.knob = zone.querySelector<HTMLElement>('.walk-knob')!;
    const options = { signal: this.events.signal };
    dialog.addEventListener(
      'keydown',
      (event) => {
        if (
          (event.target instanceof HTMLElement &&
            Boolean(event.target.closest('.task-modal, .vent-routes'))) ||
          !directions[event.code] ||
          event.altKey ||
          event.ctrlKey ||
          event.metaKey ||
          (event.target instanceof HTMLElement &&
            event.target.matches(
              'input, select, textarea, [contenteditable="true"]',
            ))
        )
          return;
        event.preventDefault();
        this.keys.add(event.code);
      },
      options,
    );
    window.addEventListener(
      'keyup',
      (event) => this.keys.delete(event.code),
      options,
    );
    window.addEventListener('blur', () => this.clear(), options);
    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.hidden) this.clear();
      },
      options,
    );
    zone.addEventListener(
      'pointerdown',
      (event) => {
        if (this.pointer || event.button !== 0) return;
        event.preventDefault();
        const bounds = zone.getBoundingClientRect();
        this.pointer = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
        };
        this.stick.style.left = `${event.clientX - bounds.left}px`;
        this.stick.style.top = `${event.clientY - bounds.top}px`;
        this.stick.hidden = false;
        zone.setPointerCapture(event.pointerId);
      },
      options,
    );
    zone.addEventListener(
      'pointermove',
      (event) => {
        if (this.pointer?.id !== event.pointerId) return;
        const dx = event.clientX - this.pointer.x,
          dy = event.clientY - this.pointer.y;
        const length = Math.hypot(dx, dy);
        const magnitude = Math.min(1, Math.max(0, (length - 8) / 40));
        this.touch = {
          dx: length ? (dx / length) * magnitude : 0,
          dy: length ? (dy / length) * magnitude : 0,
        };
        this.knob.style.transform = `translate(${this.touch.dx * 40}px, ${this.touch.dy * 40}px)`;
      },
      options,
    );
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
      zone.addEventListener(
        type,
        (event) => {
          if ((event as PointerEvent).pointerId === this.pointer?.id)
            this.clear();
        },
        options,
      );
  }
  direction() {
    let dx = this.touch.dx,
      dy = this.touch.dy;
    for (const key of this.keys) {
      const direction = directions[key]!;
      dx += direction[0];
      dy += direction[1];
    }
    const length = Math.max(1, Math.hypot(dx, dy));
    return { dx: dx / length, dy: dy / length };
  }
  clear() {
    this.keys.clear();
    const pointer = this.pointer;
    this.pointer = undefined;
    this.touch = { dx: 0, dy: 0 };
    this.stick.hidden = true;
    this.knob.style.transform = '';
    if (pointer && this.zone.hasPointerCapture(pointer.id))
      this.zone.releasePointerCapture(pointer.id);
  }
  destroy() {
    this.clear();
    this.events.abort();
  }
}
