import './mobile.css';
/** Optional capabilities; unsupported/denied wake lock never blocks gameplay. */
export class MobileUX {
  private events = new AbortController();
  private wake?: WakeLockSentinel;
  private disposed = false;
  private acquiring = false;
  private prompt = document.createElement('aside');
  private cluster = document.createElement('div');
  private original: { node: Element; parent: Node; next: ChildNode | null }[] =
    [];
  constructor(host: HTMLElement) {
    this.cluster.className = 'touch-actions';
    for (const selector of [
      '.task-actions',
      '.impostor-actions',
      '.meeting-actions',
      '.sabotage-actions',
    ]) {
      const node = host.querySelector(selector);
      if (node)
        this.original.push({
          node,
          parent: node.parentNode!,
          next: node.nextSibling,
        });
    }
    const coarse = matchMedia('(pointer: coarse)');
    const adapt = () => {
      if (coarse.matches)
        this.original.forEach(({ node }) => this.cluster.append(node));
      else this.restore();
    };
    coarse.addEventListener('change', adapt, { signal: this.events.signal });
    adapt();
    host.append(this.cluster);
    this.prompt.className = 'landscape-prompt';
    this.prompt.innerHTML =
      '<p>Turn your phone sideways for more station space.</p><button class="secondary">Keep portrait</button>';
    this.prompt.querySelector('button')!.onclick = () => this.prompt.remove();
    host.append(this.prompt);
    document.addEventListener(
      'visibilitychange',
      () => {
        if (!document.hidden) void this.acquire();
      },
      { signal: this.events.signal },
    );
    host.addEventListener(
      'pointerdown',
      () => {
        void this.acquire();
      },
      { signal: this.events.signal, passive: true },
    );
    void this.acquire();
  }
  private async acquire() {
    if (
      this.disposed ||
      this.acquiring ||
      document.hidden ||
      (this.wake && !this.wake.released) ||
      !('wakeLock' in navigator)
    )
      return;
    this.acquiring = true;
    try {
      const wake = await navigator.wakeLock.request('screen');
      if (this.disposed) await wake.release();
      else this.wake = wake;
    } catch {
      /* Insecure contexts, browser or battery policy may deny this. */
    } finally {
      this.acquiring = false;
    }
  }
  destroy() {
    this.disposed = true;
    this.events.abort();
    void this.wake?.release();
    this.prompt.remove();
    this.restore();
    this.cluster.remove();
  }
  private restore() {
    for (const { node, parent, next } of this.original)
      parent.insertBefore(node, next?.parentNode === parent ? next : null);
  }
}
