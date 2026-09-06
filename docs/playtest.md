# #24 — Two-game acceptance procedure

Status: **not run**. Automated multiplayer clients are regression tests, not human playtests.

## Before inviting people

1. Use Node 22 and `pnpm install --frozen-lockfile`. Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
2. Follow the README hosting instructions on a clean second machine. Record elapsed setup time and any missing instruction. Open the public URL over mobile data; verify both matchmaking and movement.
3. Recruit at least six real players, including iPhone Safari and mid-range Android Chrome. Use Copy invite link; never share reconnect fragments or admin credentials.
4. Record version/commit, host hardware, devices, browsers, settings, network and UTC start. Capture screenshots at the same map/camera/device before and after polish if a pre-polish build is available. Do not label atlas contact sheets as gameplay screenshots.

## Both games

- Play from lobby to a real victory without scripted server-state edits. Record start/end time, winner, reason and number of players. Measure game length from entering play to result (includes meetings, excludes lobby/reveal).
- Have players record task type, start/finish times, retries and confusing instructions. Separate task interaction time from travel. Keep names/chat/role assignments out of public reports.
- Ask for desync observations with room, round, approximate timestamp, expected/actual outcome and reproduction. Note disconnect/crash, stuck controls, collision, vision, audio and meeting problems.
- In one game refresh a living player and a ghost within 30 seconds. Verify same identity, role, tasks and position, cancelled unfinished panel, updated reconnect badge and host migration. In another, exceed the window and verify a clean expired-session message.
- Complete a task as a ghost; ensure living players cannot see ghost avatars/chat. Check report, voting, sabotage repair, kill/vent cooldowns, and Play again. Test keyboard-only voting/chat and reduced motion.
- On each phone, try portrait/landscape, open and cancel every task type, drag joystick beyond its zone, background/return, mute/unmute and deny wake lock. Verify no overlapping actions or hidden timers. Inspect 360px layout separately.
- Record FPS/frame timing through walking, a visible kill, active sabotage and meetings; compare identical pre/post-polish views. The automated visibility CPU timing excludes the GPU.

## Evidence sheet — fill after each actual game

| Field                       | Game 1  | Game 2  |
| --------------------------- | ------- | ------- |
| Date/version/public host    | Not run | Not run |
| Human count/devices         | —       | —       |
| Settings                    | —       | —       |
| Play start / result time    | —       | —       |
| Duration / winner / reason  | —       | —       |
| Desync/crash reports        | —       | —       |
| Task times / retries        | —       | —       |
| Refresh / host migration    | —       | —       |
| Touch / focus / audio / FPS | —       | —       |
| Follow-up reproduction      | —       | —       |

Average game length = (Game 1 duration + Game 2 duration) / 2; do not compute until both observations exist. Keep the current 200px/s movement and other defaults until results justify a change. For seven or more players, the host may choose two impostors; this remains an explicit setting, not an automatic change to an existing room. File follow-up issues with evidence, then mark #24 complete only after two full games without desync/crash and resolution or documentation of remaining findings.
