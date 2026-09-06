# Renderer direction and implementation — plan #6

The `/impeccable` direction extends the established lobby palette and the plan's cold-metal / warm-emergency-light brief. This is an exploration surface: the station leads, and the controls stay compact. No visual identity replacement was needed.

## Visual decisions

- Dark blue hull void, cool segmented floor plates, grated passages, raised wall faces, and amber fixtures. Restrained material colours leave room for the player colours in #8.
- Twenty-four original textures are generated from authored geometry in `scripts/build-assets.ts` and `scripts/station-props.ts`: the original ten materials/fixtures plus fourteen task-aligned room props. The canonical map remains the authority for room boundaries, doors, and interactables. See [compact map and room themes](map-refresh.md) for the post-#14 pass.
- Exposed wall edges derive from the union of room/corridor floors. Interior rectangle boundaries and doorway overlaps do not create false wall faces.
- Fixtures have consistent top-down silhouettes and offset shadows. Room floor lettering is atmospheric; the high-contrast location label in the toolbar supplies the accessible room name.
- Warm glow sprites provide ambient light only. Occluded vision, dynamic sabotage lighting, and player hiding remain #13/#15 work. Decorative props do not add collision.
- The preview uses the existing font, accent, input, focus, and button language. Native room selection, drag/arrow-key camera controls, Escape/Back, asset progress, retry, and portrait guidance are present. It is explicitly a map preview, not a playable game.

## Renderer API and scale

`packages/client/src/renderer/Renderer.ts` owns one PixiJS v8 `Application`, initialized with `resizeTo: window`, WebGL preference, antialiasing, and capped device pixel ratio (maximum 2). `Camera.ts` contains independently tested camera and viewport math.

The world view is **1920 × 1080 world pixels**, letterboxed without stretching. Desktop and phone show the same world extent; only its screen scale changes. Portrait mode intentionally leaves larger bars and recommends turning the phone. The camera follows a live target with frame-independent exponential lag, clamps to map bounds, and handles maps smaller than the viewport. Reduced-motion mode snaps camera motion.

The world has ordered `floor`, `walls`, `objects`, `entities`, and `lighting` containers. `hud` is a separate screen-space container above it. Static map items are culled by precomputed bounds, with 100px padding and a 4px camera-motion threshold. Entities sort by their y position.

`Walkaround` uses `renderer.camera.follow(predictedPlayerPosition)` and `setEntity(id, container)` / `removeEntity(id)` for crew markers. Renderer owns entity containers but preserves the shared atlas textures on scene disposal. `pause()`, `resume()`, and `destroy()` manage scene lifecycle; hidden tabs stop the ticker. The landing-page preview controls a separate camera target and sends no movement messages; the room-connected variant uses authoritative movement.

## Movement extension — plan #7

The existing map surface now supports a shared lobby walkaround. It inherits the station palette, Trebuchet labels, compact toolbar, loading/retry, and Back/Escape behavior. The free-camera room selector is replaced by camera follow and movement instructions when a room is connected. No new visual identity is introduced.

Plan #8 replaces the temporary numbered markers with layered animated engineers; names and colour numbers remain upright when the figure flips. See [character design and API notes](characters.md). Desktop accepts WASD/arrows; touch uses a floating joystick in the left third, with an 8px dead zone, capped analog magnitude, pointer capture, and reset on release/cancel/blur/hidden. The camera and movement state pause during the temporary starting phase and future meetings.

Client simulation and interpolation live separately from Pixi rendering for deterministic tests. Closing removes movement listeners and sends a stop command; disconnection closes the map. No role or task information is added to public state. The #7 mechanical detector returned no findings. Browser automation was unavailable in the implementation session; desktop/mobile visual checks and two-browser smoothness with 100ms RTT remain pending, distinct from the earlier #6 screenshots below.

## Asset pipeline

`pnpm --filter @mutiny/client assets` produces one 1040 × 780 RGBA PNG and Pixi spritesheet JSON under `packages/client/public/assets/station/`. Frames are padded; the output is generated and Git-ignored. Both client `dev` and `build` run the asset step automatically. This deterministic script is the plan's equivalent to AssetPack; Sharp and the script live in root development tooling.

Pixi `Assets` loads and caches the atlas. The preview module and map/validation data load lazily so opening the lobby does not initialize WebGL. Closing the preview destroys the scene and its listeners but keeps shared textures cached. A failed load offers retry; closing while a download is pending cannot attach an orphan canvas later.

## Verification and limits

Camera/bounds and exposed-wall tests are part of `pnpm test`. Browser checks cover desktop, landscape phone, portrait phone, DPR 1/2, room selection, camera movement/clamping, resize, y sorting, close/reopen, and failed/delayed atlas loads. The mechanical Impeccable detector ran in degraded regex mode, supplemented by screenshot review; this is not a full automated accessibility audit.

Initial local headless Chrome measurements: 120 frame intervals per viewport, median approximately 16.7ms and p95 approximately 16.8ms. Renderer update CPU p95 was 0.1–0.2ms while stationary in Reactor Well. Commons had 60 visible static items out of 625. These numbers describe the development machine, not an Android device or the plan's 2020-era laptop. The required physical-device FPS checks remain pending; screenshots and emulated viewports are not hardware benchmarks.

For development inspection, the dialog exposes its renderer as `document.querySelector('.map-preview').renderer`. Production exposes it only when the URL includes `diagnostics`. The `stats` getter reports item counts, ticker FPS, update CPU time, and resolution; it is not end-to-end GPU timing.

Reviewed screenshots: [Commons on desktop](../maps/renderer-commons.png) and [landscape phone viewport](../maps/renderer-mobile.png). Touch-event checks and returning to a still-connected lobby also passed.
