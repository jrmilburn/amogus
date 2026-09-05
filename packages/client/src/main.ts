import { Client, type Room } from '@colyseus/sdk';
import {
  GAME_ROOM,
  GameState,
  COLORS,
  CLIENT_MESSAGES,
  SERVER_MESSAGES,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  MAX_PLAYERS,
  sanitizeName,
  startRequirement,
  type ClientMessages,
  type ServerMessages,
  type ColorId,
} from '@mutiny/shared';
import { colorPicker, element, settingsControls } from './lobby/controls';
import './style.css';

type LobbyRoom = Room<unknown, GameState>;
const status = element<HTMLParagraphElement>('#status');
const entryForm = element<HTMLFormElement>('#entry-form');
const entryName = element<HTMLInputElement>('#entry-name');
const profileName = element<HTMLInputElement>('#profile-name');
const codeInput = element<HTMLInputElement>('#join-code');
const joinButton = element<HTMLButtonElement>('#join');
const readyButton = element<HTMLButtonElement>('#ready');
const startButton = element<HTMLButtonElement>('#start');
if (matchMedia('(max-width: 600px)').matches) {
  element<HTMLDetailsElement>('#settings-panel').open = false;
}
const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
const client = new Client(`${protocol}//${location.host}/ws`);
let room: LobbyRoom | undefined;
let selectedColor: ColorId = 'coral';
let busy = false;
let inviteCode: string | undefined;
let lastRoster = '';

function announce(message: string, error = false) {
  status.textContent = message;
  status.classList.toggle('error', error);
}
function send<K extends keyof ClientMessages>(
  type: K,
  payload: ClientMessages[K],
) {
  room?.send(type, payload);
}

const updateEntryColors = colorPicker(
  element('#entry-colors .color-picker'),
  (color) => {
    selectedColor = color;
    updateEntryColors(color);
  },
);
updateEntryColors(selectedColor);
const updateLobbyColors = colorPicker(
  element('#lobby-colors .color-picker'),
  (color) => {
    send(CLIENT_MESSAGES.updateProfile, { color });
  },
);
const updateSettings = settingsControls(element('#settings-grid'), (patch) => {
  send(CLIENT_MESSAGES.updateSettings, patch);
});

function validCode(code: string) {
  return (
    code.length === ROOM_CODE_LENGTH &&
    [...code].every((letter) => ROOM_CODE_ALPHABET.includes(letter))
  );
}
function showInvite(code?: string) {
  inviteCode = code;
  codeInput.hidden = Boolean(code);
  element('#code-label').hidden = Boolean(code);
  element('#change-code').hidden = !code;
  element('#join-title').textContent = code
    ? `You've been invited to ${code}`
    : 'Have a room code?';
  joinButton.textContent = code ? `Join ${code}` : 'Join game';
  element('#create').hidden = Boolean(code);
}
const queryCode = new URL(location.href).searchParams
  .get('code')
  ?.trim()
  .toUpperCase();
if (queryCode && validCode(queryCode)) showInvite(queryCode);
else if (queryCode)
  announce('That invite code is invalid. Ask the host for a new link.', true);
element('#change-code').addEventListener('click', () => {
  showInvite();
  codeInput.focus();
});
codeInput.addEventListener('input', () => {
  codeInput.value = codeInput.value.toUpperCase().replace(/\s/g, '');
});

function setBusy(value: boolean) {
  busy = value;
  entryForm.setAttribute('aria-busy', String(value));
  for (const control of entryForm.querySelectorAll<
    HTMLInputElement | HTMLButtonElement
  >('input, button'))
    control.disabled = value;
  updateEntryColors(selectedColor, new Set(), value);
  element('#create').textContent = value ? 'Connecting…' : 'Create game';
  joinButton.textContent = value
    ? 'Connecting…'
    : inviteCode
      ? `Join ${inviteCode}`
      : 'Join game';
}
function joinError(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (/locked|full|seat reservation/i.test(message))
    return 'This room is full or has already started. Ask the host to invite you next round.';
  if (/not found|invalid room|not defined/i.test(message))
    return 'Room not found. Check the five-letter code with your host.';
  if (/name|colour|started/i.test(message)) return message;
  return 'Could not reach the station. Check your connection and try again.';
}

entryForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (busy) return;
  const joining =
    inviteCode !== undefined ||
    (event.submitter as HTMLButtonElement | null)?.value === 'join' ||
    document.activeElement === codeInput;
  void enter(joining);
});
async function enter(joining: boolean) {
  let name: string;
  try {
    name = sanitizeName(entryName.value);
  } catch (error) {
    announce((error as Error).message, true);
    entryName.focus();
    return;
  }
  const code = inviteCode ?? codeInput.value.trim().toUpperCase();
  if (joining && !validCode(code)) {
    announce(
      'Enter a five-letter room code. Codes do not contain I or O.',
      true,
    );
    codeInput.focus();
    return;
  }
  setBusy(true);
  announce('Connecting to your crew…');
  try {
    const options = { name, color: selectedColor };
    const joined: LobbyRoom = joining
      ? await client.joinById<GameState>(code, options, GameState)
      : await client.create<GameState>(GAME_ROOM, options, GameState);
    room = joined;
    // Refresh-to-reconnect arrives in #22; do not imply it already works.
    joined.reconnection.enabled = false;
    console.info('Connected to Mutiny. Session ID:', joined.sessionId);
    joined.onMessage<ServerMessages['error']>(
      SERVER_MESSAGES.error,
      (payload) => {
        announce(payload.message, true);
        if (room?.state) updateSettings(room.state.settings, true);
      },
    );
    joined.onStateChange(() => {
      if (room === joined) render();
    });
    joined.onLeave(() => {
      if (room !== joined) return;
      room = undefined;
      showLanding();
      showInvite(joined.roomId);
      announce(
        'Connection closed. Join again to return to the room if it is still open.',
        true,
      );
    });
    joined.onError(() =>
      announce(
        'The connection was interrupted. Leave and rejoin if it does not recover.',
        true,
      ),
    );
    const url = new URL(location.href);
    url.searchParams.set('code', joined.roomId);
    history.replaceState(null, '', url);
    element('#landing').hidden = true;
    element('#lobby').hidden = false;
    profileName.value = name;
    lastRoster = '';
    announce('Connected. Invite your friends to join.');
    render();
    element('#copy-link').focus();
  } catch (error) {
    announce(joinError(error), true);
  } finally {
    setBusy(false);
  }
}

function render() {
  if (!room?.state?.players) return;
  const { state, sessionId } = room;
  const own = state.players.get(sessionId);
  if (!own) return;
  const inLobby = state.phase === 'lobby';
  const players = [...state.players.values()];
  element('#room-code').textContent = state.code;
  element('#player-count').textContent = `${players.length} / ${MAX_PLAYERS}`;
  const roster = JSON.stringify(
    players.map((player) => [
      player.id,
      player.name,
      player.color,
      player.ready,
      player.isHost,
    ]),
  );
  if (roster !== lastRoster) {
    const list = element('#players');
    list.replaceChildren(
      ...players.map((player) => {
        const row = document.createElement('li');
        const color = COLORS.find((color) => color.id === player.color)!;
        const swatch = document.createElement('span');
        swatch.className = 'swatch';
        swatch.style.setProperty('--swatch', color.hex);
        const number = document.createElement('span');
        number.className = 'swatch-number';
        number.textContent = String(color.number);
        swatch.append(number);
        swatch.setAttribute('aria-hidden', 'true');
        const identity = document.createElement('div');
        const name = document.createElement('strong');
        name.textContent = `${player.name}${player.id === sessionId ? ' (you)' : ''}`;
        const detail = document.createElement('span');
        detail.className = 'player-detail';
        detail.textContent = `${color.name}${player.isHost ? ' · Host' : ''}`;
        identity.append(name, detail);
        const readiness = document.createElement('span');
        readiness.className = player.ready ? 'readiness is-ready' : 'readiness';
        readiness.textContent = player.ready ? 'Ready' : 'Not ready';
        row.append(swatch, identity, readiness);
        return row;
      }),
    );
    lastRoster = roster;
  }
  if (document.activeElement !== profileName) profileName.value = own.name;
  selectedColor = own.color;
  updateLobbyColors(
    own.color,
    new Set(players.filter((p) => p.id !== sessionId).map((p) => p.color)),
    !inLobby,
  );
  profileName.disabled = !inLobby;
  element<HTMLButtonElement>('#save-name').disabled = !inLobby;
  readyButton.disabled = !inLobby;
  readyButton.textContent = own.ready ? 'Mark not ready' : 'Mark ready';
  readyButton.setAttribute('aria-pressed', String(own.ready));
  updateSettings(state.settings);
  element<HTMLFieldSetElement>('#settings-fields').disabled =
    !own.isHost || !inLobby;
  element('#settings-owner').textContent = own.isHost
    ? 'You are the host'
    : 'Only the host can change these';
  const requirement = startRequirement(
    players.length,
    state.settings.impostors,
  );
  startButton.hidden = !own.isHost;
  startButton.disabled = !inLobby || Boolean(requirement);
  element('#launch-title').textContent = !inLobby
    ? 'Room started'
    : requirement
      ? 'Waiting for crew'
      : 'Ready to depart';
  element('#launch-help').textContent = !inLobby
    ? 'Return to the lobby to edit your room.'
    : (requirement ??
      `${players.filter((p) => p.ready).length} of ${players.length} marked ready. ${own.isHost ? 'You can start when your crew is ready.' : 'The host will start the game.'}`);
  element('#starting').hidden = inLobby;
  element('#cancel-start').hidden = !own.isHost;
  element('#wait-host').hidden = own.isHost;
}

function showLanding() {
  element('#lobby').hidden = true;
  element('#landing').hidden = false;
  element('#copy-fallback').hidden = true;
  entryName.value = profileName.value;
  updateEntryColors(selectedColor);
  entryName.focus();
}
element('#leave').addEventListener('click', () => {
  const previous = room;
  room = undefined;
  void previous?.leave();
  const url = new URL(location.href);
  url.searchParams.delete('code');
  history.replaceState(null, '', url);
  showInvite();
  showLanding();
  announce('You left the room.');
});
element<HTMLFormElement>('#profile-form').addEventListener(
  'submit',
  (event) => {
    event.preventDefault();
    try {
      send(CLIENT_MESSAGES.updateProfile, {
        name: (profileName.value = sanitizeName(profileName.value)),
      });
      profileName.blur();
    } catch (error) {
      announce((error as Error).message, true);
    }
  },
);
readyButton.addEventListener('click', () => {
  const own = room?.state.players.get(room.sessionId);
  if (own) send(CLIENT_MESSAGES.ready, { ready: !own.ready });
});
startButton.addEventListener('click', () => send(CLIENT_MESSAGES.start, {}));
element('#cancel-start').addEventListener('click', () =>
  send(CLIENT_MESSAGES.cancelStart, {}),
);
element('#copy-link').addEventListener('click', () => {
  void copyInvite();
});
async function copyInvite() {
  if (!room) return;
  const url = new URL(location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('code', room.roomId);
  try {
    await navigator.clipboard.writeText(url.href);
    announce('Invite link copied. Send it to your crew.');
  } catch {
    element('#copy-fallback').hidden = false;
    const input = element<HTMLInputElement>('#invite-link');
    input.value = url.href;
    input.focus();
    input.select();
    announce('Select and copy the invite link below.');
  }
}

let openingMap = false;
async function showMap(trigger?: HTMLButtonElement) {
  if (openingMap || document.querySelector('.map-preview')) return;
  openingMap = true;
  if (trigger) trigger.disabled = true;
  try {
    const { openMapPreview } = await import('./preview/MapPreview');
    await openMapPreview(trigger);
  } catch (error) {
    console.error('Could not load map preview:', error);
    announce(
      'Could not load the map preview. Check your connection and try again.',
      true,
    );
  } finally {
    openingMap = false;
    if (trigger) trigger.disabled = false;
  }
}
for (const button of document.querySelectorAll<HTMLButtonElement>(
  '[data-open-map]',
)) {
  button.addEventListener('click', () => {
    void showMap(button);
  });
}
if (new URL(location.href).searchParams.get('view') === 'map') void showMap();
