# Known issues and acceptance gaps

Updated 2026-09-06. Implementation progress is in [completed.md](completed.md).

- **Release gate: #24 human playtests have not run.** Two real games with 6+ people over a public tunnel are required. No game-length average, desync-free claim or balance finding is available yet. Use [the playtest sheet](docs/playtest.md).
- **Browser/device acceptance pending:** this session exposes no browser surface. Check 360px minigames, desktop/touch action placement, ghost chat within meetings, keyboard focus, final engineer lineup, refresh recovery and reduced motion. No before/after gameplay screenshots have been captured.
- **Performance unmeasured on target hardware:** CPU visibility tests are not GPU/FPS benchmarks. Map loading still has a large lazy bundle advisory. Measure low-end-phone FPS and lighting cost before declaring no regression.
- **Audio listening acceptance pending:** synthesized sounds and their event wiring exist, but first-tap unlock, balance, clipping and Safari interruption recovery require listening tests. Gameplay remains usable if audio or wake lock is denied.
- **Hosting acceptance pending:** Compose config validates with a dummy token, but the Docker daemon is not running and a real tunnel token is unset. Docker/Caddy/Cloudflare and a clean second-machine walkthrough have not been run in this pass. No public tunnel was opened.
- **Party-game trust model:** the server validates actions but synchronizes world positions/bodies to everyone. Rendering hides out-of-vision entities and ghosts, but a modified client can inspect them. This is not competitive anti-cheat.
- **In-memory rooms:** server restart discards rooms and reconnect reservations. A reconnect URL fragment is a bearer credential; use Copy invite link so it is stripped. Do not share the address-bar fragment.
- **Intentional limits:** English basic profanity filtering is not comprehensive moderation. Reconnect grace is 30 seconds; expired players leave the task denominator. A disconnected living player counts toward parity during grace. Ejection wins wait for the six-second result sequence.
- **Operational scope:** `MAX_ROOMS` is single-process; it is not a distributed quota or protection against all network abuse. Admin requires a strong password and HTTPS outside localhost. The legacy placeholder room is test-only.

No external GitHub follow-up issues were created. Promote reproducible findings from the playtest sheet into issues after review.
