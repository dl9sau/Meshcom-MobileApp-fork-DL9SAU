# Backlog — DL9SAU Fork

Gesammelt aus den Tests vom 2026-07-31 / 08-01 (inkl. `tmp-2026-08-01-scrollverhalten.txt`).
Reihenfolge innerhalb der Blöcke = grober Vorschlag, nicht fix.

---

## A · Chat / Scrollverhalten

> **Status: Build 1 gebaut (6906b13)** — A1 ✅, A5 ✅, A6 ✅, A2 ✅ (als Teil von A5:
> nach dem Entfernen des Markers wird wieder ans Ende gepinnt), A4 ✅ (Pixel-Rechnerei
> entfernt). **A3 offen** — sollte durch A5 verschwunden sein, im Test verifizieren.

**A1 — `scrollToBottom()` cached ein totes DOM-Element** *(Bug, klein)*
`bottomRef.current` wird nur neu geholt, wenn es `null` ist. Ersetzt React den Knoten
(z. B. nach 11 neuen Nachrichten), zeigt der Ref auf einen abgehängten Knoten →
`scrollIntoView` ist ein No-Op → „Button gedrückt, nichts passiert".
Fix: Sentinel-Element aufgeben, stattdessen `el.scrollTop = el.scrollHeight`.

**A2 — Marker-Entfernung verschiebt das Layout** *(Bug, klein)*
Beim Aufholen verschwindet der Marker → Inhaltshöhe schrumpft → man ist nicht mehr ganz
unten → Button kommt zurück, zweiter Druck nötig. Fix: beim Entfernen die Scrollposition
um die Marker-Höhe kompensieren (oder nur entfernen, wenn er außerhalb des Sichtfelds ist).

**A3 — Zwei Klicks bei Autoscroll EIN, einer bei AUS** *(Bug, Ursache offen)*
Kandidaten: (a) Zähler wird in beiden Modi an unterschiedlichen Stellen geleert,
(b) während Tap 1 trifft eine neue Nachricht ein, der Divider wandert, Tap 2 zielt erneut
auf ihn. Live nachstellen.

**A4 — Pixel-Arithmetik auf Nachrichtenhöhen ist grundsätzlich falsch** *(Design)*
Header kann mehrzeilig sein (langer Path), Schriftgrößen unterscheiden sich. `PEEK = 48px`
und Verwandtes fallen mit A5 weg. Nur elementbasiertes Scrollen.

**A5 — Neues Scroll-/Marker-Konzept** *(groß; ersetzt A2–A4 teilweise)*
Geltungsbereich: **ich stehe ganz unten**. (Hochgescrollt bleibt wie heute: Position gewinnt.)

| | Autoscroll **EIN** | Autoscroll **AUS** |
|---|---|---|
| neue Nachrichten | Marker setzen, **weiter folgen** | Marker setzen, **mitscrollen** … |
| … bis der Marker oben rausliefe | **Marker löschen**, nicht neu setzen | **Stopp**, Marker bleibt **oben** stehen |
| Scroll-Button | **keiner** (verdeckt nur Nachrichten) | **ja, mit Zahl** |

Button-Verhalten (AUS bzw. EIN-nach-Hochscrollen):
Tap 1 → erste neue Nachricht, Marker ganz oben. Tap 2, 3 … → **seitenweise** weiter,
**Zahl bleibt stehen**, Marker markiert weiter die Grenze (Kontext beim Zurückscrollen).
Am Ende angekommen → normale Regeln je Einstellung.
Offen: Button **erscheint**, sobald Neues unterhalb der Falz liegt; Zahl = Neue unterhalb
der Falz bei Erscheinen, danach **eingefroren** (wächst bei weiteren Ankünften).
Kein Idle-Kriterium mehr nötig — der Marker im Auto-Modus verfällt von selbst und ersetzt
damit den Nutzen der früheren Away-Erkennung (Light-Sleep-Fall).

**A6 — DM-Tab: gelb (Filter aktiv) verdeckt grün (neue Nachricht)** *(klein)*
Vorschlag: erst dunkleres Grün probieren; sonst Blinken gelb↔grün ~1 s (nicht flackern).

---

## B · Korrektheits-Fixes (klein, isoliert)

> **Status: Build 2 gebaut** — B1 ✅ B2 ✅ (a71f6ba), B3 ✅ B4 ✅ B5 ✅ (c633483).
> Beide Commits sind **offline gegen den echten Code verifiziert** (Typen mechanisch
> gestrippt, auf blankem node laufen lassen — nichts installiert): 25 + 14 Prüfungen grün.
> Offen aus B2: Rückfrage zu Beispiel 1 (`130` → `116` Zeichen) — Regel ist unabhängig
> davon umgesetzt („ein Token, das in ein Paket passt, wird nie zerschnitten").

**B1 — Filter: unsichtbarer Variation-Selector U+FE0F** *(Bug, verifiziert reproduziert)*
Regel mit `☀️` (VS16) matcht Nachricht mit `☀` (ohne) **nicht**. Umgekehrt schon.
Satzzeichen-Bezug: sobald im Muster direkt hinter dem Emoji ein Zeichen steht (`.` `,`),
bricht das dazwischenliegende VS16 den Treffer.
Fix: vor dem Vergleich **beide Seiten** `normalize("NFC")` + `︎️` entfernen
(nur fürs Matching). ZWJ **nicht** anfassen (Familien-Emoji).
Dazu: `compilePattern` verwirft bei Regex-Fehler die Regel **still** → Log-Zeile.

**B2 — Auto-Split zerhackt lange Wörter (URLs)** *(Bug)*
Regel: **ein Token, das in ein Paket passt (≤ 150 − Tag), wird nie zerschnitten** —
schlägt „balanced". Notfalls unbalanciert oder Token allein in ein Paket.
(Rückfrage zu Beispiel 1 in den Notizen: `esFolgen130Zeichen` → `esFolgen116Zeichen` —
Tippfehler oder beabsichtigtes Kürzen?)

**B3 — Mheard-Tab zeigt weiter die alte, vermischte „Neighbours"-Zeile** *(Inkonsistenz)*
Dort steht in Wahrheit unser **Heard-via**. Die Trennung aus `MapOverlay` (033d90b)
portieren: `Neighbours` (Adjazenz + advertised) und `Heard via` als zwei Zeilen.

**B4 — „(max n)" immer anzeigen**, auch wenn max == Session *(klein)*
Sonst ist `advertised 9` nicht mit `2` vergleichbar (dn9whv-11).

**B5 — Eigener Call fehlt in den Nachbar-Sets** *(klein)*
Wir stehen nicht im Pfad, sind aber Nachbar direkt gehörter Knoten. Außerdem erzeugen
0-Hop-Empfänge gar keine Adjazenz. Erklärt zu niedrige Zahlen.

---

## C · Statistik-Ausbau (MY STATS)

> **Status: Build 3 gebaut (f239bff)** — C1 ✅ C2 ✅ C4 ✅, C3 ⚠️ *eingeschränkt*.
> „(max)" gibt es nur für **unique Calls** (aus der DB, retention-begrenzt) — bewusst
> **ohne** Kategorie-Aufteilung, weil direct/hf/gw eine Eigenschaft **eines Empfangs**
> ist, nicht einer Station (dieselbe Station kann heute direkt und morgen über ein
> Gateway kommen). Für **#pos gibt es gar keinen** all-time-Wert: `Positions` hält
> **eine Zeile je Station** (Update), nicht eine je Bake.
> Offline verifiziert (14 Prüfungen grün).

**C1 — Calls aufschlüsseln**
`Calls: 21 (max 42), direct 5 (max 7), via HF 10 (max 11), via GW 15 (max 16)`
Session + all-time aus DB.

**C2 — Deduped-Paketzähler nach Kategorie**
Summe `direct / via HF / via GW`, dazu **#pos** und **#msg** getrennt, plus
**Channel-Nachrichten vs. mitgehörte DMs** (Relation der Pakettypen).
Sanity-Check: `#pos via GW` muss 0 bleiben (Positionen sind HF-only).

**C3 — Session + „(max n)" aus DB** überall wo sinnvoll.

**C4 — Platzierung**: MY STATS in **Info**, Kasten unter „Sensors" (thematisch stimmig).
Alternative/zusätzlich Mheard-Tab zum Vergleich mit den Direktnachbarn.

---

## D · Neue Auswertungen

**D1 — Gateway-Registry (ohne Firmware-Änderung)**
| Fall | Schluss |
|---|---|
| kein GW-Bit | reines HF — sicher |
| GW-Bit, Hoplänge 1 | digi1 **ist** Gateway — sicher |
| GW-Bit, Quelle nicht HF-bestätigt | internet-eingespeist ⇒ digi1 ist Gateway |
| GW-Bit, Quelle HF-bestätigt | ging HF; irgendein Digi ist GW — unbestimmt |
Ergebnis: `GW x (max y)` (direkt / via-hop); speist auch die Weltkugel.
Grundlage: Server **strippt** den Pfad (Feldbeobachtung DL9SAU) → vorderer Pfadteil
`quelle,digi1,digi2` enthält **nur HF-Digis**.

**D2 — „Heard via" für **alle** Knoten verallgemeinern**
Bisher nur Last-Hop. Im Pfad `ORIGIN,…,X,…,LASTHOP` gilt: alles **vor** X kam durch X.
Ergibt „wie wichtig ist der Knoten fürs HF-Netz" (z. B. dn9whv-11).
Vorbehalt dokumentieren: Bias — wir sehen nur Pfade, die **uns** erreichen.

**D3 — HEY-basierte Zuverlässigkeits-Quote** *(geht heute schon!)*
`updateMheard()` schickt bei **jedem RF-Empfang** ein MH-JSON mit `PLT` (Pakettyp) und
`PL` (Pfadlänge). HEY = `PLT 64`, festes Intervall **15 min**, **nicht** von Smart-Beaconing
betroffen.
- `PLT=64` **und** `PL` = direkt → **eigene HEY-Bake** des Nachbarn ⇒ Loss-Quote `n/m`
- `PLT=64` **und** `PL>0` → er hat **fremde** HEYs weitergeleitet ⇒ Relay-Aktivität
Vorbehalt: HEY hat Priorität BACKGROUND → Lücke kann senderseitig sein.

**D4 — Positions-Quote nur wo sinnvoll**
Nicht den 30-min-Default annehmen, sondern das **tatsächliche Intervall pro Knoten** aus
den Abständen schätzen (niedriges Perzentil — verpasste Baken verlängern Lücken nur).
Bei hoher Streuung (Smart-Beaconing, GPS-Jitter) statt Prozentzahl „unregelmäßig" zeigen.

**D5 — HF-Erkennung über Pfadvergleich**
Stimmt der Pfad einer eingehenden Textnachricht mit dem letzten **bekannten HF-Pfad**
desselben Absenders überein → echt HF, trotz GW-Bit. Cache pro Absender aus Positionen
**und** bereits als HF entschiedenen Textnachrichten (nicht nur letzte Position).
Schneller Pfad zuerst, sonst die aufwendigere Kette.

**D6 — Calls unter den Positions-Markern auf der Karte** (iOS zeigt es, Android nicht).
Ggf. erst ab einer Zoomstufe, damit es nicht zumüllt.

---

## E · Firmware-Wünsche an Rainer / icssw

Alle an Stellen, wo die Firmware die Information **bereits hat**:

1. **`"SRC"` (Ursprung) ins MH-JSON** — heute nur `CALL` = letzter Hop. Mit dem Ursprung
   bestätigen wir HF über **4 Hops** (HEY-Reichweite) statt 2 (Positions-Reichweite).
2. **`"GW"` ins MH-JSON** — die Firmware kennt es bei jedem HEY (`H` vs `HG`).
   Damit Gateways **gesichert** statt geschätzt.
3. **HEY-Link-Kette durchreichen** (RSSI/SNR je Hop) — heute wird nur der Nachbar-Count
   extrahiert, der Rest verworfen. Würde das **schwache Glied** einer Strecke zeigen.
4. Ältere Wünsche: `pong` → BLE (RTT), FW-Build-Datum im Info-JSON, `tx-repeated` /
   MQTT-Durchsatz / Airtime-Zähler.

---

## F · Verifizierte Firmware-Fakten (nicht neu herleiten)

- **RX-Dedup by msg_id** vor Weitergabe an die App → App sieht **unique** Pakete, nie
  Luftschnittstellen-Kopien. „Pakete auf Luft / Retransmissions" ist app-seitig unmöglich.
- **GW-Bit = Byte6 `0x80` = `msg_server`** (Loop-Schutz). Gesetzt nur beim **Relayen**
  (`bGATEWAY && node_hasIPaddress`) und beim **Einspeisen aus dem Internet**;
  `initAPRS` setzt es für **selbst erzeugte** Pakete auf `false`. ⇒ **gw=0 ⇒ sicher HF.**
- **`0x20` = `msg_app_offline`** = „nicht announcen" (gepuffert / Internet / Kommando-
  Antworten). Kein Gateway-Indikator; App nutzt es nur für Notify.
- **Positionsbake-Felder**: ATXT, `/B= /A= /P= /H= /T= /O= /F= /Q= /G= /N<n> CO2 /V= /Y=`.
  **Kein GW-Flag.** `/N` nur mit Ziffer **1–9** → „0 Nachbarn" wird gar nicht gesendet.
- **HEY (`@`, 0x40)**: alle Knoten, alle **15 min**, Priorität BACKGROUND,
  Ziel **`H`** bzw. **`HG` (Gateway)**. Payload `R<ncnt>;`, jeder Relay hängt
  `<ncnt>,<rssi>,<snr>;` an. Läuft mit **`max_hop_text` (Default 4)**, nicht mit dem
  Positions-Limit (2). Wird **nicht** an die App durchgereicht.
- **Mheard ist RF-only**: `updateMheard` nur aus `lora_functions.cpp:649`, nie aus dem
  Internet-Pfad ⇒ jeder MH-Eintrag ist Beweis für einen HF-Empfang.
  MH-JSON: `TYP CALL DATE TIME PLT HW MOD RSSI SNR DIST PL MESH NCNT` (CALL = letzter Hop).
- **Nachrichten sind im Knoten nur RAM** (`ringBuffer[MAX_RING]`, 10–30 Slots), kein Flash.
  Persistiert werden nur Mheard (SD), Zeit (SPIFFS), Settings (NVS). Das Archiv ist die App-DB.
- **Baken-Intervalle**: `POSINFO_INTERVAL` 30 min, `HEYINFO_INTERVAL` 15 min.
- **Server ist Blackbox** (closed source) — er **strippt den Pfad** beim Verteilen
  (Feldbeobachtung). Der hintere Teil `>xxx,DEST` behält dagegen den HF-Teil vor dem Gatewayen.
