import './mobile.css';
let portraitDismissed = false;
/** Optional capabilities; unsupported/denied wake lock never blocks gameplay. */
export class MobileUX {
  private events = new AbortController();
  private wake?: WakeLockSentinel;
  private disposed = false;
  private acquiring = false;
  private prompt = document.createElement('aside');
  private cluster = document.createElement('div');
  private feedback = document.createElement('aside');
  private feedbackObserver: MutationObserver;
  private original: { node: Element; parent: Node; next: ChildNode | null }[] =
    [];
  constructor(host: HTMLElement) {
    this.cluster.className = 'touch-actions';
    this.cluster.setAttribute('role', 'group');
    this.cluster.setAttribute('aria-label', 'Game actions');
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
    this.feedback.className = 'hud-feedback';
    this.feedback.hidden = true;
    const dismiss = document.createElement('button');
    dismiss.className = 'secondary';
    dismiss.textContent = '×';
    dismiss.setAttribute('aria-label', 'Dismiss status message');
    dismiss.onclick = () => {
      this.feedback.hidden = true;
    };
    this.feedback.append(dismiss);
    const messages = this.original.flatMap(({ node }) => [
      ...node.querySelectorAll<HTMLParagraphElement>(':scope > p'),
    ]);
    for (const node of messages)
      this.original.push({
        node,
        parent: node.parentNode!,
        next: node.nextSibling,
      });
    this.feedbackObserver = new MutationObserver((records) => {
      for (const record of records) {
        const node =
          record.target instanceof Element
            ? record.target
            : record.target.parentElement;
        const message = node?.closest('p');
        if (!message || !messages.includes(message) || message.hidden) continue;
        const original = this.original.find((item) => item.node === message);
        if (original?.parent instanceof HTMLElement && original.parent.hidden)
          continue;
        if (message.textContent?.trim()) {
          messages.forEach((p) =>
            p.classList.toggle('is-latest', p === message),
          );
          this.feedback.hidden = false;
        } else if (message.classList.contains('is-latest'))
          this.feedback.hidden = true;
      }
    });
    messages.forEach((message) =>
      this.feedbackObserver.observe(message, {
        childList: true,
        subtree: true,
        characterData: true,
      }),
    );
    const adapt = () => {
      if (coarse.matches) {
        this.original.forEach(({ node }) =>
          (node instanceof HTMLParagraphElement
            ? this.feedback
            : this.cluster
          ).append(node),
        );
      } else this.restore();
    };
    coarse.addEventListener('change', adapt, { signal: this.events.signal });
    adapt();
    host.append(this.cluster, this.feedback);
    const compact = matchMedia(
      '(max-width: 700px), (max-height: 500px), (pointer: coarse)',
    );
    const disclosures = [
      ...host.querySelectorAll<HTMLDetailsElement>(
        '.station-minimap, .round-assignment',
      ),
    ];
    for (const disclosure of disclosures) {
      if (compact.matches) disclosure.open = false;
      disclosure.addEventListener(
        'toggle',
        () => {
          if (compact.matches && disclosure.open)
            disclosures.forEach((other) => {
              if (other !== disclosure) other.open = false;
            });
        },
        { signal: this.events.signal },
      );
    }
    compact.addEventListener(
      'change',
      () => {
        if (compact.matches)
          disclosures.forEach((disclosure) => {
            disclosure.open = false;
          });
      },
      { signal: this.events.signal },
    );
    this.prompt.className = 'landscape-prompt';
    this.prompt.innerHTML =
      '<p>Turn your phone sideways for more station space.</p><button class="secondary">Keep portrait</button>';
    this.prompt.querySelector('button')!.onclick = () => {
      portraitDismissed = true;
      this.prompt.remove();
    };
    host.querySelector('.walk-touch-zone')?.addEventListener(
      'pointerdown',
      () => {
        portraitDismissed = true;
        this.prompt.remove();
      },
      { once: true, signal: this.events.signal },
    );
    if (!portraitDismissed) host.append(this.prompt);
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
  frame(playing: boolean) {
    this.cluster.hidden = !playing;
    if (!playing) this.feedback.hidden = true;
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
    this.feedbackObserver.disconnect();
    void this.wake?.release();
    this.prompt.remove();
    this.restore();
    this.cluster.remove();
    this.feedback.remove();
  }
  private restore() {
    for (const { node, parent, next } of this.original)
      parent.insertBefore(node, next?.parentNode === parent ? next : null);
  }
}
