# Impostor actions — #14

Existing station HUD extension using Impeccable; no new visual identity or generated artwork. Coral Kill and cold-metal Vent join amber Use in the bottom-right action cluster (each 80×64px). Private fake assignments stay red. A coral footprint identifies the currently actionable target; names/colour numbers remain the identity cues.

- Q / Kill: nearest eligible crew member within 60px, clear wall segment and elapsed server cooldown. Seconds replace the shortcut while waiting. Target and reason are included in the accessible label. No killer identity is broadcast to observers.
- V / Vent: enter within 80px; Exit replaces Vent underground. Linked destinations use direction arrows plus room names in a scrollable panel. Map instructions and the task disclosure yield to vent navigation. The camera snaps across distant vent travel, and crew never render vented avatars.
- Fake task: E / Use opens the assigned minigame with a red Fake task title and explicit cover-only copy. Finishing sends cancellation, not task completion. No fake stages advance.
- Death: a short local suit lunge marks a confirmed kill; a 2.2-second signal-loss cut-in informs the victim without trapping focus or blocking Back. Reduced motion disables the cut-in reveal and suit lunge. The map location retains “You were killed” afterward. Body entities reuse original #8 defeat/body art and #13 visibility gating; reopening the map shows existing bodies without replaying their deaths.
- Requests disable conflicting actions, expose errors and time out after five seconds. Closing removes listeners, graphics, UI and timers; private cooldown/vent knowledge stays with the room connection.

## Verification and remaining acceptance

Automated coverage includes server phase/role/life/range/wall/cooldown/link/token guards, body creation/reset, valid fake opens with rejected completions, and five real clients exercising private delivery, kills, victim task cancellation, vent travel and immobility. Client tests cover stale private action messages and clock skew; existing character/lighting tests cover body animation and visibility geometry.

The mechanical detector returned no findings. Independent Impeccable source review prompted excluding vent-route controls from movement key capture, preserving native keyboard scrolling. Browser automation inventory is empty, so screenshots, rendered desktop/360px/short-landscape layout, keyboard focus through vent travel, touch targeting, animation timing, screen-reader announcements and GPU frame-budget checks remain manual acceptance work. Source review is not a substitute for those checks.

Next gameplay milestone: #15 sabotage. Reporting, meetings, victory and ghost movement are not part of #14; the host can still reset via Back → Return everyone to lobby.
