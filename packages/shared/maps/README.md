# The Hollow map data

`the-hollow.json` is the canonical, original layout for plan #5. It is an orthogonal derelict station with a perimeter loop, a central cross-station route, two hub rooms (Commons and Switchyard), and two dead-end rooms (Archive and Reactor Well). It contains ten rooms, ten spawns, eighteen task stations, nine vents in three reciprocal networks, twenty doors, six sabotage panels, and two camera positions.

## Shape and exports

Import `MapDefSchema`, the inferred `MapDef` type, and geometry helpers from `@mutiny/shared/maps`. The JSON is also exported as `@mutiny/shared/maps/the-hollow.json`. Keeping this separate from the shared root entry prevents the lobby from loading map validation or map data before it needs them.

- Coordinates are world pixels with origin at the top-left; x increases right, y increases down. Map bounds are 10,800 × 9,300 after the user-requested compact pass. Camera facing uses radians.
- `rooms[].polygon` contains simple orthogonal vertices with no repeated closing vertex. Room IDs are the location/sabotage references; names are display text.
- `corridors[]` is an intentional extension to the plan: explicit rectangular floor footprints for the renderer. Floor is the union of room polygons and corridors. Everything else, including the central void and outside hull, is solid.
- `walls[]` is the generated, merged rectangle complement of the floor footprints. The current layout needs 32 collision rectangles. Outer world bounds must also constrain movement.
- `doors[]` stores room IDs and rectangles at each room opening. Open doors are absent from static collision. Closed doors must be added to collision by #15. The data includes every walking entrance, so locking a dead-end room actually seals it.
- `tasks[]` covers all eight planned minigames. Short tasks have `stage: 1`. Long tasks have separate station records, with a stage-1 `nextTaskId` pointing to a stage-2 station in another room. Assign only stage-1 records in #9; second-stage records are destinations, not additional assignments. Three long assignments are available (two data transfers and one fuel trip).
- `sabotagePoints[].kind` identifies exactly one each of lights, reactor A/B, O2 A/B, and comms. Reactor panels share Reactor Well; O2 panels are separated between Scrubber and Cryo Lab.
- `reviewCircuit` is a closed centre-line route for measurement and review only. It is not gameplay navigation data.

## Scale and balance

The perimeter centre line is 30,600 px, or **153 seconds (2m33s)** at the current default 200 px/s. The compact pass reduces world dimensions and travel distances by 25% (floor area by 43.75%) while preserving the topology. This supersedes the original #5 circuit-duration target at the user's request. Corridors are now 270px wide; ring/dead-end rooms are 1,050 × 750px and hubs are 1,200 × 1,050px. These are uninterrupted travel measurements with doors open, not a game duration. Validation and reachability tests retain the **24px collision radius** and unchanged player artwork size.

Central shortcuts create two smaller walking loops. Archive and Reactor Well each have one walking entrance and a vent escape for impostors. Commons contains the emergency button and a circle of ten non-overlapping spawns. All task IDs/chains and vent links are preserved. The Stores ID reader was moved away from its vent to retain clear instrument spacing after compaction.

## Edit and review

```sh
pnpm map:walls
pnpm map:render
pnpm test
```

Edit the JSON's rooms, corridors, fixtures, or circuit first. Regenerate walls after changing floor footprints. `map:walls` validates the input's structure, derives collision, then runs full semantic validation before writing. `map:render` validates again and writes `docs/maps/the-hollow.png` plus its SVG source. Both tools accept an optional input JSON path; the renderer also accepts an output PNG path.

The PNG is a technical collision diagram, not final game art. Its dark areas are solid collision/void, dashed blue route is the measured circuit, and dotted plum lines show vent links. The client renderer and texture atlas arrive in #6 and must use `/impeccable` for their visual direction.

Tests check references, reciprocal vents, task containment, collision consistency, circuit clearance/duration, all fixtures' reachability from Commons, and closed-door isolation of the two dead ends. The flood fill uses an 80px grid with radius clearance and no diagonal steps; it is a regression check, not a replacement for #7 movement/playtesting.
