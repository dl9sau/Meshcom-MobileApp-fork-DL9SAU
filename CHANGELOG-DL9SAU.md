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
- **The block filter now works in group channels.** Group messages carry
  `isDM=1` internally (their destination is a group number, not a broadcast
  `*`), which made the message filter skip them entirely — only ALL/broadcast
  was ever filtered. Call *and* text filters now work in every channel; personal
  DMs and your own messages stay exempt.

### Features

**Chat**
- **Compact one-line message header** (now the **default**): `sender (via …) ·time`,
  DMs also show the recipient. Toggle back to the legacy multi-line header in
  *Settings → Chat Display*.
- Configurable **block filter** for channel messages — block by **callsign** or
  **text pattern**: `Wort` (whole word), `^start`, `end$`, `*wild*card`
  (case-insensitive, UTF-8/emoji aware). Manage in *Settings → Message Filter*,
  or use quick **Filter Call / Filter Message** on a message (press again to
  remove). Blocked messages also raise no notification.
- **Reply** (channel): prepends `CALL: ` of the referenced sender into the input.
- **Resend** for your own *unacknowledged* messages — sends directly, no retype.
- **🌐 via Gateway** marker: messages that already travelled via an MQTT gateway
  (header byte 6, bit `0x80`) are flagged in the chat bubble.

**Map & Heard**
- Node detail overlay reworked: **Age**, **Dist** (km to you), **SNR/RSSI** (for
  directly heard nodes), **Hops**, **Path** (origin dropped, wrapped after 2
  calls, `direct` for direct nodes), and **#pos / #msg** counters. Empty sensor
  values (0 / n.a.) are hidden.
- **Relay-neighbour count** fallback shown as `≈N` when the firmware reports 0.
- Tab renamed to **"Heard Direct Nodes"**.

**Settings**
- Clearer *GPS-Position* button labels: **GPS-Chip**, **SmartBeaconing (track
  on) / Fixed Pos Interval (track off)**, **Send POS LoRa-APRS**, **GPS-Status**.

**App / Build**
- App version shows the fork id + short git hash: `4.27-DL9SAU-g<hash>`.
- GitHub Actions workflow builds a debug APK and publishes it as a **prerelease**
  named `Meshcom-<version>-DL9SAU-g<hash>.apk`.
- Real MeshCom icon generated in CI + fork app name **"MeshCom DL9SAU"**.

### Fixes

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

### Known / parked (planned DB redesign)

- Persist runtime-only data across restarts (hops/path, Mheard table).
- DM tab: show only *your* DMs with a toggle for "all DM traffic" (monitoring).
- Per-category, configurable message/position retention (ALL short, personal DMs
  long, `0 = unlimited`).
