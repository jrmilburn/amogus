/** Keep repeated game taps and iOS pinch gestures from changing the viewport.
 * Single-finger scrolling, native clicks and independent joystick/action touches remain native.
 */
export function installTouchGuard(target: Document) {
  const events = new AbortController();
  const prevent = (event: Event) => event.preventDefault();
  for (const name of ['gesturestart', 'gesturechange'])
    target.addEventListener(name, prevent, {
      passive: false,
      signal: events.signal,
    });
  // touch-action handles double taps without canceling either click.
  // iOS ignores viewport scaling limits; its gesture events handle pinch above.
  return () => events.abort();
}
