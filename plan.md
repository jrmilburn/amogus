# Mutiny: browser social deduction game (Among Us genre)

Working title: **Mutiny**. Original characters, map and minigames. Do not copy the Among Us crewmate design, map layouts or task art; the genre is fair game, the assets are not.

## Architecture decisions (locked, do not relitigate inside issues)

| Concern | Decision | Why |
|---|---|---|
| Repo | pnpm monorepo: `packages/shared`, `packages/server`, `packages/client` | Shared types and protocol, one deploy |
| Server | Node 22 + TypeScript + **Colyseus** (authoritative rooms, schema state sync) | Rooms, room codes, reconnection and delta sync out of the box. Saves a day on its own |
| Client | Vite + TypeScript + **PixiJS v8** (WebGL, custom filters for lighting) | Good graphics with full control; lighter than Phaser for a custom renderer |
| Tick | Server sim 20 Hz, client render 60 fps, client-side prediction for own player, interpolation for others | Standard for this genre |
| Local proxy | **Caddy** serves the built client and proxies `/ws` to Colyseus on one origin | No CORS, one URL to share |
| Internet | **Cloudflare Tunnel** (`cloudflared`) to a subdomain | No port forwarding, free TLS, WebSockets work, laptop can sit behind CGNAT |
| Run | `docker compose up` starts server + Caddy + cloudflared | One command to host |
| Mobile | First-class: touch joystick, big action buttons, landscape | Players join by link on phones |
| Players | 4 to 10 per room, 1 to 2 impostors | |

Suggested labels: `milestone:0-foundation`, `milestone:1-core`, `milestone:2-game-loop`, `milestone:3-polish`, `parallel-safe`, `blocking`.

Issues marked **parallel-safe** touch disjoint files and can run concurrently under `/orchestrate` once their dependencies are merged.

---

## Milestone 0: Foundation

### #1 Scaffold the monorepo
**Labels:** milestone:0-foundation, blocking

Create the pnpm workspace with three packages:
- `packages/shared`: TS types, constants, message enums. No runtime deps.
- `packages/server`: Colyseus server, `src/index.ts` boots on `PORT` (default 2567) with a `GET /health` returning `{ ok: true, rooms: n }`.
- `packages/client`: Vite + PixiJS v8 hello world rendering a spinning sprite at 60 fps.

Also: root `tsconfig.base.json`, ESLint + Prettier, `pnpm dev` runs server and client concurrently, `pnpm build` produces `packages/client/dist` and `packages/server/dist`. Add `CLAUDE.md` describing package layout, commands and the architecture table above. GitHub Actions: lint + typecheck + build on PR.

**Acceptance**
- `pnpm dev` opens client at `localhost:5173`, client connects to a placeholder Colyseus room and logs the session id.
- CI green on the initial PR.

---

### #2 One-command hosting: Docker Compose + Caddy + Cloudflare Tunnel
**Labels:** milestone:0-foundation, blocking
**Depends on:** #1

Prove the internet path before the game exists so it is never the thing that breaks at 11pm.

- `Dockerfile.server` (multi-stage, runs `node dist/index.js`).
- `Caddyfile`: serve `/srv/client` (built client) as static, `reverse_proxy /ws* server:2567`, everything else `try_files` to `index.html`. Listen on `:80` only; TLS terminates at Cloudflare.
- `docker-compose.yml` with services `server`, `caddy`, `cloudflared`. cloudflared uses `TUNNEL_TOKEN` from `.env`.
- `scripts/host.sh`: builds client, runs `docker compose up -d`, prints the public URL.
- `.env.example` with `TUNNEL_TOKEN`, `PUBLIC_URL`, `PORT`.
- Client resolves the WebSocket URL from `window.location` (`wss://` when `https:`), never hardcoded.
- README section "Host from your laptop in 5 minutes": create tunnel in Cloudflare dashboard, point hostname at `http://caddy:80`, paste token, run script.

**Acceptance**
- From a phone on mobile data, the public URL loads the hello-world client and opens a WebSocket to the server through the tunnel.
- `docker compose down && up` restores service with no manual steps.

---

## Milestone 1: Core

### #3 Shared game state schema and message protocol
**Labels:** milestone:1-core, blocking
**Depends on:** #1

In `packages/shared` define the Colyseus `Schema` classes and message names used by both sides.

- `Player { id, name, color, x, y, facing, role: 'crew'|'impostor', alive, ready, isHost, tasksDone, tasksTotal, inVent, connected }`
- `GameState { phase: 'lobby'|'starting'|'playing'|'meeting'|'voting'|'ejection'|'ended', players: MapSchema<Player>, settings: Settings, meeting?: MeetingState, sabotage?: SabotageState, taskProgress: number, winner?: 'crew'|'impostor' }`
- `Settings { impostors, killCooldown, emergencyMeetings, discussionTime, votingTime, playerSpeed, crewVision, impostorVision, tasksShort, tasksLong, confirmEjects, anonymousVotes }`
- Client to server messages: `input`, `useTask`, `taskProgress`, `taskComplete`, `kill`, `vent`, `sabotage`, `fixSabotage`, `report`, `emergency`, `chat`, `vote`, `updateSettings`, `start`.
- Server to client messages: `roleReveal`, `taskList`, `killed`, `meetingStart`, `voteResult`, `gameOver`, `error`.

Document every message payload with a TS type. Export `MAP_IDS`, `COLORS` (12 distinct, colour-blind checked), `TICK_RATE = 20`.

**Acceptance**
- Server and client both compile against the shared package; no duplicated type definitions anywhere.

---

### #4 Lobby: create room, join by code, pick name and colour, host starts
**Labels:** milestone:1-core, blocking
**Depends on:** #3

- Landing screen: "Create game" or "Join game" with a 5-letter room code input. Room code is generated server-side from an unambiguous alphabet (no O/0/I/1), shown large with a copy-link button. Joining via `?code=ABCDE` in the URL skips the input.
- Name (2 to 12 chars, sanitised) and colour picker; taken colours are greyed out.
- Lobby view lists players with colour swatch and ready state. Host has a settings panel (all `Settings` fields) and a Start button enabled at 4+ players.
- Host leaves: transfer host to the longest-connected player.
- Room max 10; joining a full or in-progress room returns a friendly error.

**Acceptance**
- Two browsers on different machines can create and join a lobby by code, change colours and see each other update live.

---

### #5 Map data format and Map 1: "The Hollow"
**Labels:** milestone:1-core, parallel-safe
**Depends on:** #3

Define `MapDef` JSON in `packages/shared/maps/`:
- `size`, `spawnPoints[]`, `walls[]` (axis-aligned rectangles for collision), `rooms[]` (name + polygon, used for meeting location text and sabotage), `tasks[]` (`{ id, type, room, x, y, length: 'short'|'long' }`), `vents[]` (with `links[]` ids), `doors[]` (room id, rectangle), `sabotagePoints[]` (lights panel, reactor A/B, O2 A/B, comms), `emergencyButton {x,y}`, `cameras[]` optional.

Author Map 1 as an original derelict station layout: roughly 8 to 10 rooms in a loop with two central hub rooms and a few dead-end rooms, so impostors have both escape routes and traps. Aim for a 4 to 5 minute full circuit on foot. Include a `scripts/render-map.ts` that draws the collision layer to a PNG for review.

**Acceptance**
- `MapDef` validated with a zod schema; a unit test loads Map 1 and asserts every vent link is reciprocal and every task sits inside a room polygon.

---

### #6 Client renderer: PixiJS app, camera, map layers, asset pipeline
**Labels:** milestone:1-core, blocking
**Depends on:** #5

- `Renderer` class owning the Pixi `Application`, `resizeTo: window`, device pixel ratio aware, letterboxes to keep world scale consistent across phone and desktop.
- Layered containers: `floor`, `walls`, `objects`, `entities` (y-sorted), `lighting`, `hud`.
- Camera follows a target with slight lag, clamps to map bounds.
- Map art pass: floor and wall textures from a texture atlas, rendered from `MapDef`. Art direction: cold metal, warm emergency lighting, muted palette so player colours pop. Use `/impeccable` for the visual direction before drawing anything.
- Asset loader with a loading screen; atlases generated at build time via `@pixi/assetpack` or an equivalent script.

**Acceptance**
- Map 1 renders at a stable 60 fps on a 2020-era laptop and 30+ fps on a mid-range Android phone.

---

### #7 Player movement: input, server authority, prediction and interpolation
**Labels:** milestone:1-core, blocking
**Depends on:** #4, #6

- Client sends `input { seq, dx, dy }` at 20 Hz; WASD / arrows on desktop, virtual joystick on touch (nipple-style, left third of screen).
- Server integrates movement at `playerSpeed`, resolves collision against `walls[]` with sliding, writes `x, y` to schema.
- Own player: client-side prediction with input reconciliation on server ack (`lastProcessedSeq`).
- Others: snapshot interpolation with a 100 ms buffer.
- Facing flips sprite horizontally; walking state drives animation.
- Players cannot move during meetings; dead players handled in #18.

**Acceptance**
- Two players moving around Map 1 see each other smoothly with no rubber-banding on a 100 ms simulated RTT (Chrome throttling).

---

### #8 Character art and animation
**Labels:** milestone:1-core, parallel-safe
**Depends on:** #6

Original character design: a stocky suited engineer with a visor and a backpack is fine, but the silhouette must be clearly distinct from the Among Us crewmate. Base sprite is greyscale so `color` is applied as a tint; visor and pack are separate non-tinted layers.

- Spritesheet: idle (4 frames), walk (8 frames), vent enter/exit (6 frames), kill victim (8 frames), ghost (4 frame float). 128 px tall.
- Name tag above head, red name for fellow impostors (impostor view only).
- Dead body sprite: half-body with the same tint, lying pose.
- Drop shadow ellipse.

**Acceptance**
- All 12 colours look distinct side by side on the Map 1 floor. Animations play via Pixi `AnimatedSprite` driven by player state.

---

## Milestone 2: Game loop

### #9 Game start: roles, task assignment, role reveal
**Labels:** milestone:2-game-loop, blocking
**Depends on:** #7

- Host `start` → phase `starting`. Server picks `settings.impostors` at random, assigns each crew `tasksShort` short + `tasksLong` long tasks from `MapDef.tasks` (impostors get a fake list of the same shape). Teleports everyone to spawn points in a circle.
- Sends `roleReveal` privately: crew sees "Crew" with teammates hidden; impostors see "Impostor" plus fellow impostor names.
- Role reveal screen (3 s) then phase `playing`. Kill cooldown starts at full on game start.
- `taskProgress` is 0..1 over all real tasks in the game.

**Acceptance**
- A 5-player game starts with exactly the configured impostor count and every crew member has the right number of tasks. Impostors cannot affect `taskProgress`.

---

### #10 Task framework: interaction prompt, task list HUD, progress bar
**Labels:** milestone:2-game-loop, blocking
**Depends on:** #9

- Proximity detection: nearest interactable within 80 px highlights and enables a `Use` button (E key / touch button).
- Task list panel (top-left, collapsible on mobile) with room name, task name and a tick when done. Long tasks show step count.
- Green total-task bar at top; visibility governed by `settings` later (always visible for now).
- `TaskMinigame` interface in client: `mount(container, onComplete)`, `unmount()`. Opens as a modal over the game; player is frozen while open, closing (Esc / X) cancels.
- Server validates `taskComplete` against the player's assigned list and proximity to the task location. Rejects otherwise.

**Acceptance**
- A placeholder "hold button" minigame completes end to end and moves the progress bar for everyone.

---

### #11 Task minigames, batch A
**Labels:** milestone:2-game-loop, parallel-safe
**Depends on:** #10

Implement four original minigames as `TaskMinigame`s, each with its own art and SFX hook:
1. **Reroute power**: drag four coloured cables to matching sockets (short).
2. **Calibrate gyro**: tap when the sweeping needle is inside the green band, three times (short).
3. **Data transfer**: press start, wait 8 s progress bar (long, two-stage: download in room A, upload in room B).
4. **Sort samples**: drag vials into the correct rack by label (short).

**Acceptance**
- Each is playable with mouse and touch, completes via `onComplete`, and has a 5 to 15 s expected completion time.

---

### #12 Task minigames, batch B
**Labels:** milestone:2-game-loop, parallel-safe
**Depends on:** #10

Four more:
5. **Fuel engines**: hold to fill a canister, then walk to the engine and hold to empty (long, two-stage).
6. **Clear vents**: drag debris out of a duct (short).
7. **Enter access code**: memorise a 5-digit code shown for 2 s, type it on a keypad (short).
8. **Scan ID**: drag a card through a reader at the right speed; too fast or too slow fails (short).

**Acceptance**
- Same as #11. Map 1 tasks reference at least 8 distinct minigame types across batches A and B.

---

### #13 Vision and lighting
**Labels:** milestone:2-game-loop, parallel-safe
**Depends on:** #6, #7

- Lighting layer: full-screen dark overlay with a radial vision mask around the own player, radius from `crewVision` / `impostorVision`.
- Shadow casting: walls occlude vision (2D ray-cast polygon into a render texture used as the mask). Rooms behind walls are dark.
- Remote players and bodies outside the visible polygon are not rendered (client-side only, server sends all for now; fine for a party game).
- Lights sabotage hook: exposes `setVisionMultiplier(n)` for #15.
- Subtle ambient emissive glows on the floor from map light sources.

**Acceptance**
- Standing in a doorway, you can see down the corridor but not into the room around the corner. Frame budget for lighting under 2 ms.

---

### #14 Impostor actions: kill, vents, fake tasks
**Labels:** milestone:2-game-loop, blocking
**Depends on:** #9, #8

- Kill: `Kill` button (Q / touch) enabled when a living crew member is within 60 px and cooldown is 0. Server validates, teleports impostor onto the victim, sets `alive=false`, spawns a body entity at that position, resets cooldown. Client plays kill animation for the killer and a brief cut-in for the victim.
- Vents: impostor near a vent sees `Vent` button; entering hides the player (`inVent=true`, not rendered, no collision) and shows arrows to linked vents; moving between vents is instant. Exiting re-renders at the vent. Crew never see venting players.
- Impostor task list is labelled "Fake tasks" in red and opening one shows the minigame but never reports completion.
- Impostors see fellow impostors' names in red.

**Acceptance**
- A kill leaves a body, the impostor cannot kill again until cooldown elapses, and a crew player cannot trigger `kill` or `vent` even by forging the message.

---

### #15 Sabotage
**Labels:** milestone:2-game-loop, parallel-safe
**Depends on:** #13, #14

Impostor `Sabotage` button opens the map with buttons:
- **Lights**: crew vision multiplier 0.25 until any player flips the 5 switches at the lights panel to match the target pattern.
- **Reactor meltdown**: 45 s countdown; two players must hold both reactor points simultaneously for 3 s. Timeout = impostor win.
- **O2 depletion**: 45 s; two keypads, each needs a 5-digit code shown on the panel. Timeout = impostor win.
- **Comms**: task list hidden and task bar hidden until fixed by holding at the comms panel.
- **Doors**: lock a chosen room's doors for 10 s (no fix required). Separate short cooldown.

Global sabotage cooldown 30 s. Sabotage state lives in `GameState.sabotage` and drives a red flashing HUD banner with the countdown. Emergency meetings cannot be called during reactor / O2.

**Acceptance**
- Each sabotage triggers, displays for all players and is fixable at its panel; reactor and O2 timing out ends the game as impostor win.

---

### #16 Bodies, reporting and the emergency button
**Labels:** milestone:2-game-loop, blocking
**Depends on:** #14

- Body within 100 px enables `Report`. Emergency button on the map enables `Emergency` when in range, subject to `settings.emergencyMeetings` per player and a 15 s cooldown after game start / previous meeting.
- Either sets phase `meeting`, records `meeting.reason` (`report` with body colour, or `emergency` with caller), removes all bodies, teleports everyone back to the meeting table, and stops movement.
- Meeting intro screen: "Dead body reported" / "Emergency meeting" with the caller's character.

**Acceptance**
- Reporting or pressing the button pulls all players into the meeting phase and clears bodies.

---

### #17 Meeting, chat, voting and ejection
**Labels:** milestone:2-game-loop, blocking
**Depends on:** #16

- Meeting UI: grid of players (dead greyed out and crossed), discussion timer then voting timer from settings.
- Text chat during meetings only, living players only, 200 char cap, basic profanity filter, ghosts get their own channel (#18).
- Vote: tap a player then confirm, or Skip. Each voter's tile shows "voted". Dead players cannot vote.
- Tally when all living players have voted or timer ends. Ties and skip-majority = no ejection. `settings.anonymousVotes` hides who voted for whom in the reveal; otherwise show vote icons per tile.
- Ejection cutscene: character drifts across a starfield, text "X was ejected." then "X was / was not an Impostor" if `confirmEjects`, else just the name. Then "N Impostors remain".
- Return to `playing`, respawn at meeting table, kill cooldown reset.

**Acceptance**
- Full meeting flow works with 6 players including a tie and a successful ejection.

---

### #18 Win conditions, end screen, ghosts
**Labels:** milestone:2-game-loop, blocking
**Depends on:** #17, #15

- After every kill, ejection, task completion and sabotage tick, evaluate: all tasks done → crew win; no living impostors → crew win; living impostors ≥ living crew → impostor win; reactor / O2 timeout → impostor win.
- End screen: "Victory" / "Defeat" per player, winning team lineup, reveal all roles, "Play again" (host) returns everyone to the lobby with the same room and settings.
- Ghosts: dead players float (ghost animation), ignore walls, see everything, keep completing tasks (counts toward crew win), see and use ghost chat, cannot report, vote, sabotage, or be seen by living players.

**Acceptance**
- Each of the five win paths ends the game correctly in a scripted integration test (server-side, no renderer).

---

## Milestone 3: Polish and hosting

### #19 Audio
**Labels:** milestone:3-polish, parallel-safe
**Depends on:** #14, #17

Original or CC0 assets only. Ambient loop for gameplay, meeting stinger, vote tick, ejection whoosh, kill stab, sabotage alarm loop, task complete chime, footsteps, vent whoosh, button clicks. `AudioManager` with master / music / SFX sliders in a settings menu; audio unlocks on first user gesture (mobile). Spatial falloff for footsteps and vents.

**Acceptance**
- Every game event in #14 to #18 has a sound; volume and mute settings persist in `localStorage`.

---

### #20 Visual polish pass
**Labels:** milestone:3-polish, parallel-safe
**Depends on:** #13, #17

Run `/impeccable` over the whole experience, then: screen shake and red vignette on witnessing a kill, particle sparks on task complete, emergency alarm lights pulsing red during sabotage, meeting UI transitions, animated room code screen, ejection starfield parallax, subtle bloom on emissive map elements, consistent HUD typography and iconography. Loading screen with tips.

**Acceptance**
- Side-by-side before/after screenshots in the PR. No frame-rate regression from #6 budgets.

---

### #21 Mobile UX
**Labels:** milestone:3-polish, parallel-safe
**Depends on:** #16

- Landscape lock prompt on phones; HUD reflows for short viewports.
- Action cluster bottom-right: Use / Kill / Report / Sabotage sized 64 px+, contextually shown.
- Joystick dead zone and sensitivity tuned; prevent pull-to-refresh and pinch zoom.
- Task minigames verified on a 360 px wide viewport.
- Keep-screen-awake via Wake Lock API where available.

**Acceptance**
- A full game is playable on an iPhone in Safari and a mid-range Android in Chrome without any desktop-only interaction.

---

### #22 Reconnection, AFK and host migration
**Labels:** milestone:3-polish, parallel-safe
**Depends on:** #18

- Colyseus `allowReconnection` with a 30 s window; a refreshed tab rejoins the same player (token stored in URL hash so no browser storage is needed).
- Disconnected players are shown as greyed with a "reconnecting" badge; in a meeting they count as skip after timeout.
- Players idle for 3 minutes in the lobby are kicked; in-game AFK is left alone.
- Host migration on host disconnect (already in #4) re-tested mid-game.

**Acceptance**
- Killing a tab mid-game and reopening the link within 30 s puts you back with role, tasks and position intact.

---

### #23 Ops: host dashboard, config, README
**Labels:** milestone:3-polish, parallel-safe
**Depends on:** #2, #18

- `/admin` route (basic auth via `ADMIN_PASSWORD` env) listing active rooms, player counts, phase, uptime, with a "close room" button. Colyseus monitor is acceptable behind the same auth.
- Structured logging (pino) to stdout; docker logs are enough.
- `MAX_ROOMS` env guard so a viral link cannot melt the laptop; friendly "server full" page.
- Finalise README: hosting quickstart, updating (`git pull && ./scripts/host.sh`), troubleshooting (tunnel down, port clash, WebSocket 502 from Caddy).
- Optional `scripts/tunnel-quick.sh` using `cloudflared tunnel --url` for a throwaway `trycloudflare.com` URL with no account setup, for the video.

**Acceptance**
- A fresh clone on a second machine is serving publicly within 10 minutes following only the README.

---

### #24 Playtest, balance and bug bash
**Labels:** milestone:3-polish
**Depends on:** all above

Run two real 6+ player games over the tunnel. Capture: desync reports, task completion times, average game length, anything confusing. Tune default settings (suggested start: 1 impostor under 7 players, 2 at 7+, kill cooldown 30 s, discussion 30 s, voting 60 s, crew vision 1.0, impostor vision 1.5, 2 short + 1 long task per player). File follow-up issues for anything not fixed on the spot.

**Acceptance**
- Two complete games with no desync or crash; defaults committed; a `KNOWN_ISSUES.md` exists.

---

## Suggested execution order for `/orchestrate`

1. **Serial:** #1 → #2 → #3 → #4
2. **Parallel wave 1:** #5, #8 (after #6 lands, #8 can start)
3. **Serial:** #6 → #7
4. **Serial:** #9 → #10
5. **Parallel wave 2:** #11, #12, #13, #14
6. **Serial:** #15 (needs #13 + #14) → #16 → #17 → #18
7. **Parallel wave 3:** #19, #20, #21, #22, #23
8. **Serial:** #24

Critical path is #1 → #2 → #3 → #4 → #6 → #7 → #9 → #10 → #14 → #16 → #17 → #18. Everything else hangs off it. If the day runs short, ship after #18 with the #2 hosting path and treat milestone 3 as a follow-up episode.