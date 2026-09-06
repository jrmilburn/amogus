# Compact station and room themes

User-requested interlude after #14; #15 sabotage is not implemented by this work. Impeccable extends the established cold-metal station identity through original code-native atlas artwork rather than a replacement visual world.

## Scale

World dimensions changed from 14,400 × 12,400 to 10,800 × 9,300. Room/hallway dimensions and travel distances are 25% smaller, floor area 43.75% smaller. The outer route is 30,600px / 200px/s = 153s, down from 204s. Avatar size, movement speed, collision radius, action radii and vision radii are unchanged. Task chains, vent networks, door openings, connected floors and spawn clearance remain validated. Stores' ID station moved slightly to avoid overlapping its vent.

## Room vocabulary

| Room         | Equipment and task relationship                                                                                 |
| ------------ | --------------------------------------------------------------------------------------------------------------- |
| Archive      | Three banks of labelled files plus server storage; access-code and data-upload instruments                      |
| Relay        | Alignment dish and downlink racks; gyro alignment, data download and comms panel                                |
| Cryo Lab     | Three occupied stasis pods with frosted glass; specimen bench, records terminal and oxygen equipment            |
| Engine House | Ribbed propulsion unit, piping, valve and fuel tanks; power routing and fuel delivery                           |
| Stores       | Provisions shelving, three spare engineer suits and reserve tanks; fuel collection, ID reader and duct cleaning |
| Scrubber     | Twin filter columns, gauges and cleaning trolley; air reclamation and specimen checks                           |
| Commons      | Mess tables, food provisions, original assembly ring and emergency button; crew access terminal                 |
| Switchyard   | Breaker banks and service channels; power routing, load records and lights panel                                |
| Dock         | Suit issue and supply racks; entry ID reader and alignment instrument                                           |
| Reactor Well | Recessed containment core; paired reactor controls and duct maintenance                                         |

`roomThemes.ts` owns per-room floor tint, equipment placement, purpose lettering and task textures. Fixtures retain at least 90px from task/vent/panel/spawn footprints and stay inside their room bounds. As in #6, room dressing is non-colliding presentation, not additional furniture physics or vision occluders. Frozen engineers are anonymous decoration, never network players or bodies. Static atlas sprites reuse existing culling and lighting; there are no per-prop animation loops.

## Minimap

Native **Station map** disclosure below the top-left location. It opens initially on large/tall screens and starts folded on smaller ones. Shows public room/corridor geometry and one local-position dot, never remote players, bodies, task assignments or vent networks. The plain-text location remains accessible. A resize observer positions the task disclosure below it; small portrait layouts also move the task progress bar. On short screens an expanded map temporarily hides assignments—fold the map to restore them. Character rehearsal omits the minimap; free-camera preview shows camera position.

## Verification

- Map validation, floor/wall equivalence, full simulated walking circuit, open-route reachability, closed dead-end doors and multiplayer/gameplay regressions pass.
- New tests verify room-specific artwork survives clearance filtering, atlas texture availability, station/vent separation and minimap projection.
- Built and inspected [ten room contact sheets](../maps/room-theme-review.png) using the actual atlas frames and fixture data; individual cards are under `docs/maps/rooms/`. These omit lighting, actors, room floor lettering and HUD, and are not browser screenshots. Regenerate after `pnpm --filter @mutiny/client assets` with `node --import tsx scripts/render-room-review.ts`.
- Impeccable detector returned no findings. Independent finishing review corrected narrow-landscape progress-bar overlap and movement-key handling after toggling the map.
- Browser inventory is empty. Live minimap text/resize/focus, mobile controls, room-art/character/lighting composition and GPU frame-budget acceptance remain pending. Restart dev and refresh/rejoin all clients when changing map geometry or atlas contents.
