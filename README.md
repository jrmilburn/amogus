# Mutiny

An original browser social deduction game for 4–10 players. Built with an authoritative Colyseus server and a PixiJS v8 client. The current build supports private lobbies: create/join by code, invite links, live names/colours/readiness, host settings, and host transfer. An explorable PixiJS map preview is also available; gameplay is not implemented yet. See [plan.md](plan.md) for the roadmap and [completed.md](completed.md) for progress and resume notes.

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

Prerequisites: Node 22, pnpm via Corepack, Docker with Compose, and a domain managed by Cloudflare. Initial dependency and container downloads may take longer than five minutes.

1. In the Cloudflare dashboard, create a Cloudflare Tunnel and choose the Docker connector. Copy the connector token (the token value, not the entire Docker command).
2. Add a published application route for your hostname, e.g. `mutiny.yourdomain.com`, with service URL **`http://caddy:80`**. Cloudflare terminates TLS; Caddy listens on HTTP inside Compose.
3. Copy `.env.example` to `.env`. Set `TUNNEL_TOKEN` and `PUBLIC_URL` to your token and public HTTPS URL. Keep `.env` private; it is ignored by Git and Docker builds.
4. Run:

   ```sh
   ./scripts/host.sh
   ```

5. Open the public URL on a phone with Wi-Fi turned off. Create a room, then have a second player join its invite link. Confirm that profile and ready changes appear on both devices. This verifies both matchmaking and the WebSocket through the tunnel.

Local hosted URL: http://localhost:8080. Set `HOST_PORT` in `.env` if that port is occupied. Compose keeps the game server private on port 2567; `PORT` only controls native development. `docker compose up -d` starts all three services after the initial client build. Restart with `docker compose down && docker compose up -d`.

To update: `git pull` then `./scripts/host.sh`. To stop: `docker compose down`. The room state is in memory; restarting the server ends active sessions.

## Troubleshooting

- **Tunnel unavailable:** run `docker compose ps` and `docker compose logs cloudflared`. Check the connector token and that the public route points at `http://caddy:80`.
- **Port clash:** change `HOST_PORT` in `.env` for hosting, or set `PORT` for native development. Vite requires port 5173 to be available.
- **WebSocket 502 / connection failed:** inspect `docker compose logs server caddy` and http://localhost:8080/health. Both `/ws/matchmake/...` and `/ws/...` must reach Colyseus with `/ws` stripped. The client derives `ws` or `wss` from the current page origin.
- **Missing client:** run `./scripts/host.sh` to build the client before starting Caddy.

Architecture references: [Colyseus WebSocket transport](https://docs.colyseus.io/server/transport/ws), [Colyseus 0.17 SDK migration](https://docs.colyseus.io/migrating/0.17), and [PixiJS application setup](https://pixijs.com/8.x/tutorials/getting-started).

## Lobby controls and current scope

- Pick a name (2–12 characters) and one of twelve named/numbered colours. A colour taken while joining is automatically reassigned; taken colours cannot be selected in the lobby.
- The host edits all twelve settings. Changes reset readiness. Readiness is advisory; Start requires four players (seven with two impostors).
- Start currently enters a locked `starting` phase and displays an explicit gameplay-under-construction notice. The host can return everyone to the lobby. Roles, tasks, movement and game rounds arrive in later plan issues.
- Leaving or losing the host connection transfers control to the earliest remaining player. Refresh currently joins as a new player; recovery of the original session is planned in #22.
- Shared schema, message contracts, privacy decisions and colour accessibility: [PROTOCOL.md](packages/shared/PROTOCOL.md). Every screen UI, including basic screens, uses the `/impeccable` design workflow.

## Map data and collision preview

The original **The Hollow** map is authored in `packages/shared/maps/the-hollow.json`. Its ten rooms form an outer loop with two central hubs and two dead ends. The measured outer circuit is 4m 15s at default walking speed; the PixiJS renderer is available as a preview, and player movement is the next milestone.

```sh
pnpm map:walls   # Regenerate collision after editing room/corridor footprints
pnpm map:render  # Validate and generate PNG + SVG review diagrams
```

[View the map preview](docs/maps/the-hollow.png). See [map authoring and format notes](packages/shared/maps/README.md) for exports, dimensions, task stages, collision assumptions, and editing instructions. `pnpm test` includes map validation, vent reciprocity, task containment, circuit clearance, and reachability checks.

## Explore the rendered station

Run `pnpm dev` and choose **Explore The Hollow** on the landing screen or **Explore map** in a lobby. You can also open `http://localhost:5173/?view=map`. Select a room, drag the view (mouse or touch), or use arrow keys to pan. Back/Escape returns to the existing screen without leaving your multiplayer room. Portrait phones can use the preview; landscape gives the map more screen space.

The client builds its original texture atlas automatically during `dev` and `build`. To rebuild it alone: `pnpm --filter @mutiny/client assets`. See [renderer design and API notes](docs/design/renderer.md) for layers, camera scale, culling, assets, and the #7 integration point. Performance on physical target devices is still to be measured.
