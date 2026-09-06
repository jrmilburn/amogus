import {
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  startRequirement,
} from '@mutiny/shared';

export type EntryMode = 'create' | 'join';

export function validCode(code: string) {
  return (
    code.length === ROOM_CODE_LENGTH &&
    [...code].every((letter) => ROOM_CODE_ALPHABET.includes(letter))
  );
}

/** The selected mode, never focus or submitter identity, owns submission. */
export function entryPresentation(
  mode: EntryMode,
  inviteCode?: string,
  busy = false,
) {
  const joining = mode === 'join';
  const showCode = joining && !inviteCode;
  return {
    joining,
    showCode,
    showInvite: joining && Boolean(inviteCode),
    codeDisabled: busy || !showCode,
    codeRequired: showCode,
    title: joining ? 'Join your crew.' : 'Bring your friends aboard.',
    help: joining
      ? inviteCode
        ? 'Your room is selected. Enter your name to join.'
        : 'Enter the code your host shared.'
      : 'Create a room, then share your invite link. Start when your crew arrives.',
    action: busy
      ? 'Connecting…'
      : joining
        ? inviteCode
          ? `Join ${inviteCode}`
          : 'Join game'
        : 'Create game',
  };
}

export function lobbyRequirement(
  players: readonly { connected: boolean }[],
  impostors: number,
) {
  return (
    startRequirement(players.length, impostors) ??
    (players.some((player) => !player.connected)
      ? 'Waiting for disconnected crew to reconnect.'
      : undefined)
  );
}
