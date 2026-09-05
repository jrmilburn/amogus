# Shared state and protocol

The source of truth is `src/state.ts`, `src/protocol.ts`, and `src/settings.ts`. Both client and server import from `@mutiny/shared`; do not redefine payloads in either package.

## State and privacy

`GameState` contains public players, room code, phase, settings, optional meeting/sabotage, aggregate task progress, and an optional winning team. Positions use world pixels; `lastProcessedSeq` is the acknowledgement reserved for movement reconciliation in #7. Absolute timer fields (`*EndsAt`, `endsAt`) use Unix milliseconds. Settings durations use seconds; vision values are multipliers and player speed is world pixels per second.

`Player` intentionally excludes the proposed public `role` field. `PrivatePlayerState` describes server-held role/task data; `roleReveal` and `taskList` must be sent only to the appropriate player. Never synchronize a role map before game over. Meeting state exposes only whether a player voted; vote targets stay private until the tally. The future anonymous-vote reveal must omit voter identities. Undecorated fields are not synchronized; an integration test verifies that even a server-attached role does not reach clients.

Shared uses `@colyseus/schema` 4.x for plan #3 and Zod for the map validator in #5. The latter is exposed through the separate `@mutiny/shared/maps` entry. This explicitly supersedes #1's runtime-free constraint. Decorators are compiled in shared with `experimentalDecorators: true` and `useDefineForClassFields: false`. Ship its compiled output to consumers.

## Messages

The complete payload definitions and identity maps of message names are in `src/protocol.ts`. An empty request is `{}`; no request can specify its own actor ID. The server always uses the authenticated session ID.

Implemented in the lobby:

| Request          | Payload                       | Authority                                                                          |
| ---------------- | ----------------------------- | ---------------------------------------------------------------------------------- |
| Room create/join | `JoinOptions { name, color }` | Validated before joining; a taken colour is reassigned to the first free colour    |
| `updateProfile`  | `{ name?, color? }`           | Own profile, lobby only; at least one field; taken colour rejects the whole update |
| `ready`          | `{ ready: boolean }`          | Own readiness, lobby only                                                          |
| `updateSettings` | `Partial<SettingsValues>`     | Host only, lobby only; whole patch validated before applying                       |
| `start`          | `{}`                          | Host only; 4+ players, or 7+ with two impostors                                    |
| `cancelStart`    | `{}`                          | Host only in `starting`; temporary return action until #9 implements the game loop |
| `error` (server) | `{ code, message }`           | Human-readable rejection, sent privately to the requesting client                  |

`input`, task interactions, kills, vents, sabotage/fixes, reports, emergency calls, chat, and votes have typed payloads but are not implemented yet. The current room rejects them explicitly. Other server events (`roleReveal`, `taskList`, `killed`, `meetingStart`, `voteResult`, `gameOver`) likewise describe the contract for future issues and are not emitted by the lobby.

Readiness is advisory: the host may start with the required player count. Changing settings clears readiness. Two impostors require seven players to match the plan's balance guidance. Losing enough players during the temporary starting phase returns the room to the lobby. The host transfers to the earliest remaining joiner on leave or connection loss.

Room codes reserve five letters synchronously in the single Node process, excluding I and O. Codes are released on room disposal. A multi-process deployment would require a shared atomic reservation store; it is outside the locked hosting architecture.

## Colour accessibility

All twelve colours have a stable number and a name in the picker and player list; identity never relies on hue alone. Disabled/taken colours are greyed out and named as taken to assistive technology. Numbers use a constant high-contrast background. Browser review includes protanopia, deuteranopia, and tritanopia simulation. Some hue pairs can converge under these conditions, so keep the number/name identification in future player art and HUD work; do not claim twelve universally distinguishable hues.
