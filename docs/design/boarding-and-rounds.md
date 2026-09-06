# Boarding and round presentation

Mode: Operate for the waiting room; Experience for the short role/result moments. This extends the established station UI and original engineer artwork, without replacing the entry design or exposing private roles.

Role reveal: a private assignment unseals around the player's own numbered engineer portrait. Mint crew and coral impostor text preserve the existing palette. A 700ms clipped portrait reveal and 650ms settling text fit inside the unchanged server countdown. Late portrait loading still receives its entrance. Reduced motion removes animation; role/team text and countdown stay available without art.

Result: personal Victory/Defeat leads the winning team's real engineer portraits, with a capped stagger (65ms per player, at most 455ms) and a 650ms arrival. All roles remain in the existing disclosure. Actions are immediately available; no celebration loop, new dependency or second WebGL context. Portrait extraction failures leave names and results readable.

Waiting room: compact dedicated boarding space, auto-opened after joining. Suit racks and benches reuse the station atlas, with ten spawn positions and server-authoritative movement. No tasks, vents, sabotage or emergency interaction exists here. Invite, Ready and host Start stay in reach; Room settings returns to the existing customization/settings interface. Start eligibility matches the main lobby. Clipboard fallback excludes reconnect tokens.

Lifecycle: changing between lobby and active phases closes the old scene, disposes controllers/listeners and opens the appropriate map. Start uses existing station spawns; reset revives players and returns them to boarding spawns. The existing map preview outside a room remains available.

Acceptance: automated geometry, wall containment, synchronized movement, start/reset, privacy and gameplay regressions; source review for focus, reduced motion and controls. Live desktop/mobile rendering, actual animation smoothness and keyboard/touch transitions still require browser/device checks.
