export const TICK_RATE = 20;
export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 10;
export const PLACEHOLDER_ROOM = 'placeholder';
export const GAME_ROOM = 'mutiny';
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const ROOM_CODE_LENGTH = 5;
export const MAP_IDS = ['the-hollow'] as const;
export type MapId = (typeof MAP_IDS)[number];

// Names and stable numbers accompany swatches; hue is never the only identifier.
export const COLORS = [
  { id: 'coral', name: 'Coral', hex: '#EE6677', number: 1 },
  { id: 'blue', name: 'Blue', hex: '#4477AA', number: 2 },
  { id: 'gold', name: 'Gold', hex: '#DDAA33', number: 3 },
  { id: 'green', name: 'Green', hex: '#228833', number: 4 },
  { id: 'cyan', name: 'Cyan', hex: '#66CCEE', number: 5 },
  { id: 'plum', name: 'Plum', hex: '#AA3377', number: 6 },
  { id: 'ivory', name: 'Ivory', hex: '#EEEECC', number: 7 },
  { id: 'slate', name: 'Slate', hex: '#8899AA', number: 8 },
  { id: 'orange', name: 'Orange', hex: '#EE7733', number: 9 },
  { id: 'mint', name: 'Mint', hex: '#99DDCC', number: 10 },
  { id: 'lilac', name: 'Lilac', hex: '#BB99DD', number: 11 },
  { id: 'olive', name: 'Olive', hex: '#AAAA44', number: 12 },
] as const;
export type ColorId = (typeof COLORS)[number]['id'];
export function isColorId(value: unknown): value is ColorId {
  return COLORS.some((color) => color.id === value);
}
