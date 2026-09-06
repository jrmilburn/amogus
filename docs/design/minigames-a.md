# Minigames, batch A — #11

Impeccable extends the existing station modal with four code-native instruments, not a replacement visual identity. Cable ferrules and curved SVG leads use four colours plus matching A1–D4 labels. Six capped specimen vials match racks by readable labels rather than hue. The gyro uses a linear needle and a labelled mint lock band. Archive terminals show source → destination and an eight-second native progress bar. No raster art or external assets are needed for these interactive instruments.

`createTaskGame()` selects the game by private assignment type. All implement `TaskMinigame.mount(container, onComplete)` / `unmount()`. Esc/×, movement freeze, acknowledgement and stage persistence remain in `TaskController`.

- Power and samples: pointer capture, visible drag token, hit-tested drops, edge scrolling in short modals. Click/tap or keyboard select-then-place is equivalent. Wrong matches preserve correct ones; completed matches cannot count twice. Targets are at least 48px tall, labelled and focusable.
- Gyro: three successful centre crossings, one hit per pass. Normal first three centre opportunities occur around 1.2/3.6/6 seconds. Reduced motion slows the essential instrument sweep to 1.8/5.4/9 seconds; decorative animation is absent. Visible lock count and live zone text supplement the band.
- Data: Start explicitly begins an eight-second transfer at each station. Download completion updates the private assignment to the upload room. Cancelling upload does not erase download. A complete two-stage assignment necessarily exceeds 16 seconds plus travel; the 5–15-second target is per station interaction, not the entire long task.
- All batch A clocks pause when hidden/unfocused and cap time jumps after stalls. Rapid matching waits for the five-second procedure floor before submitting; there is no invented incremental server progress. Typical 5–15-second completion is a design target pending real playtests.

Every game accepts a `TaskSoundHook`; the controller emits bubbling `mutiny:task-sfx` with `{ taskType, cue }` for pick/connect/reject/lock/transfer-start/complete. These are audio integration hooks, not shipped sounds; #19 owns playback. Unmount aborts listeners, clocks, resize observers and callbacks.

The server validates the session token, stage, location, life/role and per-type minimum time. It does not verify individual matching/gyro inputs against a modified client; this remains a party-game trust boundary.

Verification: deterministic matching, gyro pass/spam, transfer start/duration/reset and active-clock tests; all four server types tested at duration boundaries and assignment stages; existing five-client completion integration retained. Impeccable review added drag edge scrolling. The detector flagged the specimen cap's thick top border as a card-accent pattern; retained intentionally because it draws a vial cap, not a card. No browser is available (`apps: [], browsers: []`), so actual mouse/touch/keyboard completion, pointer capture, cancellation/reopening, screen-reader timing, narrow layouts and completion-time acceptance remain pending.
