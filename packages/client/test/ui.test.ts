import assert from 'node:assert/strict';
import { test } from 'node:test';
import { register } from 'node:module';
import { Window } from 'happy-dom';
import {
  GameState,
  Player,
  MeetingState,
  MeetingChat,
  type TaskAssignment,
} from '@mutiny/shared';
import type { WalkRoom } from '../src/movement/Walkaround.js';
import type { Renderer } from '../src/renderer/Renderer.js';
import type { CharacterAssets } from '../src/characters/assets.js';
import { MapDefSchema } from '@mutiny/shared/maps';
import mapData from '@mutiny/shared/maps/the-hollow.json' with { type: 'json' };
import {
  taskDestinations,
  minimapPoint,
} from '../src/preview/minimap-model.js';

register('./css-loader.mjs', import.meta.url);
const window = new Window({ url: 'http://localhost:5173' });
for (const name of [
  'document',
  'navigator',
  'HTMLElement',
  'HTMLParagraphElement',
  'HTMLCanvasElement',
  'Element',
  'MutationObserver',
  'ResizeObserver',
  'AbortController',
] as const)
  Object.defineProperty(globalThis, name, {
    configurable: true,
    value: window[name],
  });
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: window,
});
class Media extends window.EventTarget {
  matches = true;
  change(matches: boolean) {
    this.matches = matches;
    this.dispatchEvent(new window.Event('change'));
  }
}
const coarse = new Media();
const compact = new Media();
Object.defineProperty(globalThis, 'matchMedia', {
  configurable: true,
  value: (query: string) => (query === '(pointer: coarse)' ? coarse : compact),
});
const { confirmAction } = await import('../src/lobby/confirmAction.js');
const { MobileUX } = await import('../src/preview/MobileUX.js');
const { MeetingPanel } = await import('../src/meetings/MeetingPanel.js');
const { Minimap } = await import('../src/preview/Minimap.js');
const { BoardingLobby } = await import('../src/lobby/BoardingLobby.js');
const { installTouchGuard } = await import('../src/preview/touchGuard.js');
const doc = window.document as unknown as Document;
const tick = () => new Promise((resolve) => setTimeout(resolve, 10));

test('gesture guard cancels iOS zoom gestures without swallowing game taps or scrolling touches', () => {
  const cleanup = installTouchGuard(doc);
  for (const type of ['gesturestart', 'gesturechange']) {
    const event = new window.Event(type, { cancelable: true });
    doc.dispatchEvent(event as unknown as Event);
    assert.equal(event.defaultPrevented, true);
  }
  for (const type of ['touchstart', 'touchend', 'click', 'click']) {
    const event = new window.Event(type, { cancelable: true });
    doc.dispatchEvent(event as unknown as Event);
    assert.equal(event.defaultPrevented, false);
  }
  cleanup();
  const gesture = new window.Event('gesturestart', { cancelable: true });
  doc.dispatchEvent(gesture as unknown as Event);
  assert.equal(gesture.defaultPrevented, false);
});

test('boarding shows named readiness and reconnect status while preserving host start eligibility', () => {
  doc.body.innerHTML = '<div id="host"></div>';
  const state = new GameState();
  for (let i = 0; i < 4; i++) {
    const p = new Player();
    p.id = `p${i}`;
    p.name = `Player ${i}`;
    p.isHost = i === 0;
    p.ready = i < 2;
    state.players.set(p.id, p);
  }
  const room = {
    state,
    sessionId: 'p0',
    roomId: 'ABCDE',
    connection: { isOpen: true },
    onMessage: () => () => {},
  } as unknown as WalkRoom;
  const host = doc.querySelector<HTMLElement>('#host')!;
  const lobby = new BoardingLobby(host, room);
  try {
    assert.equal(
      host.querySelector('.boarding-code')!.textContent,
      'Room ABCDE',
    );
    assert.match(
      host.querySelector('summary')!.textContent!,
      /4\/10 aboard · 2\/4 ready/,
    );
    assert.equal(host.querySelectorAll('li').length, 4);
    assert.equal(
      host.querySelector<HTMLButtonElement>('[data-start]')!.disabled,
      false,
    );
    state.players.get('p1')!.connected = false;
    lobby.frame();
    assert.match(host.querySelector('ul')!.textContent!, /Reconnecting/);
    assert.equal(
      host.querySelector<HTMLButtonElement>('[data-start]')!.disabled,
      true,
    );
    state.players.get('p1')!.connected = true;
    state.players.get('p1')!.ready = false;
    lobby.frame();
    assert.match(host.querySelector('summary')!.textContent!, /1\/4 ready/);
  } finally {
    lobby.destroy();
  }
});

test('leaving/resetting requires confirmation; cancel and Escape preserve the room and restore focus', () => {
  doc.body.innerHTML = '<button id="trigger">End round</button>';
  const trigger = doc.querySelector<HTMLButtonElement>('button')!;
  trigger.focus();
  let actions = 0;
  const open = () =>
    confirmAction(
      doc.body,
      'End round?',
      'Progress will be lost.',
      'End round',
      () => actions++,
    );
  open();
  assert.equal(doc.activeElement?.textContent, 'Keep playing');
  doc.querySelector<HTMLButtonElement>('.confirm-action .secondary')!.click();
  assert.equal(actions, 0);
  assert.equal(doc.activeElement, trigger);
  open();
  const cancel = new window.Event('cancel', {
    bubbles: true,
    cancelable: true,
  });
  doc.querySelector('dialog')!.dispatchEvent(cancel as unknown as Event);
  assert.ok(cancel.defaultPrevented);
  assert.equal(actions, 0);
  assert.equal(doc.querySelector('dialog'), null);
  open();
  doc
    .querySelector<HTMLButtonElement>('.confirm-action button:last-child')!
    .click();
  assert.equal(actions, 1);
  assert.equal(doc.querySelector('dialog'), null);
});

test('touch feedback survives compact landscape, dismisses, and restores its original owners on input change', async () => {
  doc.body.innerHTML =
    '<div id="host"><details class="station-minimap"><summary>Map</summary></details><details class="round-assignment"><summary>Tasks</summary></details><div class="task-actions"><p role="status"></p><button>Use</button><div class="impostor-actions"><p role="status"></p><button>Kill</button></div></div><div class="meeting-actions"><p role="status"></p></div><div class="sabotage-actions"><p role="status"></p></div></div>';
  const host = doc.querySelector<HTMLElement>('#host')!;
  const message =
    host.querySelector<HTMLParagraphElement>('.task-actions > p')!;
  const owner = message.parentElement!;
  coarse.matches = compact.matches = true;
  const ux = new MobileUX(host);
  try {
    assert.equal(message.parentElement?.className, 'hud-feedback');
    message.textContent = 'Station did not respond. Try again.';
    await tick();
    assert.equal(
      host.querySelector<HTMLElement>('.hud-feedback')!.hidden,
      false,
    );
    assert.ok(message.classList.contains('is-latest'));
    host.querySelector<HTMLButtonElement>('.hud-feedback button')!.click();
    assert.equal(
      host.querySelector<HTMLElement>('.hud-feedback')!.hidden,
      true,
    );
    message.textContent = 'Task complete · 1 remaining.';
    await tick();
    assert.equal(
      host.querySelector<HTMLElement>('.hud-feedback')!.hidden,
      false,
    );
    const map = host.querySelector<HTMLDetailsElement>('.station-minimap')!;
    const tasks = host.querySelector<HTMLDetailsElement>('.round-assignment')!;
    tasks.open = true;
    await tick();
    map.open = true;
    await tick();
    assert.equal(tasks.open, false);
    coarse.change(false);
    assert.equal(message.parentElement, owner);
    ux.frame(false);
    assert.equal(
      host.querySelector<HTMLElement>('.hud-feedback')!.hidden,
      true,
    );
  } finally {
    ux.destroy();
  }
  assert.equal(host.querySelector('.hud-feedback'), null);
  assert.equal(host.querySelector('.touch-actions'), null);
});

test('ten-player meetings prioritize chat then voting, keep drafts and require explicit confirmation', () => {
  doc.body.innerHTML =
    '<dialog open><div class="meeting-caller"></div></dialog>';
  const dialog = doc.querySelector('dialog')!;
  const state = new GameState();
  state.phase = 'meeting';
  state.roundId = 1;
  state.meeting = new MeetingState();
  state.meeting.id = 2;
  for (let i = 0; i < 10; i++) {
    const p = new Player();
    p.id = `p${i}`;
    p.name = `Player ${i}`;
    state.players.set(p.id, p);
  }
  const sent: [string, unknown][] = [];
  const room = {
    state,
    sessionId: 'p0',
    send: (type: string, payload: unknown) => sent.push([type, payload]),
    onMessage: () => () => {},
  } as unknown as WalkRoom;
  const panel = new MeetingPanel(
    dialog,
    room,
    {} as Renderer,
    {} as CharacterAssets,
  );
  try {
    const root = dialog.querySelector<HTMLElement>('.meeting-panel')!;
    assert.equal(root.dataset.view, 'chat');
    assert.equal(dialog.querySelectorAll('.meeting-player').length, 10);
    const input = dialog.querySelector('input')!;
    input.value = 'I saw';
    input.focus();
    state.phase = 'voting';
    panel.frame();
    assert.equal(
      root.dataset.view,
      'chat',
      'timer must not hide a draft being typed',
    );
    dialog
      .querySelector<HTMLButtonElement>('button[data-view="vote"]')!
      .click();
    assert.equal(root.dataset.view, 'vote');
    assert.equal(input.value, 'I saw');
    dialog.querySelector<HTMLButtonElement>('.meeting-player')!.click();
    assert.equal(sent.length, 0, 'selecting a player does not send a ballot');
    const message = new MeetingChat();
    message.id = 1;
    message.name = 'Player 2';
    message.text = 'Where?';
    state.meeting.chat.push(message);
    panel.frame();
    assert.match(
      dialog.querySelector('button[data-view="chat"]')!.textContent!,
      /1 new/,
    );
    dialog.querySelector<HTMLButtonElement>('[data-confirm]')!.click();
    assert.deepEqual(sent[0], [
      'vote',
      { roundId: 1, meetingId: 2, targetId: 'p0' },
    ]);
    dialog
      .querySelector<HTMLButtonElement>('button[data-view="chat"]')!
      .click();
    assert.equal(
      dialog.querySelector('button[data-view="chat"]')!.textContent,
      'Chat',
    );
  } finally {
    panel.destroy();
  }
});

test('private task markers follow long-task stages, omit completed tasks, and clear when assignments are hidden', () => {
  const map = MapDefSchema.parse(mapData);
  const first = map.tasks.find((task) => task.nextTaskId)!;
  const next = map.tasks.find((task) => task.id === first.nextTaskId)!;
  const task: TaskAssignment = {
    id: first.id,
    type: first.type,
    length: first.length,
    room: first.room,
    steps: 2,
    step: 1,
    completed: false,
  };
  assert.deepEqual(
    taskDestinations(map, [task])[0]!.point,
    minimapPoint(map, first),
  );
  task.step = 2;
  task.room = next.room;
  assert.deepEqual(
    taskDestinations(map, [task])[0]!.point,
    minimapPoint(map, next),
  );
  assert.deepEqual(taskDestinations(map, [{ ...task, completed: true }]), []);
  doc.body.innerHTML =
    '<dialog><header class="map-toolbar"><div></div></header></dialog>';
  const dialog = doc.querySelector('dialog')!;
  const minimap = new Minimap(dialog, map);
  try {
    minimap.setTasks([task]);
    minimap.track(task.id);
    assert.match(
      dialog.querySelector('.minimap-task-legend')!.textContent!,
      /White diamond/,
    );
    minimap.setTasks([]);
    assert.equal(dialog.querySelectorAll('svg path').length, 0);
    assert.equal(
      dialog.querySelector<HTMLElement>('.minimap-task-legend')!.hidden,
      true,
    );
  } finally {
    minimap.destroy();
  }
});
