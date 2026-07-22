<h3>MeshCom mobile App</h3>

Works with nodes of the MeshCom Project <br>
Controlling, sending text and position messages <br>
Project Web Site: [MeshCom](https://icssw.org/en/meshcom-2-0-protokoll/)<br>
Project Firmware Source on [Github](https://github.com/icssw-org/MeshCom-Firmware)<br><br>

OE1KFR, Rainer<br>

<br>

---

### DL9SAU Fork

A fork of the MeshCom App with extra features and fixes — see the
**[Changelog](CHANGELOG-DL9SAU.md)** for what's different.

#### Connecting via Bluetooth — the BLE PIN (read this if it won't connect)

MeshCom uses **two different PINs**, which are easy to mix up:

- **Android pairing PIN** — the system Bluetooth dialog (OS-level bonding).
- **MeshCom BLE code** (`bt_code`) — a **6‑digit, app‑level** code the app sends to
  the node in its connection *hello*. **This is what actually authorizes the
  link** — unlike Meshtastic/Meshcore, where the pairing PIN is enough.

If the node has a BLE code set and the app doesn't know it, the node **connects
and then disconnects immediately** (log: `Sending Hello Msg to Node!` →
`disconnected without user action`).

**Fix:** enter the node's 6‑digit code under
**Settings → Custom BLE PIN (6 Digits)** — *not* in the Android pairing dialog —
then connect. The app then sends the hello *with the PIN hash* and the node
accepts.

Notes:
- After a **fresh install** the app's stored PINs are wiped — you may need to
  re-enter the BLE code once.
- After **changing** the PIN, if reconnect fails, **quit and reopen the app** once.

