---
target: Gameplay UI and UX
total_score: 23
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 4
timestamp: 2026-09-06T06-02-49Z
slug: packages-client-src-preview-mappreview-ts
---

# Gameplay UX assessment

Impeccable dual-agent source assessment, before implementation. No browser was available for rendered evidence. Primary target: `packages/client/src/preview/MapPreview.ts`, including its boarding, task and meeting surfaces. Mode: Operate.

The original station palette, original engineers, numbered colours, private assignments and explicit ballot confirmation give this game a coherent identity. The main opportunity is reducing competition between accumulated HUD panels and the playable world.

| Heuristic           | Score / 4   | Evidence                                                                  |
| ------------------- | ----------- | ------------------------------------------------------------------------- |
| Status visibility   | 2           | Landscape hides action feedback; recovery banner persists.                |
| Real-world match    | 3           | Room names, original station instruments and crew actions are meaningful. |
| Control and freedom | 2           | Host reset immediately ends everyone's round.                             |
| Consistency         | 3           | Station palette, native dialogs and numbered colours are consistent.      |
| Error prevention    | 2           | Reset and leave lack a second deliberate action.                          |
| Recognition         | 2           | Task locations must be memorized and found on an unrelated map.           |
| Efficiency          | 3           | Keyboard shortcuts and touch action controls exist.                       |
| Minimalism          | 2           | Independent fixed panels compete for phone space.                         |
| Recovery            | 2           | Hidden errors make failed actions appear unresponsive.                    |
| Help                | 2           | Generic task-completion feedback does not guide the next stage.           |
| **Total**           | **23 / 40** | Baseline source assessment, not a post-change usability score.            |

## Requested fixes

- Reduce phone crowding with compact navigation, mutually exclusive Map/Tasks disclosures, a narrower action grid and a smaller boarding surface. Move Sound into Room options; preserve saved audio controls.
- Prevent mobile viewport zoom, including repeated taps, while preserving native scrolling and simultaneous joystick/action inputs.

## Five additional priorities implemented

1. **P1: Task navigation and progress.** The task disclosure counted all assignments and required players to remember destinations. Each unfinished task now opens its private destination on the map; multi-stage markers follow the current station, finished tasks disappear, remaining count is explicit and completion feedback names the next room. Markers clear outside play and during comms sabotage. Approach: clarify/adapt.
2. **P1: Mobile meetings.** Ten 72px player tiles preceded chat in the single-column phone layout. Chat and Vote views now share a persistent phase/timer area, preserve drafts, expose unread messages and retain selection plus confirmation. Desktop keeps both columns. Approach: adapt.
3. **P2: Boarding readiness.** The walkable lobby did not show who was ready without leaving the scene. A collapsed crew roster now shows named/numbered players, host, ready and reconnect states, plus connected readiness totals. Launch eligibility remains authoritative and readiness remains advisory. Approach: clarify.
4. **P1: Visible feedback.** Landscape CSS hid all action paragraphs, including errors. A compact dismissible status area now preserves the original live status nodes; phase changes hide it and changing input mode restores original owners. Reconnection success clears after four seconds. Approach: harden.
5. **P1: Accidental round loss.** The host reset button appeared before the meeting and immediately sent a reset. Host tools now sit behind a disclosure after the meeting. Reset and leave explain the consequence, focus the safe choice, and require explicit confirmation. Reset callbacks reject stale local round identity. Approach: harden.

## Personas and cognitive load

- First-time player: no longer needs to memorize the relationship between an assigned task and a tiny map label. Larger optional map exposes destination and local-position symbols; other players are absent.
- Phone player: chat is available immediately during discussion. Map and Tasks occupy the same information area one at a time; action buttons retain 64px targets.
- Host: readiness is visible in the boarding scene. An accidental reset tap cannot silently discard the round.

The main emotional low points were getting lost after completing a task and receiving no visible response to a failed action. Both now have direct continuation or recovery feedback.

## Mechanical evidence and remaining checks

The baseline detector reported one warning: `border-accent-on-rounded` at `tasks/minigames/minigames.css:79`. It is the cap on a sample-vial instrument, a contextual false positive preserved intentionally. The changed UI surface scan returned no findings.

DOM interaction tests cover gesture cancellation without swallowing taps, readiness and reconnection, confirm/cancel/Escape, mobile feedback and disclosure/input cleanup, ten-player meetings with draft/unread/ballot behavior, and private multi-stage task markers. These tests do not render CSS or emulate browser zoom.

Physical iPhone Safari/Android acceptance remains: 360px portrait and short landscape layouts, repeated-tap/pinch/input-focus zoom, scroll and keyboard behavior, joystick plus simultaneous action, task/map sheets, ten-player chat/voting and ghost overlays. A real two-game playtest should assess whether the navigation aid reduces wandering and whether the compact controls remain discoverable.
