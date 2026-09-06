import { Client, type Room } from '@colyseus/sdk';
import {
  GAME_ROOM,
  GameState,
  COLORS,
  CLIENT_MESSAGES,
  SERVER_MESSAGES,
  MAX_PLAYERS,
  sanitizeName,
  type ClientMessages,
  type ServerMessages,
  type ColorId,
} from '@mutiny/shared';
import { colorPicker, element, settingsControls } from './lobby/controls';
import {
  entryPresentation,
  lobbyRequirement,
  validCode,
  type EntryMode,
} from './lobby/entry';
import { RoundInfo } from './round/RoundInfo';
import './style.css';

type LobbyRoom = Room<unknown, GameState>;
const status = element<HTMLParagraphElement>('#status');
const entryForm = element<HTMLFormElement>('#entry-form');
const entryName = element<HTMLInputElement>('#entry-name');
const profileName = element<HTMLInputElement>('#profile-name');
const codeInput = element<HTMLInputElement>('#join-code');
const entryButton = element<HTMLButtonElement>('#entry-submit');
const readyButton = element<HTMLButtonElement>('#ready');
const startButton = element<HTMLButtonElement>('#start');
const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
const client = new Client(`${protocol}//${location.host}/ws`);
let room: LobbyRoom | undefined;
let selectedColor: ColorId = 'coral';
let busy = false;
let inviteCode: string | undefined;
let entryMode: EntryMode = 'create';
let lastRoster = '';
let knowledge = new RoundInfo();
let openedRound = 0;

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

function showInvite(code?: string) {
  inviteCode = code;
  entryMode = code ? 'join' : 'create';
  renderEntry();
}
function renderEntry() {
  const view = entryPresentation(entryMode, inviteCode, busy);
  element('#mode-create').setAttribute('aria-pressed', String(!view.joining));
  element('#mode-join').setAttribute('aria-pressed', String(view.joining));
  element('#code-field').hidden = !view.showCode;
  codeInput.disabled = view.codeDisabled;
  codeInput.required = view.codeRequired;
  element('#invite-preview').hidden = !view.showInvite;
  element('#invite-code').textContent = inviteCode ?? '';
  element('#entry-title').textContent = view.title;
  element('#entry-help').textContent = view.help;
  entryButton.textContent = view.action;
}
for (const mode of ['create', 'join'] as const) {
  element(`#mode-${mode}`).addEventListener('click', () => {
    if (busy) return;
    entryMode = mode;
    announce('');
    renderEntry();
  });
}
const queryCode = new URL(location.href).searchParams
  .get('code')
  ?.trim()
  .toUpperCase();
if (queryCode && validCode(queryCode)) showInvite(queryCode);
else if (queryCode) {
  entryMode = 'join';
  renderEntry();
  announce('That invite code is invalid. Ask the host for a new link.', true);
}
element('#change-code').addEventListener('click', () => {
  inviteCode = undefined;
  entryMode = 'join';
  renderEntry();
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
  renderEntry();
}
function joinError(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (/server full/i.test(message))
    return 'The station server is full. Try again after another room closes.';
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
  void enter(entryMode === 'join');
});
async function enter(joining: boolean, reconnectToken?: string) {
  let name: string;
  try {
    name = reconnectToken ? 'Reconnecting' : sanitizeName(entryName.value);
  } catch (error) {
    announce((error as Error).message, true);
    entryName.focus();
    return;
  }
  const code = inviteCode ?? codeInput.value.trim().toUpperCase();
  if (!reconnectToken && joining && !validCode(code)) {
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
    const joined: LobbyRoom = reconnectToken
      ? await client.reconnect<GameState>(reconnectToken, GameState)
      : joining
        ? await client.joinById<GameState>(code, options, GameState)
        : await client.create<GameState>(GAME_ROOM, options, GameState);
    room = joined;
    knowledge = new RoundInfo();
    openedRound = 0;
    const joinedKnowledge = knowledge;
    joined.onMessage<ServerMessages['roleReveal']>(
      SERVER_MESSAGES.roleReveal,
      (payload) => {
        if (room === joined)
          joinedKnowledge.reveal(
            payload,
            joined.state.phase,
            joined.state.roundId,
          );
      },
    );
    joined.onMessage<ServerMessages['taskList']>(
      SERVER_MESSAGES.taskList,
      (payload) => {
        if (room === joined)
          joinedKnowledge.assign(
            payload,
            joined.state.phase,
            joined.state.roundId,
          );
      },
    );
    joined.onMessage<ServerMessages['impostorStatus']>(
      SERVER_MESSAGES.impostorStatus,
      (payload) => {
        if (room === joined)
          joinedKnowledge.actionStatus(
            payload,
            joined.state.phase,
            joined.state.roundId,
          );
      },
    );
    joined.onMessage<ServerMessages['killed']>(
      SERVER_MESSAGES.killed,
      (payload) => {
        if (room === joined)
          joinedKnowledge.killed(
            payload,
            joined.state.phase,
            joined.state.roundId,
          );
      },
    );
    joined.onMessage<ServerMessages['voteResult']>(
      SERVER_MESSAGES.voteResult,
      (payload) => {
        if (
          room !== joined ||
          payload.roundId !== joined.state.roundId ||
          payload.meetingId !== joined.state.meeting?.id
        )
          return;
        announce(
          payload.ejectedId
            ? `${payload.ejectedName} was ejected.`
            : 'No one was ejected.',
        );
        void showMap();
      },
    );
    joined.onMessage<ServerMessages['meetingStart']>(
      SERVER_MESSAGES.meetingStart,
      (payload) => {
        if (
          room !== joined ||
          payload.roundId !== joined.state.roundId ||
          payload.meetingId !== joined.state.meeting?.id ||
          !['meeting', 'voting'].includes(joined.state.phase)
        )
          return;
        announce(
          payload.reason === 'report'
            ? 'Dead body reported. Everyone has returned to Commons.'
            : 'Emergency meeting. Everyone has returned to Commons.',
        );
        void showMap();
      },
    );
    joined.onMessage<ServerMessages['gameOver']>(
      SERVER_MESSAGES.gameOver,
      (payload) => {
        if (room === joined && payload.roundId === joined.state.roundId) {
          announce(
            `${payload.winner === 'crew' ? 'Crew' : 'Impostors'} win. Open the station for the result and revealed teams.`,
          );
          void showMap();
        }
      },
    );
    joined.onMessage<ServerMessages['ghostHistory']>(
      SERVER_MESSAGES.ghostHistory,
      (payload) => {
        if (
          room === joined &&
          payload.roundId === joined.state.roundId &&
          !joined.state.players.get(joined.sessionId)?.alive
        )
          joinedKnowledge.ghostMessages = payload.messages;
      },
    );
    joined.reconnection.enabled = true;
    joined.onDrop(() =>
      announce(
        'Connection interrupted. Reconnecting for up to 30 seconds…',
        true,
      ),
    );
    joined.onReconnect(() => {
      const url = new URL(location.href);
      url.hash = new URLSearchParams({
        reconnect: joined.reconnectionToken,
      }).toString();
      history.replaceState(null, '', url);
      announce('Reconnected to your crew.');
    });
    joined.onMessage<ServerMessages['error']>(
      SERVER_MESSAGES.error,
      (payload) => {
        announce(payload.message, true);
        if (room?.state) updateSettings(room.state.settings, true);
      },
    );
    joined.onStateChange(() => {
      if (joined.state.phase === 'lobby') {
        joinedKnowledge.clear();
      }
      if (room === joined) {
        render();
        if (
          joined.state.phase !== 'lobby' &&
          openedRound !== joined.state.roundId
        ) {
          openedRound = joined.state.roundId;
          void showMap();
        }
      }
    });
    joined.onLeave(() => {
      if (room !== joined) return;
      room = undefined;
      const url = new URL(location.href);
      url.hash = '';
      history.replaceState(null, '', url);
      joinedKnowledge.clear();
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
    url.hash = new URLSearchParams({
      reconnect: joined.reconnectionToken,
    }).toString();
    history.replaceState(null, '', url);
    element('#landing').hidden = true;
    element('#lobby').hidden = false;
    profileName.value = name;
    lastRoster = '';
    announce('Connected. Invite your friends to join.');
    render();
    element('#copy-link').focus();
  } catch (error) {
    if (reconnectToken) {
      const url = new URL(location.href);
      url.hash = '';
      history.replaceState(null, '', url);
      announce(
        'The reconnect window expired or the room closed. Join again for the next round.',
        true,
      );
    } else announce(joinError(error), true);
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
      player.connected,
    ]),
  );
  if (roster !== lastRoster) {
    const list = element('#players');
    list.replaceChildren(
      ...players.map((player) => {
        const row = document.createElement('li');
        row.classList.toggle('is-disconnected', !player.connected);
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
        readiness.textContent = !player.connected
          ? 'Reconnecting'
          : player.ready
            ? 'Ready'
            : 'Not ready';
        row.append(swatch, identity, readiness);
        return row;
      }),
    );
    lastRoster = roster;
  }
  if (document.activeElement !== profileName) profileName.value = own.name;
  selectedColor = own.color;
  element('#profile-summary').textContent =
    `${own.name} · ${COLORS.find((color) => color.id === own.color)!.name}`;
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
  const requirement = lobbyRequirement(players, state.settings.impostors);
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
  element('#round-title').textContent =
    state.phase === 'ended'
      ? state.winner === 'crew'
        ? 'Crew win'
        : 'Impostors win'
      : ['meeting', 'voting', 'ejection'].includes(state.phase)
        ? state.phase === 'ejection'
          ? 'Vote result'
          : 'Meeting in progress'
        : state.phase === 'starting'
          ? 'Revealing roles'
          : 'Round in progress';
  element('#round-help').textContent =
    state.phase === 'ended'
      ? 'Open the station for the result and revealed teams. The host can play again.'
      : ['meeting', 'voting', 'ejection'].includes(state.phase)
        ? 'Open the station to discuss, vote, or see the result. The round resumes automatically after the tally.'
        : 'Enter the station to complete tasks, watch for impostors, and repair sabotaged systems.';
  element<HTMLButtonElement>('#lobby [data-open-map]').textContent = inLobby
    ? 'Walk around'
    : 'Enter station';
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
  knowledge.clear();
  void previous?.leave();
  const url = new URL(location.href);
  url.searchParams.delete('code');
  url.hash = '';
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
    const mapRoom = room;
    const mapKnowledge = knowledge;
    const { openMapPreview } = await import('./preview/MapPreview');
    if (room !== mapRoom) return;
    await openMapPreview(trigger, mapRoom, mapKnowledge);
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
if (
  ['map', 'characters'].includes(
    new URL(location.href).searchParams.get('view') ?? '',
  )
)
  void showMap();
const reconnectToken = new URLSearchParams(location.hash.slice(1)).get(
  'reconnect',
);
if (reconnectToken) void enter(true, reconnectToken);
