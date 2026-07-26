# Changelog — MeshCom Mobile App (DL9SAU Fork)

Fork of the official MeshCom App (based on **4.27**). This file documents the
changes of this fork relative to upstream. The in-app version shows
`4.27-DL9SAU-g<hash>`.

## 4.27-DL9SAU (work in progress)

### ⭐ Important fixes

- **DM recipient is now shown.** Received direct messages display
  `sender → recipient`, so you can immediately tell whether a DM was actually
  addressed to you or just overheard — the DM tab also surfaces DMs sent to
  other stations. Previously only the sender was shown, which made foreign DMs
  look like they were meant for you.
- **Chat scrolling & long-press feel right now.** The message menu now opens
  **while the finger is still held** (native long-press feel, ~0.5 s) instead of
  only reacting on release — the old behaviour felt laggy and confusing. A finger
  move cancels the gesture, so scrolling never accidentally opens the menu.
- **VIA-routed messages are sorted correctly now.** Firmware **4.35p** (Jul 2026)
  added a *route-via-a-specific-node* feature: such messages carry a destination of
  the form **`>VIA-node,target`** followed by `:` (text) or `!` (position) — e.g.
  `OE1KFR-7>OE1KFR-1,*:hi` = a **broadcast via OE1KFR-1**. The **last segment is the
  real target** (`*` = broadcast, a number = talk group, else a recipient callsign);
  the VIA node(s) before it are routing. Our parser used to read the whole field, so
  a **broadcast landed in DMs** and a **DM addressed to you wasn't recognised as
  yours** (it vanished under *Hide others' DMs*). Now the **last segment decides**
  (handling both the `:` and `!` separators), and the VIA node stays visible in the
  *via* line in **[brackets]**, set apart from the actual RF relays
  (`🌐 via [OE1KFR-1] → DB0FRI-12`). As 4.35p spreads, these become common. (The
  upstream app fixed the same thing independently — same approach; it drops the VIA
  node from the display, we keep it bracketed.)

### Features

**Chat**
- **Green "unread" dot on the Chat tab icon.** When a genuinely new message
  arrives while you're on another tab (Settings, Map, Mheard …), the bottom Chat
  icon gets a small green dot so you notice something's up — **regardless of
  whether that channel is muted or only beeps**, and **including the channel that
  happens to be the selected segment** (you're not actually looking at it while on
  another tab). It stays on as long as **any** channel is still unread (has a green
  segment marker) and only turns off once **all** channels are read; it mirrors the
  in-chat green segment markers exactly.
  **Not** shown for discarded channels or filter-blocked messages (an @mention of
  you still counts), and **never** triggered by the startup DB-fill — only real
  new live messages.
- **DM tab shows only your own DMs** by default (to/from you). Long-press the DM
  tab → *Show others' DMs* to reveal all overheard DM traffic (monitoring).
- **Compact one-line message header** (now the **default**): `sender (via …) ·time`,
  DMs also show the recipient. Toggle back to the legacy multi-line header in
  *Settings → Advanced Settings* (a **Message header: compact/legacy** button —
  compact is the blue default).
- Configurable **block filter** for channel messages — block by **callsign** or
  **text pattern**: `Wort` (whole word), `^start`, `end$`, `*wild*card`
  (case-insensitive, UTF-8/emoji/multi-line aware). Works in the **ALL/broadcast
  channel and every talk group**; **personal DMs and your own messages are never
  blocked**. You can add **any number of rules — one per line** — in the callsign
  and text fields separately. Manage in *Settings → Message Filter*, or use quick
  **Filter Call / Filter Message** on a message. (Removing a rule is done in
  Settings — a blocked message is hidden and can't be long-pressed.) Blocked
  messages also raise no notification. **Optional per-channel scope** as the first
  field of a rule (backward compatible — no prefix = all channels): `#ALL` / `#*`
  (only broadcast), `#262` (only TG 262), `#ALL,262` (those two), `#!60` (all but
  TG 60). E.g. `#!60 *Wetterbericht*` blocks "Wetterbericht" everywhere except the
  weather TG 60.
- **Allow list (whitelist) in addition to the deny rules.** A separate *Allow*
  field (same text notation + `#scope`). If a channel has any allow rule, **only**
  messages matching one are kept, and an **allow match wins over a deny** — so
  `#60 *wetter*` keeps "Wetterbericht Berlin" in TG 60 even with a global deny
  `*etterb*`. Check **sequence: callsign-deny → allow → text-deny** (callsign-deny
  runs first, so it stays the escape hatch to drop a spammer inside a whitelisted
  channel). `*` in Allow also passes all **content** (`*` = everywhere, `#60 *` =
  only TG 60) without deleting rules — but this bypasses only the text filters; the
  callsign-deny still runs first. Stored alongside the deny rules (`ftype='allow'`
  in the MsgFilters table).
- **Master on/off switch for the whole filter** (*Settings → Message Filter*, top).
  Off shows **everything** — callsign-deny, allow and text-deny all bypassed — with
  no rule deleted; flip it back on and your rules are exactly as before. (Unlike the
  `*`-allow trick this also turns off the callsign blocks.) Persisted as
  `filtersEnabled`; the chat view refreshes immediately on toggle.
- **Per-channel notifications & visibility — long-press a channel tab.** One
  in-app menu per tab (All, DM, each talk group), so it works the same on Android
  and iOS with nothing stuck in the OS. A one-time hint points out the gesture.
  - **Notification level per channel** — `disabled` / `sound` / `sound and banner`.
    On Android these route to two OS notification channels (a *sound* one and a
    *sound + pop-up* one) you can further tune in Android settings; iOS has no
    channels, so it offers only `disabled` / `sound`. Muting keeps the green
    new-message indicator; a small **🔔** marks the tabs that notify. Quiet by
    default: **only DMs (and @mentions) notify**, ALL and talk groups are off until
    switched on. **DMs and @mentions always use "sound and banner".**
  - **Discard** (All / a talk group) — **hides** that channel's messages **and**
    its green indicator + beep, without de-configuring it; the tab is dimmed and
    the 🔔 is hidden (discard overrides notify).
  - **DM notifications are a tri-state**: **none / my DMs (and mentions) only /
    all DMs and mentions** (the last also beeps for overheard DMs).
  - **@mention notifications.** When someone mentions your callsign in a channel
    (`@DL9SAU`, `@DL9SAU:`, `@dl9sau-12`, case-insensitive, anywhere in the text),
    it **beeps through the channel's mute/discard** — a mention has priority. It's
    governed by the DM setting above (silent only when that's *none*), so there's
    no extra channel menu item to fiddle with.
  - **DM tab: "Show others' DMs"** (monitoring) lives here now (an **👁** marks
    it) — moved out of *Settings → Chat Display*. Your own DMs are always shown.
  - DMs and mentions match your **base callsign with any SSID** (`DL9SAU`,
    `DL9SAU-12`, `DL9SAU-13` all count as you) — senders may not know which device
    you're on, and you may run several.
  - **Mention in a discarded channel is surfaced.** A message that @mentions you
    stays **visible** (and gives the green new-message marker) even in a channel
    you've discarded — it already beeps, so instead of a ping with nothing to show,
    you can see who mentioned you. The channel's other messages stay hidden.
  - If you're **already viewing that channel** (app in front, chat open, same
    tab), a would-be *banner* notification never pops up — and if you've **touched
    the app within the last 30 s** you're clearly watching, so it stays **fully
    silent**; only if the app has just been sitting open (idle ≥ 30 s) does it
    play a **sound** to catch your eye.
  - **Notifications no longer pile up.** Each channel keeps a **single** entry in
    the notification shade — a new message **replaces** the previous one instead of
    stacking dozens of old ones. Coming back to the app **clears** the shade, and
    **viewing a channel clears that channel's** entry (you've just read it).
- **Reply** prefills a compact reference into the input (mention style follows the
  widespread **MeshcomWebDesk** web interface — `@call text`, **no colon**):
  - channel, one other person → **`@call [HH:MM] `** (mention + that message's
    time); referencing **more people** turns it into an **`@call1, @call2 `
    mention list** and drops the time (a shared timestamp across time-distinct
    messages is meaningless). Deduped — replying twice to the same call never
    repeats it;
  - channel, your own message → **`[HH:MM] `** (time only, no self-mention);
  - DM (your own or the partner's) → **`[HH:MM] `** (recipient is already clear).
  The same timestamp is never stacked twice — tapping Reply on one message again
  adds nothing; only referencing a *different* message adds another `[HH:MM]`.
- **Tap** (short press) a DM message to **prefill the To-Callsign** with the
  conversation partner (their call if they wrote it, the recipient if you did).
- **Resend** for your own *unacknowledged* messages — sends directly, no retype.
- **🌐 via Gateway** marker: messages that already travelled via an MQTT gateway
  (header byte 6, bit `0x80`) are flagged in the chat bubble. The marker now has a
  **nuance**: a gateway sets the bit on ~everything it relays, so it can't tell
  "reached me via internet" from "gatewayed upstream but I heard it on HF". If the
  whole message path (sender + via relays + VIA node) is in your **recent HF
  horizon** (sender heard directly, or every path node seen on HF in the last 24 h),
  the globe is shown **dimmed** — very likely local despite the bit. Solid globe =
  bit set and path not confirmable as local; no globe = definitely local (bit unset).

**Map & Heard**
- **Booked talk groups per node** (`Grp: 232, 2321`) — the talk groups a node has
  subscribed to (from the firmware `R=` field) are shown in the **map node overlay**
  and the **Mheard list**, and persist across restarts (ported from upstream: a
  `groups` column on Positions, mirrored into the runtime store like hops/path).
- Node detail overlay reworked: **Age**, **Dist** (km to you), **SNR/RSSI** (for
  directly heard nodes), **Hops**, **Path** (origin dropped, wrapped after 2
  calls, `direct` for direct nodes), **#pos / #msg** counters and — for directly
  heard nodes only — the **Neighbours** count (`current (max N)`, same as the
  Heard list). Empty sensor values (0 / n.a.) are hidden.
- **Relay-neighbour count** fallback when the firmware reports `NCNT = 0`: shows
  the nodes relayed via that neighbour as **`current (max N)`** — the live count
  for this session plus the all-time total, which is reconstructed on startup from
  the stored positions so a restart no longer drops it to a low value (`≈N` when
  the two are equal). The firmware neighbour count now has **two sources** — the
  Mheard `NCNT` and the position `N` field — and the **larger value wins** (before
  the relay fallback kicks in).
- **Full hop path on the map.** The map's line toggle (FAB) now draws, when a
  node is selected, that node's **whole route** as a line — `you → neighbour → …
  → origin` (green), instead of only the line to your direct neighbour. Hops with
  an unknown position are **bridged with a grey dashed segment**. The map
  **auto-fits** to the path (nodes at `0.00/0.00` are treated as unknown, so they
  never distort the zoom). With no node selected the toggle still shows the
  neighbour overview. Clicking a node re-targets the line to it (updates live as
  new packets change the route), and closing the info card keeps the line so it
  no longer hides the hops. While a path is shown the info card is **compact**
  (Age, Dist, Lat/Lon, Alt, Hops, Path, Close — plus **SNR/RSSI for a direct
  link**) to free up the map.
- Tab renamed to **"Heard Direct Nodes"**.

**Settings**
- **GW TGs (last 24h) hint** above the group slots: a merged, numeric, ascending
  list of the talk groups other nodes have broadcast in the last 24 h — a discovery
  aid (esp. for newcomers) to pick which TGs to subscribe to. Read-only; never
  touches your slots.
- **Node command console** (*Advanced Settings*): send a raw **`--command`** to the
  node like the web/serial CLI — one free field (`--` is prepended if you omit it).
  The node's `--…` reply is shown below with a green ✓, or *no response* on timeout.
- **Message header chooser moved** to *Advanced Settings* as a button
  (**compact** = blue default / **legacy** = outline), out of the old *Chat Display*
  section.
- Clearer *GPS-Position* button labels: **GPS-Chip**, **SmartBeaconing (track
  on) / Fixed Pos Interval (track off)**, **Send POS LoRa-APRS**, **GPS-Status**.
- **Node UTC-Time-Offset: "From phone" button.** Instead of typing the offset by
  hand (and forgetting to change it at the DST switch — a manual `1` in summer put
  every node time 1 h off), one tap fills it from the phone's own time zone, which
  already reflects the current location *and* daylight saving, then sends it to
  the node.
- **Group Subscription labels (memory aid).** Each slot now accepts an optional
  text label after the number, e.g. `262 DL` or `9 local (rf-only)` — a reminder
  of what a talk group is. **Only the number is ever sent to the node**; the label
  is stored app-locally **keyed by TG number** (not per slot), so it never attaches
  to the wrong group when a slot changes. A label **sticks to its number**: it
  survives slot changes and is restored when you re-enter that number. Typing just
  the number (e.g. `9`) **keeps** its label; `9 -` **clears** it; Reset wipes all.
  Empty slots show example placeholders (MeshCom TG numbers): `9 local (rf-only)`,
  `20 DACH`, `262 DL`, `232 OE`. (Labels are device-local — the firmware has no
  label field.)
- **Repurposing a group slot clears its old messages.** Changing a slot to a
  *different* number (e.g. `20` → `21`) or setting it to `0` deletes the previous
  TG's stored messages — they were received under the old number and are stale for
  that slot. A pure **label change** (same number) keeps the messages; a slot swap
  (a number that just moves to another slot) keeps them too.

**App / Build**
- **Background notifications via an Android foreground service.** So the app keeps
  processing messages and firing notifications while backgrounded (otherwise Android
  freezes the WebView JS and nothing arrives until you reopen), a foreground service
  is started while the BLE node is connected — shown by a quiet persistent
  notification. It uses the **`location`** service type (honest: MeshCom already uses
  GPS for position beaconing, so this also keeps beaconing alive in the background).
  No separate permission prompt is needed — Android already requires the location
  permission for **BLE scanning**, so the app can't connect without it anyway; the
  foreground service simply reuses that existing grant (**no tracking**). Built on
  the MIT-licensed
  `@capawesome-team/capacitor-android-foreground-service` plugin; a hand-written
  native Kotlin service is envisioned later to be independent of external licenses.
- **Capacitor 8** (upgraded from 7, aligned with upstream) — new SDK/plugin baseline.
- App version shows the fork id + short git hash: `4.27-DL9SAU-g<hash>`.
- GitHub Actions workflow builds a debug APK named
  `Meshcom-<version>-DL9SAU-g<hash>.apk`.
- **Stable debug signing** (committed keystore): a new build **installs over the
  previous one without uninstalling** — the database and BLE PIN are kept.
- **Single rolling release** at a fixed `wip-latest` tag: always the newest build,
  at a stable link, so the Releases list can't show a stale build on top (GitHub
  sorts that list by tag name, not by date). The git hash stays in the APK name
  and release title.
- Real MeshCom icon generated in CI + fork app name **"MeshCom DL9SAU"**.
- **About / Open Source Licenses** on the Info tab: author credit
  (*Thomas Osterried DL9SAU &lt;dl9sau@darc.de&gt;*), links to the fork, the
  upstream app (rainerfritz), the MeshCom project and the MIT firmware, plus an
  attribution note for the bundled free/open-source libraries (fulfilling the MIT
  notice duty).

### Fixes

- **Notifications were silent.** The Android channel referenced a bundled custom
  sound (`morse_r.wav`) that never made it into the build, so the channel was
  created without a sound — and channel settings are immutable once created. The
  channels are now recreated (fresh ids) using the **default notification sound**,
  so notifications actually beep. Also: a proper **white notification icon** (the
  logo silhouette) is generated in CI, replacing the generic "i" fallback.
- Message action menu: **Direct Message is greyed out on your own messages** (you
  can't DM yourself; on a group message it used to prefill the group number).
  **Copy Text** moved further down, below the primary actions.
- Map overlay: the **Close** button is now shown in the collapsed ("Less")
  state too, not only when expanded.
- Map overlay: **buttons (Close / More / DM) now react on the first tap.** The map
  was treating a touch on the card as the start of a pan and swallowed the click
  (the button flashed but nothing happened, often needing 2–3 taps). The overlay
  is marked `pigeon-drag-block` / `pigeon-click-block`, and the buttons detect the
  tap themselves on `touchend` (with a small movement tolerance) instead of
  relying on the browser's flaky synthesized click on a small target.
- Connect: after changing the BLE PIN on a connected node (`--btcode`), show a
  hint to close/reopen the app if reconnect fails (the node needs a moment to
  apply the new code, which an immediate reconnect can race).
- Chat: dropped the redundant origin (sender) from the `via:` path — it equals
  the from-call already shown, so only the intermediate hops are listed now.
- Message filter: Unicode-aware whole-word boundaries (patterns starting/ending
  with punctuation or containing umlauts/emoji now match correctly); trim the
  callsign before the block-list lookup.
- Mheard: `Dist: -1` (firmware "unknown" sentinel) → `n.a.`; `#pos` and `#msg`
  aligned on one row.
- Build: declared the missing **date-fns** dependency; added the missing
  **BPIN** default in `ConfigObject`; use **JDK 21** (Capacitor 7 requirement).

**Storage / persistence**
- The **Heard list** and per-node **hops/path** now **survive an app restart**
  (new Mheard table; hops/via columns on Positions) instead of being lost.
- **Configurable retention per category** (*Settings → Data Retention*, days,
  `0 = unlimited`): ALL/broadcast, talk groups (TGs), *DMs: for me*, *DMs: others*,
  positions (map) and the Heard list — each with its own value. Saving prunes
  immediately. Own callsign is persisted so DMs for me can be told apart from
  others'. Positions are kept **7 days** by default (a week-long trip keeps all
  collected map nodes), while the Heard list and others' DMs stay at **2 days**
  so they reflect what's heard *now*.

### Known / parked

- **Background notifications** need an Android foreground service (BLE + message
  processing keep running when the app is backgrounded) — planned, not yet built.
  Until then, notifications fire only while the app is in the foreground.
