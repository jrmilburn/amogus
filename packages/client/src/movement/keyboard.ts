const editable =
  'input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]';
const procedure = '.task-modal,.confirm-action,.vent-routes';
const scrollableHud =
  '.boarding-controls,.round-assignment,.station-minimap,.ghost-chat,.hud-feedback';

/** WASD stays available on passive HUD controls; arrows remain native inside scrollable panels. */
export function blocksMovement(target: EventTarget | null, code: string) {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(`${editable},${procedure}`) ||
    (code.startsWith('Arrow') && target.closest(scrollableHud)),
  );
}
export function blocksGameShortcut(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(target.closest(`${editable},${procedure}`))
  );
}
