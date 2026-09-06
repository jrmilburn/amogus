# Engineer characters — plan #8

The articulated engineer extends The Hollow's cold metal and amber equipment. Separate helmet, shoulder yoke, arms, trousers, and heavy boots create a humanoid silhouette distinct from the rounded crewmate archetype. The 128px standing figure uses a 160 × 160 frame with transparent padding; its feet sit at (80, 144). The collision radius remains 24 world pixels.

The source artwork and exact generation prompt are in [the engineer art folder](../../packages/client/art/engineer/README.md). The built-in ImageGen tool produced the raster parts; the local builder crops, neutralizes suit colours, poses the rig, and packs the frames. This is a reproducible build from checked-in artwork, not a runtime image-generation dependency.

## Animation contract

| Clip       | Frames | Playback     | Use                                                       |
| ---------- | -----: | ------------ | --------------------------------------------------------- |
| Idle       |      4 | 3 fps, loop  | Breathing while stationary                                |
| Walk       |      8 | 12 fps, loop | Opposing arm/leg motion; rate follows speed setting       |
| Enter vent |      6 | 12 fps, once | Crouch/compress/disappear; explicit presentation API      |
| Exit vent  |      6 | 12 fps, once | Emerge into idle; public visibility resumes after exiting |
| Killed     |      8 | 10 fps, once | Non-graphic collapse into the body pose                   |
| Ghost      |      4 | 3 fps, loop  | Floating upper suit; explicit future ghost presentation   |
| Body       |      1 | Hold         | Tinted upper suit lying on its side                       |

Each clip has three synchronized layers: `pack`, `suit`, and `visor`. `CharacterView` uses three Pixi `AnimatedSprite`s driven by the owning renderer's ticker, with no independent global ticker subscriptions. Only `suit` receives the player colour. Reduced motion holds looping clips at the first frame and advances one-shot effects to their final state. Closing the scene destroys sprites and labels while preserving shared atlas textures.

Names and stable colour numbers remain upright when the rig flips, with a minimum 12px screen-space font size as the world view shrinks. A constant dark badge gives the number contrast across all twelve colours; names have a dark outline. An ellipse anchors the standing character to the floor. All colours were inspected against the station floor in [the lineup](../art/engineer-lineup.png); names/numbers remain essential when colour vision differences make hues converge.

`Walkaround` drives idle/walk, facing, death/body transitions, and vent visibility from player state. Venting players are immediately hidden from the public view. `CharacterView.play()` exposes the complete art set for future actions; vent entry and ghost gameplay are not implemented by this milestone. Ghosts are never automatically shown to living players.

Red impostor names require private `roleReveal` knowledge. The client keeps the viewer's role and teammate IDs outside shared state, clears them on return to the lobby, and uses `knowsImpostor()` to decide whether a name is red. No role field is added to public `Player`. The server assigns roles privately in #9.

## Rehearsal and verification

Open `http://localhost:5173/?view=characters` for a local rehearsal with all twelve colours on the actual map. Select a clip and use **Replay animation** for one-shots. The last six characters face left. Portrait phones use three columns to make room for readable labels. This viewer creates no multiplayer room and shows no real players or roles. It shares the existing map viewer's loading, retry, camera controls, Back/Escape, and portrait guidance.

The asset builder also produces [animation contact sheets](../art/engineer-animations.png). Automated tests check layered frame counts, atlas padding, grayscale suit pixels, coloured glass, tint separation, synchronized playback, state transitions, reduced motion, private name colouring, and preservation of cached textures. Browser/device playback and mobile visual acceptance remain pending because no browser automation surface was available in this session.
