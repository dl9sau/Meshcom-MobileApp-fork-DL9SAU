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

### Features

**Chat**
- **DM tab shows only your own DMs** by default (to/from you). A *Settings →
  Chat Display* toggle reveals all overheard DM traffic (monitoring).
- **Compact one-line message header** (now the **default**): `sender (via …) ·time`,
  DMs also show the recipient. Toggle back to the legacy multi-line header in
  *Settings → Chat Display*.
- Configurable **block filter** for channel messages — block by **callsign** or
  **text pattern**: `Wort` (whole word), `^start`, `end$`, `*wild*card`
  (case-insensitive, UTF-8/emoji/multi-line aware). Works in the **ALL/broadcast
  channel and every talk group**; **personal DMs and your own messages are never
  blocked**. You can add **any number of rules — one per line** — in the callsign
  and text fields separately. Manage in *Settings → Message Filter*, or use quick
  **Filter Call / Filter Message** on a message. (Removing a rule is done in
  Settings — a blocked message is hidden and can't be long-pressed.) Blocked
  messages also raise no notification.
- **Reply** prefills a compact reference into the input:
  - channel, others' message → an **`@call1, @call2: ` mention list** (press
    Reply on several messages to reference multiple people; deduped, so replying
    twice to the same call never repeats it);
  - channel, your own message → **`[HH:MM] `** (time only, no self-mention);
  - DM (your own or the partner's) → **`[HH:MM] `** (recipient is already clear).
  The same timestamp is never stacked twice — tapping Reply on one message again
  adds nothing; only referencing a *different* message adds another `[HH:MM]`.
- **Tap** (short press) a DM message to **prefill the To-Callsign** with the
  conversation partner (their call if they wrote it, the recipient if you did).
- **Resend** for your own *unacknowledged* messages — sends directly, no retype.
- **🌐 via Gateway** marker: messages that already travelled via an MQTT gateway
  (header byte 6, bit `0x80`) are flagged in the chat bubble.

**Map & Heard**
- Node detail overlay reworked: **Age**, **Dist** (km to you), **SNR/RSSI** (for
  directly heard nodes), **Hops**, **Path** (origin dropped, wrapped after 2
  calls, `direct` for direct nodes), **#pos / #msg** counters and — for directly
  heard nodes only — the **Neighbours** count (`current (max N)`, same as the
  Heard list). Empty sensor values (0 / n.a.) are hidden.
- **Relay-neighbour count** fallback when the firmware reports `NCNT = 0`: shows
  the nodes relayed via that neighbour as **`current (max N)`** — the live count
  for this session plus the all-time total, which is reconstructed on startup from
  the stored positions so a restart no longer drops it to a low value (`≈N` when
  the two are equal).
- Tab renamed to **"Heard Direct Nodes"**.

**Settings**
- Clearer *GPS-Position* button labels: **GPS-Chip**, **SmartBeaconing (track
  on) / Fixed Pos Interval (track off)**, **Send POS LoRa-APRS**, **GPS-Status**.
- **Node UTC-Time-Offset: "From phone" button.** Instead of typing the offset by
  hand (and forgetting to change it at the DST switch — a manual `1` in summer put
  every node time 1 h off), one tap fills it from the phone's own time zone, which
  already reflects the current location *and* daylight saving, then sends it to
  the node.

**App / Build**
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

### Fixes

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

- Message filter: optional **per-channel scope** (block weather in ALL but allow
  it in a dedicated weather channel).
