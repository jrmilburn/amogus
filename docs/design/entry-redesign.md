# Entry and waiting-lobby redesign

Status: approved concept B implemented. Mode: Operate.

Confirmed: separate Create/Join paths, optional colour selection, direct invite-link joining and clearer waiting lobby. Preserve existing station identity, game rules, private information and reconnect behavior.

Candidate structures, in task-resonance order:

1. Centered embarkation: two clear entry choices resolve into one compact form; lobby puts invitation before roster.
2. Split console: context/engineer on the left, one active entry form on the right; lobby gives invite controls their own side column.
3. Mode switch: labelled Create/Join navigation above one form; lobby keeps room code and primary action in a stable top band.
4. Invitation ticket: task form and room identity share one vertical ticket; lobby expands the ticket into a crew manifest.
5. Expanding entry rows: Create/Join rows expose only the selected form; lobby follows an invite/crew/settings sequence.
6. Preparation rail: persistent context rail beside current entry task; lobby rail changes into invitation and start guidance.

User selected B, top-rail boarding: two equal mode controls above one centered entry form; room code beside Copy invite in the lobby; crew before collapsed profile/settings; launch guidance below. This user choice supersedes the initial seed assignment. PR #1 was merged; this implementation branches from updated origin/main.

Surface seed `8ec60478`, six candidates: assigned structure 6, preparation rail. Keep its persistent context and one active task; compare left-rail, top-rail and compact bottom-action staging in visual comps. The catalog's x-ray and patch-graph staging adds irrelevant mechanics; finite inventory could represent seats but must not imply users can manipulate other players. None improves entry clarity over the preparation rail. The seed script printed a complete deterministic result but exited with a Windows libuv cleanup assertion; no design dependency is missing.

Comps were previews, not implemented screenshots. Built-in image generation compared composition only. Text fields, controls, roster data and accessibility are semantic HTML/CSS, not rasterized UI. No invented ruleset selector, map choice or player actions were imported from the comp. Existing station palette and numbered colours are preserved.

Verification: automated entry-presentation and lobby-launch regressions cover manual/invite joining, explicit create mode, loading/retry, code validation, minimum players and disconnected crew. Browser inventory is empty in this environment; rendered desktop/mobile, keyboard and real invite-link acceptance remain pending.

Finish review: removed the duplicate visible form heading and welcome description, collapsed empty status spacing, and tightened mobile spacing. The user subsequently renamed the game to Theimposterissus, with that exact capitalisation; displayed branding and current product/design documentation follow it. Internal workspace package names and preference keys are unchanged for compatibility. All 93 tests, typecheck, lint and production build pass; the existing build advisories remain.
