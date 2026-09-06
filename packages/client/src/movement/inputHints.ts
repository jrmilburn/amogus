/** Input follows the last real device used, including tablets with a keyboard. */
export function touchInput() {
  return (
    document.documentElement.dataset.input === 'touch' ||
    (!document.documentElement.dataset.input &&
      matchMedia('(pointer: coarse)').matches)
  );
}
export function actionLabel(action: string, key: string) {
  return touchInput() ? action : `${action} (${key})`;
}
export function inputInstruction(touch: string, desktop: string) {
  return touchInput() ? touch : desktop;
}
export function installInputHints() {
  const events = new AbortController();
  const coarse = matchMedia('(pointer: coarse)');
  const set = (touch: boolean) => {
    document.documentElement.dataset.input = touch ? 'touch' : 'keyboard';
  };
  set(coarse.matches);
  document.addEventListener(
    'pointerdown',
    (event) => {
      if (event.pointerType) set(event.pointerType !== 'mouse');
    },
    { signal: events.signal, passive: true },
  );
  document.addEventListener(
    'keydown',
    (event) => {
      if (!event.metaKey && !event.ctrlKey && !event.altKey && !event.repeat)
        set(false);
    },
    { signal: events.signal },
  );
  coarse.addEventListener('change', () => set(coarse.matches), {
    signal: events.signal,
  });
  return () => events.abort();
}
