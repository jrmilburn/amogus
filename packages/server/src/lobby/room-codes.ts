import { randomInt } from 'node:crypto';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@mutiny/shared';

// The locked architecture runs one server process. Reservation is synchronous so
// concurrent onCreate calls cannot claim the same code before matchmaking saves it.
const reserved = new Set<string>();
export function reserveRoomCode(): string {
  for (let attempt = 0; attempt < 100; attempt++) {
    let code = '';
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
      code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
    }
    if (!reserved.has(code)) {
      reserved.add(code);
      return code;
    }
  }
  throw new Error('Unable to create a room code. Try again.');
}
export function releaseRoomCode(code: string) {
  reserved.delete(code);
}
