import mapData from '@mutiny/shared/maps/the-hollow.json';
import { BOARDING_MAP, type TaskAssignment } from '@mutiny/shared';
import { BoardingLobby } from '../lobby/BoardingLobby';
import { MapDefSchema } from '@mutiny/shared/maps';
import { loadStationAssets } from '../renderer/assets';
import { Renderer } from '../renderer/Renderer';
import { letterbox } from '../renderer/Camera';
import { Walkaround, type WalkRoom } from '../movement/Walkaround';
import { loadCharacterAssets } from '../characters/assets';
import {
  CHARACTER_ANIMATIONS,
  type CharacterAnimation,
} from '../characters/animations';
import { CharacterRehearsal } from '../characters/CharacterRehearsal';
import { RoundInfo } from '../round/RoundInfo';
import { RoundOverlay } from '../round/RoundOverlay';
import { TaskController } from '../tasks/TaskController';
import { ImpostorController } from '../round/ImpostorController';
import { Minimap } from './Minimap';
import { SabotageController } from '../sabotage/SabotageController';
import { MeetingController } from '../meetings/MeetingController';
import './preview.css';
import { Afterlife } from '../round/Afterlife';
import { GameAudio } from '../audio/GameAudio';
import { GamePolish } from './GamePolish';
import { MobileUX } from './MobileUX';
import '../audio/audio.css';
const noTasks: readonly TaskAssignment[] = [];

export async function openMapPreview(
  trigger?: HTMLButtonElement,
  room?: WalkRoom,
  knowledge = new RoundInfo(),
) {
  const boarding = room?.state.phase === 'lobby';
  const map = boarding ? BOARDING_MAP : MapDefSchema.parse(mapData);
  const rehearsing =
    !room &&
    new URL(window.location.href).searchParams.get('view') === 'characters';
  const dialog = document.createElement('dialog');
  dialog.className = 'map-preview';
  dialog.setAttribute('aria-label', 'Explore The Hollow');
  dialog.innerHTML = `<div class="map-canvas"></div><header class="map-toolbar"><div><h2>The Hollow</h2><p class="map-location" role="status">Commons</p></div><button class="map-close secondary" type="button">Back</button></header><div class="map-loading" role="status"><h3>Opening the station</h3><p>Preparing the map and its fixtures…</p><progress max="1" value="0" aria-label="Map loading progress"></progress><button class="map-retry" type="button" hidden>Try again</button></div><footer class="map-controls"><div class="map-room-field"><label for="map-room-select">Go to room</label><select id="map-room-select"></select></div><div class="map-instructions"><strong>Map preview</strong><p>Drag or use arrow keys to look around.</p><p class="portrait-hint">Turn your phone for a wider view.</p></div><button class="map-home secondary" type="button">Find Commons</button></footer>`;
  if (boarding) {
    dialog.classList.add('is-boarding');
    dialog.querySelector('h2')!.textContent = 'Boarding room';
    dialog.querySelector('.map-close')!.textContent = 'Room options';
  }
  document.body.append(dialog);
  const select = dialog.querySelector<HTMLSelectElement>('select')!;
  for (const room of map.rooms) {
    const option = document.createElement('option');
    option.value = room.id;
    option.textContent = room.name;
    select.append(option);
  }
  select.value = 'commons';
  if (rehearsing) {
    dialog.setAttribute('aria-label', 'Engineer character rehearsal');
    dialog.querySelector('h2')!.textContent = 'Meet the engineers';
    dialog.querySelector('.map-room-field label')!.textContent = 'Animation';
    dialog.querySelector('.map-instructions strong')!.textContent =
      'Character rehearsal';
    dialog.querySelector('.map-instructions p')!.textContent =
      'Twelve colours. Drag or use arrows to inspect.';
    dialog.querySelector('.map-home')!.textContent = 'Replay animation';
    const labels = {
      idle: 'Idle',
      walk: 'Walk',
      ventEnter: 'Enter vent',
      ventExit: 'Exit vent',
      killed: 'Defeat',
      ghost: 'Ghost',
      body: 'Body',
    };
    select.replaceChildren(
      ...(Object.keys(CHARACTER_ANIMATIONS) as CharacterAnimation[]).map(
        (key) => {
          const option = document.createElement('option');
          option.value = key;
          option.textContent = labels[key];
          return option;
        },
      ),
    );
  }
  const host = dialog.querySelector<HTMLElement>('.map-canvas')!;
  const loading = dialog.querySelector<HTMLElement>('.map-loading')!;
  const retry = dialog.querySelector<HTMLButtonElement>('.map-retry')!;
  const progress = dialog.querySelector<HTMLProgressElement>('progress')!;
  const location = dialog.querySelector<HTMLElement>('.map-location')!;
  const events = new AbortController();
  const connectionStatus = document.createElement('p');
  let connectionTimer: ReturnType<typeof setTimeout> | undefined;
  connectionStatus.className = 'map-connection-status';
  connectionStatus.setAttribute('role', 'status');
  connectionStatus.hidden = true;
  dialog.append(connectionStatus);
  const dropped = () => {
    clearTimeout(connectionTimer);
    connectionStatus.hidden = false;
    connectionStatus.textContent =
      'Connection interrupted. Reconnecting for up to 30 seconds…';
  };
  const reconnected = () => {
    clearTimeout(connectionTimer);
    connectionStatus.hidden = false;
    connectionStatus.textContent = 'Reconnected to your crew.';
    connectionTimer = setTimeout(() => {
      connectionStatus.hidden = true;
    }, 4000);
  };
  room?.onDrop(dropped);
  room?.onReconnect(reconnected);
  const keys = new Set<string>();
  let renderer: Renderer | undefined;
  let closed = false;
  let starting = false;
  const target = { ...map.emergencyButton };
  let walk: Walkaround | undefined;
  let tasks: TaskController | undefined;
  let actions: ImpostorController | undefined;
  let sabotage: SabotageController | undefined;
  let meetings: MeetingController | undefined;
  let afterlife: Afterlife | undefined;
  let gameAudio: GameAudio | undefined;
  let polish: GamePolish | undefined;
  let mobile: MobileUX | undefined;
  let rehearsal: CharacterRehearsal | undefined;
  let boardingLobby: BoardingLobby | undefined;
  const minimap = rehearsing || boarding ? undefined : new Minimap(dialog, map);
  const roundOverlay = room
    ? new RoundOverlay(dialog, room, knowledge, map, (id) => minimap?.track(id))
    : undefined;
  const zone = document.createElement('div');
  if (room) {
    dialog.classList.add('is-walkaround');
    dialog.querySelector('.map-close')!.textContent = 'Room options';
    dialog.setAttribute(
      'aria-label',
      boarding ? 'Waiting lobby · Boarding room' : 'Walk around The Hollow',
    );
    dialog.querySelector<HTMLElement>('.map-room-field')!.hidden = true;
    dialog.querySelector<HTMLElement>('.map-home')!.hidden = true;
    dialog.querySelector('.map-instructions strong')!.textContent =
      'Walk with your crew';
    dialog.querySelector('.map-instructions p')!.textContent = boarding
      ? 'WASD or arrow keys to move. Room settings opens name, colour and game options.'
      : 'WASD or arrow keys to move. Back returns to the lobby.';
    dialog.querySelector('.portrait-hint')!.textContent =
      'Drag the left side to walk. Turn your phone for a wider view.';
    zone.className = 'walk-touch-zone';
    zone.setAttribute('aria-label', 'Drag to walk');
    zone.hidden = true;
    dialog.append(zone);
    room.onLeave(close);
    room.onStateChange(changeScene);
  }
  function changeScene() {
    if (closed || !room || (room.state.phase === 'lobby') === boarding) return;
    close();
    void openMapPreview(undefined, room, knowledge);
  }
  let dragging: { id: number; x: number; y: number } | undefined;
  function close() {
    if (closed) return;
    closed = true;
    clearTimeout(connectionTimer);
    events.abort();
    room?.onDrop.remove(dropped);
    room?.onReconnect.remove(reconnected);
    mobile?.destroy();
    boardingLobby?.destroy();
    afterlife?.destroy();
    gameAudio?.destroy();
    polish?.destroy();
    actions?.destroy();
    meetings?.destroy();
    sabotage?.destroy();
    minimap?.destroy();
    tasks?.destroy();
    walk?.destroy();
    roundOverlay?.destroy();
    room?.onLeave.remove(close);
    room?.onStateChange.remove(changeScene);
    renderer?.destroy();
    dialog.close();
    dialog.remove();
    if (trigger) {
      trigger.disabled = false;
      trigger.focus();
    }
  }
  dialog.addEventListener(
    'cancel',
    (event) => {
      event.preventDefault();
      close();
    },
    { signal: events.signal },
  );
  dialog
    .querySelector('.map-close')!
    .addEventListener('click', close, { signal: events.signal });
  const jump = (id: string) => {
    const room = map.rooms.find((room) => room.id === id)!;
    target.x = room.polygon.reduce((n, p) => n + p.x, 0) / room.polygon.length;
    target.y = room.polygon.reduce((n, p) => n + p.y, 0) / room.polygon.length;
    // Room selection jumps long travel distances; dragging/following uses camera lag.
    renderer?.camera.follow(target, true);
    select.value = id;
  };
  select.addEventListener(
    'change',
    () =>
      rehearsing
        ? rehearsal?.play(select.value as CharacterAnimation)
        : jump(select.value),
    {
      signal: events.signal,
    },
  );
  dialog
    .querySelector('.map-home')!
    .addEventListener(
      'click',
      () =>
        rehearsing
          ? rehearsal?.play(select.value as CharacterAnimation)
          : jump('commons'),
      {
        signal: events.signal,
      },
    );
  host.addEventListener(
    'pointerdown',
    (event) => {
      if (room || !renderer || event.button !== 0) return;
      const box = letterbox({ width: innerWidth, height: innerHeight });
      if (
        event.clientX < box.x ||
        event.clientX > box.x + box.width ||
        event.clientY < box.y ||
        event.clientY > box.y + box.height
      )
        return;
      dragging = { id: event.pointerId, x: event.clientX, y: event.clientY };
      host.setPointerCapture(event.pointerId);
      host.classList.add('dragging');
    },
    { signal: events.signal },
  );
  host.addEventListener(
    'pointermove',
    (event) => {
      if (!dragging || dragging.id !== event.pointerId || !renderer) return;
      const box = letterbox({ width: innerWidth, height: innerHeight });
      target.x = Math.max(
        0,
        Math.min(
          map.size.width,
          target.x - (event.clientX - dragging.x) / box.scale,
        ),
      );
      target.y = Math.max(
        0,
        Math.min(
          map.size.height,
          target.y - (event.clientY - dragging.y) / box.scale,
        ),
      );
      Object.assign(target, renderer.camera.constrain(target));
      dragging.x = event.clientX;
      dragging.y = event.clientY;
    },
    { signal: events.signal },
  );
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
    host.addEventListener(
      type,
      () => {
        dragging = undefined;
        host.classList.remove('dragging');
      },
      { signal: events.signal },
    );
  dialog.addEventListener(
    'keydown',
    (event) => {
      if (
        room ||
        event.target instanceof HTMLSelectElement ||
        !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)
      )
        return;
      event.preventDefault();
      keys.add(event.key);
    },
    { signal: events.signal },
  );
  dialog.addEventListener('keyup', (event) => keys.delete(event.key), {
    signal: events.signal,
  });
  window.addEventListener(
    'blur',
    () => {
      keys.clear();
      dragging = undefined;
    },
    { signal: events.signal },
  );
  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.hidden) keys.clear();
    },
    { signal: events.signal },
  );
  async function start() {
    if (starting || closed) return;
    starting = true;
    retry.hidden = true;
    progress.hidden = false;
    progress.value = 0;
    loading.hidden = false;
    loading.querySelector('h3')!.textContent = 'Opening the station';
    loading.querySelector('p')!.textContent = room
      ? [
          'Ghosts can still finish crew tasks.',
          'Report a body before starting another task.',
          'Two engineers must hold the reactor panels together.',
          'Check the minimap to find your next room.',
        ][Math.floor(Math.random() * 4)]!
      : 'Preparing the map and its fixtures…';
    try {
      const amounts = [0, room || rehearsing ? 0 : 1];
      const track = (index: number) => (value: number) => {
        amounts[index] = value;
        progress.value = (amounts[0]! + amounts[1]!) / 2;
      };
      const [assets, characters] = await Promise.all([
        loadStationAssets(track(0)),
        room || rehearsing
          ? loadCharacterAssets(track(1))
          : Promise.resolve(undefined),
      ]);
      if (closed) return;
      const next = new Renderer(map, assets);
      renderer = next;
      await next.init(host);
      if (closed) return;
      if (room) {
        roundOverlay?.setPresentation(next, characters!);
        walk = new Walkaround(room, next, dialog, zone, characters!, knowledge);
        tasks = new TaskController(dialog, room, knowledge, next, walk);
        actions = new ImpostorController(
          dialog,
          room,
          knowledge,
          next,
          walk,
          tasks,
        );
        zone.hidden = false;
        sabotage = new SabotageController(
          dialog,
          room,
          knowledge,
          next,
          walk,
          tasks,
        );
        meetings = new MeetingController(
          dialog,
          room,
          next,
          tasks,
          characters!,
        );
        afterlife = new Afterlife(dialog, room, knowledge, next, characters!);
        gameAudio = new GameAudio(room, next);
        polish = new GamePolish(dialog, room, next);
        mobile = new MobileUX(dialog);
        if (boarding) boardingLobby = new BoardingLobby(dialog, room);
      }
      next.camera.follow(target, true);
      if (rehearsing) {
        rehearsal = new CharacterRehearsal(next, characters!);
        rehearsal.play(select.value as CharacterAnimation);
      }
      if (walk) next.camera.follow(walk.target, true);
      next.onFrame = (seconds) => {
        rehearsal?.update();
        if (walk) {
          minimap?.setTasks(
            room?.state.phase === 'playing' &&
              room.state.roundId === knowledge.roundId &&
              room.state.sabotage?.kind !== 'comms'
              ? knowledge.tasks
              : noTasks,
          );
          walk.frame(seconds, location);
          minimap?.update(
            walk.target,
            room?.state.players.get(room.sessionId)?.inVent,
          );
          tasks?.frame();
          actions?.frame();
          sabotage?.frame();
          meetings?.frame();
          afterlife?.frame();
          gameAudio?.frame();
          polish?.frame();
          boardingLobby?.frame();
          mobile?.frame(room?.state.phase === 'playing');
          return;
        }
        const dx =
          Number(keys.has('ArrowRight')) - Number(keys.has('ArrowLeft'));
        const dy = Number(keys.has('ArrowDown')) - Number(keys.has('ArrowUp'));
        const step =
          (Math.min(seconds, 0.05) * 900) / (dx && dy ? Math.SQRT2 : 1);
        target.x = Math.max(0, Math.min(map.size.width, target.x + dx * step));
        target.y = Math.max(0, Math.min(map.size.height, target.y + dy * step));
        Object.assign(target, next.camera.constrain(target));
        const currentRoom = next.roomAt(next.camera);
        minimap?.update(next.camera, false, true);
        const name = currentRoom?.name ?? 'Station passage';
        if (location.textContent !== name) location.textContent = name;
      };
      // Metrics expose counts/timing for reproducible checks, not a promised device FPS.
      if (
        import.meta.env.DEV ||
        new URL(window.location.href).searchParams.has('diagnostics')
      ) {
        Object.defineProperty(dialog, 'renderer', {
          value: next,
          configurable: true,
        });
      }
      loading.hidden = true;
      host.dataset.ready = 'true';
    } catch (error) {
      boardingLobby?.destroy();
      boardingLobby = undefined;
      mobile?.destroy();
      mobile = undefined;
      afterlife?.destroy();
      afterlife = undefined;
      gameAudio?.destroy();
      gameAudio = undefined;
      polish?.destroy();
      polish = undefined;
      actions?.destroy();
      actions = undefined;
      meetings?.destroy();
      meetings = undefined;
      sabotage?.destroy();
      sabotage = undefined;
      tasks?.destroy();
      tasks = undefined;
      walk?.destroy();
      walk = undefined;
      zone.hidden = true;
      renderer?.destroy();
      renderer = undefined;
      if (closed) return;
      console.error('Map preview failed:', error);
      loading.querySelector('h3')!.textContent = 'The station could not open';
      loading.querySelector('p')!.textContent =
        'Check your connection and try again. If this continues, use a browser with WebGL enabled.';
      progress.hidden = true;
      retry.hidden = false;
    } finally {
      starting = false;
    }
  }
  retry.addEventListener(
    'click',
    () => {
      void start();
    },
    { signal: events.signal },
  );
  dialog.showModal();
  void start();
}
