import mapData from '@mutiny/shared/maps/the-hollow.json';
import { MapDefSchema } from '@mutiny/shared/maps';
import { loadStationAssets } from '../renderer/assets';
import { Renderer } from '../renderer/Renderer';
import { letterbox } from '../renderer/Camera';
import './preview.css';

export async function openMapPreview(trigger?: HTMLButtonElement) {
  const map = MapDefSchema.parse(mapData);
  const dialog = document.createElement('dialog');
  dialog.className = 'map-preview';
  dialog.setAttribute('aria-label', 'Explore The Hollow');
  dialog.innerHTML = `<div class="map-canvas"></div><header class="map-toolbar"><div><h2>The Hollow</h2><p class="map-location" role="status">Commons</p></div><button class="map-close secondary" type="button">Back</button></header><div class="map-loading" role="status"><h3>Opening the station</h3><p>Preparing the map and its fixtures…</p><progress max="1" value="0" aria-label="Map loading progress"></progress><button class="map-retry" type="button" hidden>Try again</button></div><footer class="map-controls"><div class="map-room-field"><label for="map-room-select">Go to room</label><select id="map-room-select"></select></div><div class="map-instructions"><strong>Map preview</strong><p>Drag or use arrow keys to look around.</p><p class="portrait-hint">Turn your phone for a wider view.</p></div><button class="map-home secondary" type="button">Find Commons</button></footer>`;
  document.body.append(dialog);
  const select = dialog.querySelector<HTMLSelectElement>('select')!;
  for (const room of map.rooms) {
    const option = document.createElement('option');
    option.value = room.id;
    option.textContent = room.name;
    select.append(option);
  }
  select.value = 'commons';
  const host = dialog.querySelector<HTMLElement>('.map-canvas')!;
  const loading = dialog.querySelector<HTMLElement>('.map-loading')!;
  const retry = dialog.querySelector<HTMLButtonElement>('.map-retry')!;
  const progress = dialog.querySelector<HTMLProgressElement>('progress')!;
  const location = dialog.querySelector<HTMLElement>('.map-location')!;
  const events = new AbortController();
  const keys = new Set<string>();
  let renderer: Renderer | undefined;
  let closed = false;
  let starting = false;
  const target = { ...map.emergencyButton };
  let dragging: { id: number; x: number; y: number } | undefined;
  function close() {
    if (closed) return;
    closed = true;
    events.abort();
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
  select.addEventListener('change', () => jump(select.value), {
    signal: events.signal,
  });
  dialog
    .querySelector('.map-home')!
    .addEventListener('click', () => jump('commons'), {
      signal: events.signal,
    });
  host.addEventListener(
    'pointerdown',
    (event) => {
      if (!renderer || event.button !== 0) return;
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
    loading.querySelector('p')!.textContent =
      'Preparing the map and its fixtures…';
    try {
      const assets = await loadStationAssets((value) => {
        progress.value = value;
      });
      if (closed) return;
      const next = new Renderer(map, assets);
      renderer = next;
      await next.init(host);
      if (closed) return;
      next.camera.follow(target, true);
      next.onFrame = (seconds) => {
        const dx =
          Number(keys.has('ArrowRight')) - Number(keys.has('ArrowLeft'));
        const dy = Number(keys.has('ArrowDown')) - Number(keys.has('ArrowUp'));
        const step =
          (Math.min(seconds, 0.05) * 900) / (dx && dy ? Math.SQRT2 : 1);
        target.x = Math.max(0, Math.min(map.size.width, target.x + dx * step));
        target.y = Math.max(0, Math.min(map.size.height, target.y + dy * step));
        Object.assign(target, next.camera.constrain(target));
        const room = next.roomAt(next.camera);
        const name = room?.name ?? 'Station passage';
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
