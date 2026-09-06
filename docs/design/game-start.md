# Game start — #9

Existing-world extension using Impeccable: large private role lettering leads the three-second reveal, with mint Crew / coral Impostor accents in the station's cold-metal palette. Role words carry meaning independently of colour. Fellow impostor names appear only to impostors. The server controls the transition; the visible countdown is informational, not authority.

On play, a compact native details disclosure retains the role and personal task destinations. It starts expanded on wide screens and collapsed on phones, scrolls at short heights, and supports keyboard focus. The reveal animation respects reduced motion. It truthfully labels fake tasks and explains that interactions/actions are deferred. Back/Escape preserves the connection; the host can reset everyone from the lobby shell.

Private assignments live only in the connection's RoundInfo, not synchronized state or storage. Round IDs reject stale messages. Start/reset clear movement queues while retaining input sequence monotonicity. Roles and long-task assignments originate on the server. Kill cooldown starts at full when the reveal ends.

The user requested a faster default: 200px/s replaces 160px/s. The authored 40,800px circuit now takes about 204 seconds rather than 255; collision geometry remains unchanged.

Verification: automated real-client start/privacy/phase/reset tests and private model tests. Browser automation is unavailable in this session: actual reveal timing as seen after asset loading, desktop/mobile layout, touch controls, and screen-reader announcements require browser/device acceptance. A slow first asset load can consume part of the server's reveal window; the persistent assignment retains the role afterward. This is not yet a complete playable round: #10 adds task interactions; later issues add kills and victory conditions.
