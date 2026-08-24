# PR-Entwürfe für die MeshCom-Firmware (icssw-org)

Vier eigenständige PRs gegen **`dev`**, jeder für sich mergebar. Reihenfolge ist bewusst:
der Fix zuerst, dann die kleinen Ergänzungen, das Längenthema zuletzt.

Hausordnung des Repos (`CLAUDE.md` dort): gegen `dev`, vorher rebasen, **minimale
Änderungen ohne Refactorings**, Beschreibung **auf Deutsch** und **vor** dem Absenden
verfasst. Vor jedem Absenden einmal `pio run`.

Ablauf je PR (kein `gh` nötig):
```bash
git fetch origin dev
git switch -c <branch> origin/dev
# ändern, bauen, committen
git push -u fork <branch>
```
dann `https://github.com/icssw-org/MeshCom-Firmware/compare/dev...dl9sau:MeshCom-Firmware:<branch>?expand=1`

Achtung: PR 2 und 3 fassen denselben `mhdoc`-Block an (**beide** Fundstellen, Zeile ~331
und ~633). Sobald einer gemergt ist, brauchen die anderen `git rebase origin/dev` —
trivialer Konflikt, aber er kommt.

---

# PR 1 — `fix/mheard-ble-buffer-guard` *(fertig, Commit liegt vor)*

**Titel:** Mheard-JSON: Puffergröße an `serializeJson()` übergeben statt der gemessenen Länge

## Was geändert wurde

`src/mheard_functions.cpp`, zwei Stellen — sonst nichts:

1. in `updateMheard()`, beim Senden des MH-Datensatzes an die App (~Z. 344)
2. in der Ausgabe der gespeicherten Mheard-Liste (~Z. 648)

An beiden Stellen bekommt `serializeJson()` jetzt die **Größe des Zielpuffers**
(`sizeof(bleBuffer)-1`) statt der gemessenen JSON-Länge (`measureJson(mhdoc)+1`), und die
**Rückgabe** von `serializeJson()` — die tatsächlich geschriebene Bytezahl — wird für die
Sendelänge verwendet.

```c
-    serializeJson(mhdoc, bleBuffer+1, measureJson(mhdoc)+1);
-    addBLEOutBuffer(bleBuffer, measureJson(mhdoc)+1);
+    size_t json_len = serializeJson(mhdoc, bleBuffer+1, sizeof(bleBuffer)-1);
+    addBLEOutBuffer(bleBuffer, json_len+1);
```

## Warum

`serializeJson(doc, buffer, size)` versteht `size` als **Kapazität** des Puffers und
schreibt höchstens so viele Bytes. Übergeben wurde bisher `measureJson(mhdoc)+1`, also die
**benötigte** Länge — damit ist die Grenze wirkungslos: Wird das JSON größer als
`MAX_MSG_LEN_PHONE` (300), schreibt `serializeJson()` über `bleBuffer` hinaus. Das ist ein
Stack-Puffer in `updateMheard()`, und die Funktion läuft bei **jedem** empfangenen Paket.

Heute geht es gut: ein MH-Datensatz liegt bei etwa 150 Zeichen, also rund der Hälfte des
Puffers. Diese Reserve ist aber nicht zugesichert — ein langes Rufzeichen, ein `DIST`-Wert
mit vielen Nachkommastellen oder ein später ergänztes Feld verschieben sie. Der Fehler wäre
dann kein abgeschnittener Datensatz, sondern ein Speicherüberschreiber an der häufigsten
Stelle des Empfangspfads.

Die Info-Ausgabe in `command_functions.cpp` behandelt denselben Fall bereits richtig: dort
wird nach dem Serialisieren auf `MAX_MSG_LEN_PHONE - 2` begrenzt. Der Patch bringt den
Mheard-Pfad auf dasselbe Verhalten — hier direkt über `sizeof(bleBuffer)`, sodass die Länge
nicht zweimal gemessen werden muss.

## Verhalten

Unverändert, solange das JSON in den Puffer passt — das ist der Regelfall. Passt es nicht,
wird es abgeschnitten statt über den Puffer hinaus geschrieben, und gesendet wird die
tatsächlich geschriebene Länge. Nebeneffekt: `measureJson()` wird nicht mehr zweimal je
Datensatz aufgerufen.

## Umfang

Minimal und gezielt, keine Umbauten: geändert werden nur die Argumente eines bestehenden
Aufrufs und die Verwendung seines Rückgabewerts. Beide Fundstellen sind identisch behandelt,
damit die gespeicherte Liste nicht anders serialisiert als der Live-Pfad.

---

### Offen vor dem Absenden
- **Nicht kompiliert/geflasht** — hier ist kein Build-Setup vorhanden. Vor dem PR einmal
  `pio run -e <env>` (DL9SAU hat RAK4631/Heltec) laufen lassen.
- Vorher auf aktuellen `dev` rebasen (Regel aus der `CLAUDE.md` des Firmware-Repos).
- Ziel-Branch ist **`dev`**, nicht `main`.


---

# PR 2 — `feat/mh-json-src-gw`

**Titel:** MH-JSON: Ursprungsrufzeichen und Gateway-Kennung mitsenden

## Was geändert wurde

`src/mheard_functions.cpp`, im JSON-Aufbau — **beide** Fundstellen (Live-Pfad ~Z. 331 und
Ausgabe der gespeicherten Liste ~Z. 633), je zwei Zeilen:

```c
mhdoc["SRC"] = mheardLine.mh_sourcecallsign.c_str();
mhdoc["GW"]  = (mheardLine.mh_destinationpath == "HG") ? 1 : 0;
```

## Warum

Beide Werte liegen an dieser Stelle bereits im `mheardLine`-Struct und werden nur nicht
serialisiert:

- `mh_sourcecallsign` wird in `lora_functions.cpp` aus `aprsmsg.msg_source_call` gefüllt.
  Das MH-JSON kennt bisher nur `CALL`, den **letzten Hop**. Der Ursprung fehlt.
- `mh_destinationpath` trägt bei einer HEY-Bake `H` bzw. `HG`. Die Firmware **wertet das
  schon aus** — `mheard_functions.cpp` merkt sich das Gateway-Bit für die eigene
  Pfadtabelle (`mheardPathLen[ipos] = mheardLine.mh_path_len | 0x80;`) — gibt es aber nicht
  an die App weiter.

Nutzen aus Anwendungssicht: eine App kann heute nicht sagen, **wer** eine weitergeleitete
Bake ursprünglich gesendet hat, und muss aus dem `gw`-Bit **raten**, ob ein Knoten ein
Gateway ist. Beides ist mit diesen zwei Zeilen entschieden statt geschätzt.

Gemessen an einem Standort mit einem einzigen direkten Nachbarn: in rund 75 Minuten
16 HEY-Beobachtungen, davon **5 zuordenbar** und **11 nicht** — weitergeleitete Baken
fremder Knoten, deren Ursprung die Firmware kennt. Zwei Drittel der Information verfallen
ungenutzt.

## Umfang

Zwei Zeilen je Fundstelle, keine Umbauten, keine Verhaltensänderung an bestehenden Feldern.
Längenwirkung gering (~26 Zeichen), Puffer ist 300 groß, ein Datensatz liegt bei ~150.

---

# PR 3 — `feat/mh-json-hey-path`

**Titel:** MH-JSON: HEY-Pfad-Payload mitsenden (RSSI/SNR je Hop)

## Was geändert wurde

`src/mheard_functions.cpp`, beide Fundstellen, je eine Zeile:

```c
mhdoc["PP"] = mheardLine.mh_path_payload.c_str();
```

## Warum

`lora_functions.cpp` legt die vollständige HEY-Nutzlast in `mh_path_payload` ab
(`R<ncnt>;<ncnt>,<rssi>,<snr>;…` — jeder Relay hängt seine Werte an).
`mheard_functions.cpp` parst daraus **nur** den Nachbar-Count (`mh_ncount`), der Rest wird
verworfen. Damit geht die einzige Information verloren, die das **schwache Glied** einer
mehrfach gerelayten Strecke zeigen würde: RSSI und SNR je Hop.

## Längenwirkung — der Punkt, über den zu reden ist

Dieses Feld wächst mit der Hop-Zahl (grob 12 Zeichen je Hop, bei `max_hop_text` = 4 also
etwa 50–60 Zeichen plus Schlüssel). Ein MH-Datensatz liegt heute bei ~150 Zeichen,
`MAX_MSG_LEN_PHONE` ist 300. Es passt, aber es ist das einzige der vorgeschlagenen Felder
mit spürbarem Anteil — deshalb als eigener PR, damit die kleinen nicht daran hängen.

Sinnvoll **nach** dem Puffer-PR, der die fehlende Längenprüfung nachrüstet.

---

# PR 4 — `feat/info-json-flash-version`

**Titel:** Info-JSON: Build-Datum (`FLASH_VERSION`) mitsenden

## Was geändert wurde

`src/command_functions.cpp`, im Aufbau des Info-JSON (~Z. 4868), eine Zeile:

```c
idoc["FWDATE"] = FLASH_VERSION;
```

## Warum

Die App bekommt heute nur `FWVER`, zusammengesetzt aus `SOURCE_VERSION` und
`SOURCE_VERSION_SUB` — also z. B. `4.35 p`. Damit lassen sich **Sub-Releases nicht
unterscheiden**: zwei Stände mit demselben Buchstaben sehen für die App identisch aus,
obwohl sie es nicht sind. Für Fehlersuche und Support ist das der entscheidende Unterschied.

Der Wert ist bereits vorhanden: `configuration_global.h` definiert `FLASH_VERSION`
(z. B. `20260724`). Er wird nur nicht gemeldet.

**Bewusst ein neuer Schlüssel** statt einer Änderung an `FWVER`: bestehende Apps parsen das
Feld, ein geändertes Format würde sie brechen. `FWDATE` ist additiv und stört niemanden,
der es nicht kennt.

Optional wäre zusätzlich ein kurzer git-Hash (PlatformIO-Build-Flag) — das ist aber ein
Eingriff in den Build und nicht Teil dieses PRs.

## Umfang

Eine Zeile, ein zusätzlicher Schlüssel, keine Änderung an bestehenden Feldern.
