# Theimposterissus

An original browser social deduction game for 4–10 players. Built with an authoritative Colyseus server and a PixiJS v8 client. The current build supports private lobbies: create/join by code, invite links, live names/colours/readiness, host settings, and host transfer. Lobby members can walk around The Hollow together with desktop or touch controls. Roles, tasks, and game rounds are not implemented yet. See [plan.md](plan.md) for the roadmap and [completed.md](completed.md) for progress and resume notes.

## Develop

Install Node 22 (22.12+), enable Corepack, then:

```sh
corepack enable
pnpm install
pnpm dev
```

Open http://localhost:5173. Enter a name and choose a colour, then create a game or join a five-letter room code. Copy the invite link for friends; the session ID is logged in the browser console. Vite listens on all interfaces for LAN testing; open `http://YOUR_LAN_IP:5173` on a second device. `/ws` proxies both HTTP matchmaking and WebSocket traffic to the server. Health: http://localhost:2567/health.

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Build output: `packages/client/dist`, `packages/server/dist`, `packages/shared/dist`. `pnpm --filter @mutiny/server start` runs the built server. Default server port is 2567; use `PORT=3000 pnpm dev` to change both the server and Vite proxy target. Native development does not automatically load `.env`.

## Host from your laptop in 5 minutes

Prerequisites: Docker with Compose, and a domain managed by Cloudflare for a permanent public URL. Docker builds both the client and server with Node 22 and pnpm; neither needs to be installed on the host. Initial dependency and container downloads may take longer than five minutes.

Before you have a domain, start just the local server and Caddy (no `.env` or token needed):

```sh
./scripts/host.sh --local
```

Open http://localhost:8080, or `http://YOUR_LAN_IP:8080` from another device on the same network. This does not start a tunnel; if you previously started Mutiny's tunnel, stop it with `docker compose stop cloudflared` to remove public access.

When your domain is active on Cloudflare:

1. In the Cloudflare dashboard under **Networking → Tunnels**, create a Cloudflare Tunnel and choose the Docker connector. Copy the connector token (the token value, not the entire Docker command).
2. Add a published application route for your hostname, e.g. `mutiny.yourdomain.com`, with service URL **`http://caddy:80`**. Cloudflare terminates TLS; Caddy listens on HTTP inside Compose.
3. Copy `.env.example` to `.env`. Set `TUNNEL_TOKEN` and `PUBLIC_URL` to your token and public HTTPS URL. Keep `.env` private; it is ignored by Git and Docker builds. Run `chmod 600 .env` after creating it.
4. Run:

   ```sh
   ./scripts/host.sh
   ```

5. Open the public URL on a phone with Wi-Fi turned off. Create a room, then have a second player join its invite link. Confirm that profile and ready changes appear on both devices. This verifies both matchmaking and the WebSocket through the tunnel.

Local hosted URL: http://localhost:8080. Set `HOST_PORT` in `.env` if that port is occupied. Compose keeps the game server private on port 2567; `PORT` only controls native development. `docker compose up -d --build` builds and starts all three services once the tunnel token is configured. Restart with `docker compose down && docker compose up -d` (for local-only hosting, use `docker compose up -d server caddy`).

Containers run in the background and restart automatically when Docker starts, using `restart: unless-stopped`. Manually stopped containers stay stopped across reboots; resume them with `docker compose up -d`. Keep this device powered on and awake, with Docker configured to start at boot. No router port forwarding is needed for the tunnel.

Compose imposes no CPU or memory limits: Mutiny can use available host resources as demand grows, shared with the OS and other applications. This does not reserve RAM or make the single Node game process simulate across every CPU core.

To update: `git pull --ff-only` then `./scripts/host.sh`. To stop: `docker compose down`. The room state is in memory; restarting the server ends active sessions.

## Troubleshooting

- **Tunnel unavailable:** run `docker compose ps` and `docker compose logs cloudflared`. Check the connector token and that the public route points at `http://caddy:80`.
- **Port clash:** change `HOST_PORT` in `.env` for hosting, or set `PORT` for native development. Vite requires port 5173 to be available.
- **WebSocket 502 / connection failed:** inspect `docker compose logs server caddy` and http://localhost:8080/health. Both `/ws/matchmake/...` and `/ws/...` must reach Colyseus with `/ws` stripped. The client derives `ws` or `wss` from the current page origin.
- **Missing or stale client:** run `./scripts/host.sh` (or `./scripts/host.sh --local`) to rebuild the Caddy image, which includes the client.

Cloudflare setup reference: [create a tunnel and publish an application](https://developers.cloudflare.com/tunnel/setup/). Use a dedicated Mutiny tunnel with this Compose setup; `caddy` resolves inside its Docker network. A connector for another app on a different Docker network cannot resolve it automatically.

Architecture references: [Colyseus WebSocket transport](https://docs.colyseus.io/server/transport/ws), [Colyseus 0.17 SDK migration](https://docs.colyseus.io/migrating/0.17), and [PixiJS application setup](https://pixijs.com/8.x/tutorials/getting-started).

## Lobby controls and current scope

- Pick a name (2–12 characters) and one of twelve named/numbered colours. A colour taken while joining is automatically reassigned; taken colours cannot be selected in the lobby.
- The host edits all twelve settings. Changes reset readiness. Readiness is advisory; Start requires four players (seven with two impostors).
- Start with at least four players (seven for two impostors): everyone receives a private role and task assignment, sees a three-second reveal, then enters the station. Movement defaults to 200px/s. The host can use Back and **Return everyone to lobby** to reset. Dead crew float through walls, finish tasks and use private Ghost chat; living players cannot see them.
- Crew: tap an unfinished task to highlight its current station on your private map. Within 80px, an amber outline and **Use** button become available. Press **E** or tap **Use** and follow the task instructions. Esc/× cancels without closing the map; long tasks retain earlier stages. Finished tasks leave the list, the remaining count decreases and the green crew bar updates for everyone.
- Impostor: **Q / Kill** targets nearby crew within 60px after the cooldown (30s by default, including round start). A kill leaves a body and resets the cooldown. **V / Vent** enters a vent within 80px; choose an arrow-labelled destination, then **V / Exit** to emerge. Fake stations open with **E / Use**, but never advance crew progress. Fellow impostor names are red only in impostor views. See [action controls and acceptance notes](docs/design/impostor-actions.md).
- All eight minigames are available: **reroute power**, **calibrate gyro**, **data transfer**, **sort samples**, **fuel engines**, **clear vents**, **enter access code**, and **scan ID**. Instruments explain their controls; mouse/touch and keyboard alternatives are supported. Fuel takes a five-second hold at each of two stations; data takes eight seconds at each stage. The memory code appears for two seconds; the ID swipe must take 0.8–1.6 seconds. Games pause when hidden/unfocused. Sound hooks exist; audio arrives in #19.
- During a round, sight is limited by walls and the host's crew/impostor vision settings. Nearby floor lamps remain visible inside your field of view; players around corners disappear, including their name tags. The lobby and standalone previews remain fully lit. Lights sabotage reduces crew vision to 25%; impostor vision is unchanged.
- Impostors press **B / Sabotage** for system and room-door controls. All living players can press **R / Repair** at a highlighted panel. Lights: match five switches in Switchyard. Reactor: two players hold its two panels together for three seconds. O₂: enter the code at both Scrubber and Cryo panels. Comms: hold the Relay panel for five seconds to restore task tracking. Reactor/O₂ fail after 45 seconds. System cooldown is 30 seconds after repair; doors seal for 10 seconds with a separate 15-second cooldown. See [sabotage controls and acceptance notes](docs/design/sabotage.md).
- The station is now 25% smaller in each dimension: about 2m33s around the outer loop at default speed. Rooms have task-aligned equipment, including Archive files, frozen engineers, propulsion machinery and spare suits. **Station map** in the top-left toggles a minimap showing only your position; it starts collapsed on smaller screens. See the [room artwork contact sheet](docs/maps/room-theme-review.png) (atlas/placement review, not a gameplay screenshot).
- Leaving or losing the host connection transfers control to the earliest connected player. Refresh within 30 seconds restores the same player, role, tasks and position. The URL fragment contains a private reconnect token: use **Copy invite link**, not the address bar, to invite friends. Intentional Leave clears it. Players idle in the lobby for three minutes are removed; active rounds have no AFK kick.
- Shared schema, message contracts, privacy decisions and colour accessibility: [PROTOCOL.md](packages/shared/PROTOCOL.md). Every screen UI, including basic screens, uses the `/impeccable` design workflow.

## Reports and emergency meetings (#16–#17)

Press **F / Report** within 100px of a visible body, or **C / Emergency** at the Commons button. Emergency calls use the host's per-player allowance and a 15-second cooldown; reactor/O₂ crises block emergency calls, but bodies can still be reported before the failure deadline. Meetings clear bodies and sabotages, close procedures, and bring everyone back to Commons with movement paused. The intro shows the caller and report location.

Discuss using meeting chat (living players only, 200 characters), then select a player or **Skip** and **confirm** your vote. Votes lock once submitted. Ties/skip-majorities eject nobody; missing ballots count as Skip. Anonymous voting hides voter identities, and role confirmation follows the host setting. After the six-second result sequence, play resumes with reset cooldowns or shows the winning team. See [meeting controls and verification](docs/design/meetings.md).

## End of round, sound and phones

Crew win by finishing all crew tasks (including ghosts) or eliminating every impostor. Impostors win at living-player parity or an expired reactor/O₂ crisis. The final screen shows your Victory/Defeat, why the round ended, the winning lineup and all roles. **Play again** returns everyone to the same lobby and settings.

Open **Room options → Sound** for Master, Station ambience and Effects sliders; Master 0 mutes. These settings use localStorage, unlike roles and reconnect tokens. Audio is original synthesized sound and unlocks on a keypress/tap. Hidden tabs suspend audio. On phones, landscape is recommended, controls use a compact 64px action cluster, and screen wake lock is attempted where the browser permits it. Map and Tasks open one at a time, and mobile meetings have **Chat / Vote** views with an explicit ballot confirmation. Viewport and gesture controls prevent accidental mobile zoom while preserving scrolling and simultaneous movement/action touches. Leaving a room or ending everyone's round requires confirmation. Browser/device acceptance is tracked separately in [KNOWN_ISSUES.md](KNOWN_ISSUES.md).

## Host dashboard and limits

Set `ADMIN_PASSWORD` to a strong password and restart; `/admin` then uses Basic Auth with username `admin`. Blank means disabled (404). Only use it over public HTTPS or localhost: HTTP Basic Auth does not encrypt credentials. Native development: open `http://localhost:2567/admin`; hosted: `https://your-host/admin`. It lists codes, player counts, phase and uptime, never private roles/tasks. Closing a room requires a confirmation checkbox and protected form submission; everyone disconnects and the round cannot be recovered.

`MAX_ROOMS` defaults to 20 (integer 1–1000). At capacity, creation returns a friendly server-full message; existing rooms can still accept players. This is a single-process in-memory limit, not a distributed deployment scheme. Native PowerShell: `$env:MAX_ROOMS='20'`; set `ADMIN_PASSWORD` in your local environment without committing it. Compose reads both from `.env`. Structured JSON logs go to stdout: `docker compose logs --tail=100 server`. Game logs omit chat, passwords, reconnect tokens and private assignments.

For a throwaway URL, install cloudflared and start the local services with `./scripts/host.sh --local` (Bash/WSL). Docker builds the client and server; no dummy tunnel token is needed. Run `sh scripts/tunnel-quick.sh` in a separate terminal. It explicitly exposes local Caddy publicly; share the printed HTTPS URL. Stop that terminal to end the tunnel. The script respects exported `HOST_PORT`; it does not read `.env`. No public tunnel is started automatically by development or tests.

Update with `git pull --ff-only` then `./scripts/host.sh`, preserving uncommitted work first. Updates restart the in-memory server: finish active games before updating. If Git cannot fast-forward, resolve the branch divergence before rebuilding. A second-machine hosting walkthrough and two real 6+ player games remain required; see [playtest procedure](docs/playtest.md).

## Map data and collision preview

The original **The Hollow** map is authored in `packages/shared/maps/the-hollow.json`. Its ten rooms form an outer loop with two central hubs and two dead ends. The compact outer circuit is 2m 33s at default walking speed; a movement test traverses it with the actual 24px collision radius.

```sh
pnpm map:walls   # Regenerate collision after editing room/corridor footprints
pnpm map:render  # Validate and generate PNG + SVG review diagrams
```

[View the map preview](docs/maps/the-hollow.png). See [map authoring and format notes](packages/shared/maps/README.md) for exports, dimensions, task stages, collision assumptions, and editing instructions. `pnpm test` includes map validation, vent reciprocity, task containment, circuit clearance, and reachability checks.

## Explore the rendered station

Run `pnpm dev`, create or join a lobby, and choose **Walk around**. Move with WASD or arrow keys; on touchscreens, drag in the left third of the screen to use the floating joystick. The camera follows your animated engineer, and other lobby members see your movement. Walls block movement and allow sliding. Back/Escape returns to the lobby without disconnecting. Losing focus or hiding the tab releases input. Landscape gives phones a wider view. Names and colour numbers identify each player.

For a free camera tour without joining a room, choose **Explore The Hollow** on the landing screen or open `http://localhost:5173/?view=map`. Select a room, drag the view, or use arrow keys to pan.

To check multiplayer movement, open two browsers, join the same room code, and choose **Walk around** in both. Check movement and wall sliding in both directions, then return to the lobby and reopen. The automated suite covers reconciliation with a simulated 100ms round trip; visual smoothness under browser network throttling and physical touch-device acceptance still need manual verification.

The client builds its station and character atlases automatically during `dev`, `build`, and client tests. To rebuild them alone: `pnpm --filter @mutiny/client assets`. See [renderer design and API notes](docs/design/renderer.md) for layers, camera scale, culling, and assets. Performance on physical target devices is still to be measured.

## Character rehearsal

Open `http://localhost:5173/?view=characters` to inspect all twelve engineers on the map and preview idle, walk, vent entry/exit, defeat, ghost, and body art. Use the animation selector and **Replay animation**. [Character implementation notes](docs/design/characters.md), [colour lineup](docs/art/engineer-lineup.png), and [animation contact sheet](docs/art/engineer-animations.png).
