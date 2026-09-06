# Shared state and protocol

The source of truth is `src/state.ts`, `src/protocol.ts`, and `src/settings.ts`. Both client and server import from `@mutiny/shared`; do not redefine payloads in either package.

## State and privacy

#22: unintentional transport drops set `connected=false` for up to 30 seconds using Colyseus reconnection. Role/task/position records remain private/retained; in-progress panel sessions and vents cancel. Host transfers immediately to the earliest connected player. Reconnect privately replays own role/task messages in any active phase; stale-round and lobby deliveries are ignored. The SDK token lives only in the URL fragment, stripped from invite links. Intentional leave/expiry removes records. Disconnected living players prevent early meeting tally until reconnect/expiry/deadline; expired voters count as Skip. Lobby-only inactivity timeout is 180 seconds.

#18: `finalResult` stays empty until `ended`, then contains the `gameOver` payload (round, winner, reason, roles and identity lineup). Host reset clears it. Ghosts retain private tasks, move through walls within map bounds and use unrestricted client vision. Living clients do not render dead avatars. Dead players remain prohibited from living-only actions. `ghostChat {roundId,text}` is dead-only; `ghostHistory {roundId,messages}` is privately delivered only to dead connected players, never synchronized publicly. History is capped at 100 sanitized 200-character messages, one per second per actor. Ejection victory follows the six-second public tally sequence.

`GameState` contains public players, room code, phase, settings, optional meeting/sabotage, aggregate task progress, and an optional winning team. Positions use world pixels; `lastProcessedSeq` acknowledges consumed movement commands. `walking` reports actual movement on the last server tick; `facing` is -1 or 1. Absolute timer fields (`*EndsAt`, `endsAt`) use Unix milliseconds. Settings durations use seconds; vision values are multipliers and player speed is world pixels per second.

`Player` intentionally excludes the proposed public `role` field. `PrivatePlayerState` describes server-held role/task data; `roleReveal` and `taskList` must be sent only to the appropriate player. Never synchronize a role map before game over. Meeting state exposes only whether a player voted; vote targets stay private until the tally. The future anonymous-vote reveal must omit voter identities. Undecorated fields are not synchronized; an integration test verifies that even a server-attached role does not reach clients.

Shared uses `@colyseus/schema` 4.x for plan #3 and Zod for the map validator in #5. The latter is exposed through the separate `@mutiny/shared/maps` entry. This explicitly supersedes #1's runtime-free constraint. Decorators are compiled in shared with `experimentalDecorators: true` and `useDefineForClassFields: false`. Ship its compiled output to consumers.

## Messages

The complete payload definitions and identity maps of message names are in `src/protocol.ts`. An empty request is `{}`; no request can specify its own actor ID. The server always uses the authenticated session ID.

Implemented in the lobby:

| Request          | Payload                       | Authority                                                                                           |
| ---------------- | ----------------------------- | --------------------------------------------------------------------------------------------------- |
| Room create/join | `JoinOptions { name, color }` | Validated before joining; a taken colour is reassigned to the first free colour                     |
| `updateProfile`  | `{ name?, color? }`           | Own profile, lobby only; at least one field; taken colour rejects the whole update                  |
| `ready`          | `{ ready: boolean }`          | Own readiness, lobby only                                                                           |
| `updateSettings` | `Partial<SettingsValues>`     | Host only, lobby only; whole patch validated before applying                                        |
| `start`          | `{}`                          | Host only; 4+ players, or 7+ with two impostors                                                     |
| `cancelStart`    | `{}`                          | Host only in `starting` or `playing`; temporary reset while later game actions remain unimplemented |
| `error` (server) | `{ code, message }`           | Human-readable rejection, sent privately to the requesting client                                   |

The legacy `taskProgress` request remains rejected. Sabotage and timed-crisis `gameOver` are implemented in #15; reporting/emergencies in #16; living meeting chat, votes and `voteResult` in #17. Ghost chat remains #18. Host `cancelStart` also resets meeting, voting, ejection and ended phases.

## Game start — plan #9

The server stores roles, task lists, and kill deadlines in `RoundAssignments`, never synchronized Schema. Start increments public `roundId`, sets `phaseEndsAt` to the reveal deadline, teleports players to map spawns, clears queued movement, and locks joins. Every connection receives private `roleReveal { roundId, role, teammates, durationMs: 3000 }` and `taskList { roundId, tasks, fake }` after the corresponding state patch. Crew receive no teammates; impostors receive only fellow impostors. Public task counts have identical shape for both roles.

Assignments sample distinct stage-one records per player; long tasks retain their complete stage count. The server's progress calculation excludes fake tasks entirely. After three seconds the server enters `playing` and starts the full kill cooldown. Clients discard private payloads for other rounds or inactive phases, and clear private knowledge on reset/leave. Any departure during reveal cancels it, clears assignments and unlocks the lobby. Reset clears the timer; a round-ID guard prevents stale transitions.

## Task framework — plan #10

`useTask { taskId, roundId }` validates a living, connected, non-vented player in `playing`, unfinished assignment and distance ≤80px from the current stage's station. Both real and fake assignments may open. The server replies privately with `taskOpened { taskId, roundId, token, durationMs }`. The actor's queued movement is flushed and new inputs are acknowledged without movement while their private session exists. No public task-session field reveals what station is being used.

`taskComplete { taskId, roundId, token }` repeats validation, requires the active single-use token and the per-type minimum duration from shared `taskDurationMs`: 8000ms for each data-transfer stage and 5000ms for each of the other seven mapped task types (including both fuel stages). It advances exactly one stage, updating private `taskList`, and returns `taskClosed { token, error? }`. IDs remain the original assignment ID; `step` and `room` change along the map's `nextTaskId` chain. Only fully completed real assignments contribute to `tasksDone` and aggregate `taskProgress`; intermediate stages do not. Duplicate, out-of-order, remote, stale, or impostor completions cannot advance tasks. The elapsed-time check is a minimum-duration guard, not proof that a modified client performed the puzzle actions. Puzzle interactions are client-side; the server remains authoritative for assignment, proximity, timing, stages and progress.

`cancelTask { token }` closes only the actor's matching session; `token: null` cancels the actor's pending open request in the same ordered connection. Cancellation preserves earlier stages. Reset/leave clears sessions; phase/life changes and expiry 60 seconds after the minimum-duration deadline end them. Only the owning client receives task events. The client freezes immediately while awaiting permission and keeps the modal open until completion is acknowledged. All eight minigames are implemented in #11/#12. Fake minigames send only cancellation when finished, never `taskComplete`; the server also rejects forged impostor completions, even with a valid session token. Fake stages and public task counts never advance.

## Impostor actions — plan #14

`kill { targetId, roundId }` and `vent { action: 'enter'|'move'|'exit', ventId, roundId }` reject malformed/extra fields, stale rounds, non-playing phases, dead/disconnected actors, crew actors and actors with an open task. Identity always comes from the authenticated connection. No client position, role, deadline or body ID is accepted.

A kill additionally requires a non-vented actor, an elapsed server kill deadline, and a living, connected, non-vented crew target within 60 world pixels with no wall intersecting the segment. Success teleports the killer to the victim, stops both, marks the victim dead, creates a public `Body { id, victimId, name, color, x, y }` in `GameState.bodies`, cancels the victim's task, flushes both movement queues, and restarts the configured cooldown. Bodies persist if their victim disconnects; reset/start/disposal clears them. No body contains killer identity or role. Reporting/removal during meetings and ghost play remain #16/#18.

`killed { roundId, victimId, bodyId, x, y }` is sent only to killer and victim after the state patch. The killer plays a short suit strike; the victim sees a brief signal-loss cut-in. Other observers see the visibility-gated body entity transition from defeat to lying pose, without receiving a global kill notification.

Vent entry requires distance ≤80px and a clear wall segment to a mapped vent. The server snaps to it and sets public `inVent=true`; movement inputs cannot move the actor. Travel requires a direct link from the server's private current vent ID. Exit requires that exact current ID, snaps to its coordinates and clears `inVent`. All clients immediately hide vented avatars; their public positions still synchronize under the existing party-game trust boundary. Roles themselves remain private.

`impostorStatus { roundId, killReadyAt, serverNow, ventId: string|null }` is private to the acting impostor, delivered after the corresponding state patch on play start and successful actions. Times are Unix milliseconds. The client converts the remaining server duration to its own clock, conservatively including network delay; server time alone authorizes kills. The private model survives closing/reopening the map and is cleared on reset/leave. Dead players cannot act or move until #18. No sabotage, reporting or automatic victory is implemented here.

## Movement — plan #7

Closed doors now participate in movement and action line-of-sight checks through shared `collisionMap`; the original open-door movement foundation below is extended by #15.

`input { seq, dx, dy }` submits one 50ms movement command. `seq` is a positive uint32 increasing within a connection; components must be finite and in [-1,1]. Extra fields, stale sequences, and invalid values are silently dropped. Clients never supply positions or elapsed time. Vectors longer than one are normalized; analog magnitude is retained.

The server consumes at most one command per player per 20Hz tick, with at most four queued commands. Overflow is dropped; the next consumed higher sequence acknowledges skipped commands as well. Missing input means no movement, so background tabs and disconnected clients cannot keep walking indefinitely. The client's pending prediction queue is bounded to two seconds. Sequence numbers persist across closing/reopening the map within the same connection.

Movement is allowed for connected, alive, non-vented players in `lobby` (shared walkaround) and `playing`. All other phases clear queued movement and acknowledge it without displacement. Input cannot cross a meeting/starting boundary for later replay. Spawn points are assigned on join and round start. Default speed is 200px/s. Players do not collide with one another; map walls and map bounds constrain a swept circle of radius 24. Doors remain open until sabotage implements closures. `src/movement.ts` is the shared deterministic collision implementation.

The own client predicts commands and replays only unacknowledged commands from authoritative coordinates; render frames fill the fraction between fixed input ticks. Remote players use a 100ms snapshot interpolation buffer and hold the latest sample when updates stall. Ghost movement is intentionally deferred to #18.

Readiness is advisory: the host may start with the required player count. Changing settings clears readiness. Two impostors require seven players to match the plan's balance guidance. Any departure during the reveal returns the room to the lobby. The host transfers to the earliest remaining joiner on leave or connection loss.

Room codes reserve five letters synchronously in the single Node process, excluding I and O. Codes are released on room disposal. A multi-process deployment would require a shared atomic reservation store; it is outside the locked hosting architecture.

## Vision — plan #13

Visibility is client presentation, not a server secrecy boundary: public positions are still sent to every client as the plan specifies. The private local role selects `crewVision` or `impostorVision` (unknown role conservatively uses crew). One vision unit is 650 world pixels. Starting/playing use wall-occluded sight; lobby and non-room previews are unrestricted. Remote entity containers and their labels are not rendered when their anchor lies outside the visible polygon. Future body entities must use `Renderer.setEntity` to inherit this rule. Ghost sight remains #18.

`Renderer.setVisionMultiplier(n)` accepts 0..1 for future crew lights dimming; impostor views bypass it. `setClosedVisionDoors(rectangles)` replaces extra opaque door rectangles without changing map walls. Neither hook implements sabotage or collision by itself; #15 must drive them, including reset to normal. No new network fields or messages were added.

## Sabotage — plan #15

`sabotage { kind, roundId, roomId? }` requires a living, connected, non-vented impostor in the current playing round with no open task/repair session. The server rejects extra fields and supplies all deadlines. Systems share a 30-second cooldown at play start and after repair; only one system fault may be active. Doors have a separate 15-second cooldown and can be used during a system fault. `roomId` is required only for doors. All mapped entrances to that room lock for 10 seconds; a living engineer intersecting any threshold prevents closure to avoid trapping an actor in collision geometry.

Public `sabotage` contains a monotonically increasing fault `id`, `kind`, `endsAt`, repaired `fixedPoints`, five current/target light switches, held panel IDs and aggregate hold progress. It never contains actor IDs, repair tokens or O₂ codes. Public `closedDoors` maps room IDs to Unix-ms expiry; `sabotageReadyAt`, `doorsReadyAt` and 20Hz `serverNow` drive clock-skew-safe HUD countdowns. Closed rectangles are shared by authoritative movement, client prediction, kill/vent/repair line of sight and renderer occlusion. Public geometry remains a presentation-level secrecy boundary as before.

`openRepair { pointId, sabotageId, roundId }` requires a living, connected, non-vented player of either role within 80px and clear sight of a matching unfinished panel. Only one task or repair may be open. Private `repairOpened { pointId, sabotageId, roundId, token, code? }` grants a 60-second session and includes a random five-digit code only for that O₂ panel. Opening flushes movement and freezes the actor server-side. `fixSabotage` repeats round/fault/actor/range/line-of-sight/session checks and requires those same IDs/token plus the appropriate action:

- `switch` + `switchIndex` 0–4: toggle one shared light switch. All five must match targets; crew vision is ×0.25 until repaired, impostor vision unchanged.
- `code` + five-digit `code`: restore this O₂ panel only. Both Scrubber and Cryo panels must finish before the 45-second deadline; leading zeroes are significant.
- `hold`: refresh a heartbeat. Reactor requires different players holding both Reactor Well panels for 3 continuous seconds; Comms requires one player holding Relay for 5 seconds. Clients refresh every 250ms; a gap over 800ms resets that player's hold. Public held points expose no player identities. Comms hides the task list and shared task bar, not task interactions themselves.
- `release`: interrupt the actor's hold without closing the panel. Blur, hidden tab, key/pointer release and cancellation stop client heartbeats. The server independently handles death, disconnection, range loss and expiry.

`cancelRepair { token }` cancels only the caller's matching panel; `null` cancels a pending ordered open. Private `repairClosed { token, error? }` ends the modal on completion, invalidation or reset. Timings/codes/switches are server-validated, unlike the client-side task puzzles. Kill/vent/task actions cannot be initiated with an open repair.

Reactor and O₂ expiry take priority over repairs at the exact deadline, set `phase='ended'`, `winner='impostor'`, `endReason='reactor'|'o2'`, clear faults/doors/sessions and freeze movement. `gameOver { winner, reason, roles }` is broadcast only after the ended state patch; full roles are never broadcast during play. The host can reset via `cancelStart`. Emergency requests are explicitly denied during these crises; actual meetings, reporting, remaining win conditions and the full end screen remain #16–#18.

## Reporting and meeting entry — plan #16

`report { bodyId, roundId }` requires a living, connected, non-vented player in the current playing round, without an open task/repair, within 100px of an existing body with a clear wall/closed-door segment. Either role may report; reports do not consume emergency allowance or wait for the emergency cooldown. Client F/touch Report also checks rendered visibility. As before, visibility is presentation, not a server secrecy boundary.

`emergency { roundId }` applies the same actor/session guards, requires distance ≤80px and clear sight to the mapped Commons button, rejects reactor/O₂ crises, and consumes one of `settings.emergencyMeetings` calls for that player. Public `Player.emergenciesUsed` resets per round; `GameState.emergencyReadyAt` is a server Unix-ms deadline 15 seconds after play start. `MeetingSystem.beginPlaying(now)` must also be called on #17's return to play; it sets a fresh 15-second deadline without resetting usage. Zero allowance disables calls, not reports.

Both requests reject extra fields and stale rounds. A crisis at or beyond its failure deadline cannot be interrupted by a report. A valid report before that deadline can save the station: meeting entry clears all active faults and doors, cancels all repair/task sessions (completed task stages persist), clears private vent records and all bodies, teleports everyone—including dead players without reviving them—to Commons spawn positions, and flushes movement. The first valid request atomically sets `phase='meeting'`; racing requests then reject without consuming another allowance.

`MeetingState` now includes a monotonic `id`, caller name/colour snapshot, reason, caller ID, optional reported body colour, and room name (or Station passage). The snapshot survives caller departure and contains no role or assignment. `meetingStart { roundId, meetingId, reason, callerId, bodyColor?, location }` broadcasts after the corresponding state patch, opening the intro even for players viewing the lobby. The client discards stale events and can reopen the current intro from synchronized state. Native dialog focus and the server phase prevent gameplay input; Back/Escape leaves the map view, not the room or meeting.

The #16 entry transition is now continued by #17 below. Host migration continues to expose reset to the current host. Reset clears meeting state and emergency usage/deadline.

## Meeting flow — plan #17

`MeetingFlow.prepare` starts discussion at entry using `settings.discussionTime`, then voting for `settings.votingTime`. Public `discussionEndsAt`, `votingEndsAt`, `phaseEndsAt` and `serverNow` drive countdowns. Zero discussion time opens voting on the next simulation tick (or a valid vote at the boundary). Action validation uses server time, never client countdowns. Movement stays frozen through meeting, voting and ejection.

`chat { roundId, meetingId, channel:'living', text }` requires the current meeting and a living, connected sender during discussion/voting, before the voting deadline. At most 200 UTF-16 code units, NFKC normalization, control/bidi character removal, trimmed nonempty text, a basic English whole-word profanity mask and one accepted message per second apply server-side. This is deliberately not comprehensive moderation. Public `MeetingChat { id, senderId, name, color, text }` history retains the latest 100 entries for the current meeting; dead players may read living chat but cannot send. Ghost-channel requests reject until #18. Clients render chat through `textContent`, not HTML. Private `chatAccepted { roundId, meetingId }` acknowledges sending; the client preserves drafts on rejection/timeouts and never clears a newer draft.

`vote { roundId, meetingId, targetId:string|null }` requires a living, connected player during voting, strictly before the deadline. `null` means Skip. A target must be living/connected. Exactly one immutable ballot per eligible player is stored in a server-private Map; only `meeting.voted` booleans synchronize before tally. Extra fields, unknown/dead targets, replayed ballots and stale IDs reject.

The server tallies when all connected living players have voted or time expires. Nonvoters count as Skip. Departed/disconnected voters are excluded; ballots aimed at no-longer-eligible targets become Skip. A unique highest candidate count must exceed both Skip and every other candidate; ties/skip-majority eject nobody. Ejection sets `alive=false` without creating a body. No general victory evaluation occurs until #18.

Public `voteResult` contains round/meeting IDs, counts, skipped, ejected ID/name/colour when applicable, and remaining impostor count. It includes voter-ID/target pairs only when `anonymousVotes=false`, and the ejected role only when `confirmEjects=true`. The remaining impostor count is always shown per the plan, so changes can indirectly reveal team membership even with confirmation disabled. No other role map is revealed. The sanitized result is serialized in `meeting.result` only at tally for reopening; the same payload broadcasts after the ejection patch. Client display uses numbered voter stamps when identities are enabled.

Ejection lasts six seconds: original engineer portrait drifts across a starfield, then role text (if enabled) and remaining count appear. Reduced motion keeps the figure stationary. On expiry everyone returns to Commons without resurrecting dead players; meeting/chat/ballots clear, play resumes, kill cooldown is reset with private action status, emergency cooldown is 15 seconds, and system sabotage cooldown restarts at 30 seconds. Dead players remain stationary until #18. Reset and disposal clear private flow state. Timers use the existing simulation interval, not extra orphanable timers.

## Colour accessibility

All twelve colours have a stable number and a name in the picker and player list; identity never relies on hue alone. Disabled/taken colours are greyed out and named as taken to assistive technology. Numbers use a constant high-contrast background. Browser review includes protanopia, deuteranopia, and tritanopia simulation. Some hue pairs can converge under these conditions, so keep the number/name identification in future player art and HUD work; do not claim twelve universally distinguishable hues.
