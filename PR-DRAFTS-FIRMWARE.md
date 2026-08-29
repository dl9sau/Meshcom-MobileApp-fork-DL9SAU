# PR-Entwürfe für die MeshCom-Firmware (icssw-org)

Vier eigenständige PRs gegen **`dev`**, jeder für sich mergebar. Reihenfolge ist bewusst:
der Fix zuerst, dann die kleinen Ergänzungen, das Längenthema zuletzt.

Hausordnung des Repos (`CLAUDE.md` dort): gegen `dev`, vorher rebasen, **minimale
Änderungen ohne Refactorings**, Beschreibung **auf Deutsch** und **vor** dem Absenden
verfasst. Vor jedem Absenden einmal bauen:

```bash
pio run -e ttgo_tbeam        # ~3 min, espressif32 6.13.0 ist lokal vorhanden
```

Der Clone braucht dafür `src`, `variants`, `lib` und `boards` im sparse-checkout
(`git sparse-checkout set src variants lib boards`) — die Board-Umgebungen kommen über
`extra_configs = variants/*/platformio.ini`, sonst kennt PlatformIO nur die safeboot-Envs.
**Ihre CI baut nur bei Tag-Pushes** (`on: push: tags`), ein PR wird dort *nicht*
automatisch kompiliert — der lokale Build ist also der einzige Nachweis.

Ablauf je PR (kein `gh` nötig):
```bash
git fetch origin dev
git switch -c <branch> origin/dev
# ändern, bauen, committen
git push -u fork <branch>
```
dann `https://github.com/icssw-org/MeshCom-Firmware/compare/dev...dl9sau:MeshCom-Firmware:<branch>?expand=1`

**Kniff:** den Text von unten gleich als **Commit-Nachricht** verwenden. Bei einem PR aus
einem einzelnen Commit füllt GitHub Titel und Beschreibung daraus vor — dann ist nichts zu
kopieren, und Commit und PR können nicht auseinanderlaufen. Den Build-Nachweis danach als
Kommentar an den PR hängen (beim Committen gibt es ihn noch nicht):

> Kompiliert gegen `dev`: `pio run -e ttgo_tbeam` (espressif32 6.13.0, ArduinoJson 7.4.3)
> — SUCCESS, keine neuen Warnungen.

**Korrektur zur ersten Fassung:** PR 2 und 3 fassen **nur den Live-Pfad** an
(`updateMheard`, ~Z. 331), *nicht* die Ausgabe der gespeicherten Liste (`sendMheard`,
~Z. 633). Dort wird `mheardLine` aus dem gespeicherten `|`-String `mheardBuffer[iset]`
rekonstruiert, und der enthält nur date|time|plt|hw|mod|rssi|snr|dist|path_len|mesh|ncount
— **kein** Ursprungsrufzeichen, **kein** Ziel-Pfad, **keine** HEY-Nutzlast. Die neuen
Felder wären dort leer bzw. immer 0: eine falsche Aussage ist schlechter als eine fehlende.
Nur PR 1 (Puffergrenze) betrifft beide Stellen, weil es dort um die Serialisierung selbst
geht.

Beide fassen aber denselben `mhdoc`-Block an: sobald einer gemergt ist, brauchen die
anderen `git rebase origin/dev` — trivialer Konflikt, aber er kommt.

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

### Status
**Kompiliert** gegen `dev`: `pio run -e ttgo_tbeam` (espressif32 6.13.0, ArduinoJson 7.4.3)
— SUCCESS, keine neuen Warnungen. Diese Zeile gehört in den PR-Text.
Eingereicht 2026-08-24.


---

# PR 2 — `feat/mh-json-src-gw`  *(Branch + Commit `c04ed7b` liegen vor, gebaut)*

**Titel:** MH-JSON: Ursprungsrufzeichen und Gateway-Kennung mitsenden

## Was geändert wurde

`src/mheard_functions.cpp`, im JSON-Aufbau des **Live-Pfads** (`updateMheard`, ~Z. 331),
zwei Zeilen:

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

## Warum nicht auch in der gespeicherten Liste

`sendMheard()` baut `mheardLine` aus dem persistierten `|`-String wieder auf, und der führt
weder Ursprungsrufzeichen noch Ziel-Pfad. Dort ergänzt hießen die Felder `SRC:""` und
`GW:0` — eine **falsche** Aussage statt einer fehlenden. Wer sie auch dort haben will,
müsste das Speicherformat erweitern; das ist eine eigene Entscheidung und gehört nicht in
diesen Patch.

## Umfang

Zwei Zeilen, keine Umbauten, keine Verhaltensänderung an bestehenden Feldern.
Längenwirkung gering (~26 Zeichen), Puffer ist 300 groß, ein Datensatz liegt bei ~150.

**Status:** Branch `feat/mh-json-src-gw`, Commit liegt vor, gebaut
(`pio run -e ttgo_tbeam` → SUCCESS). Die Commit-Nachricht **ist** der PR-Text.

---

# PR 3 — `feat/mh-json-hey-path`  *(Branch + Commit `fff4010` liegen vor, gebaut)*

> **Beim Bauen gefunden — der Einzeiler reichte nicht:** `mh_path_payload` wird in
> `lora_functions.cpp` erst **nach** dem Aufruf von `updateMheard()` gesetzt. Zum Zeitpunkt
> der JSON-Erzeugung ist das Feld also leer, ein `mhdoc["PP"]` wäre immer leer geblieben.
> Der Patch verschiebt die Zuweisung deshalb in den Block, in dem ohnehin alle Felder aus
> `aprsmsg` übernommen werden. Die spätere Zuweisung für `updateHeyPath()` bleibt
> unberührt — sie ist jetzt redundant, aber sie anzufassen wäre über den Anlass hinaus.

**Titel:** MH-JSON: HEY-Pfad-Payload mitsenden (RSSI/SNR je Hop)

## Was geändert wurde

`src/mheard_functions.cpp`, **Live-Pfad** (`updateMheard`), eine Zeile:

```c
mhdoc["PP"] = mheardLine.mh_path_payload.c_str();
```

Auch hier nur der Live-Pfad: `mh_path_payload` steht ebenfalls nicht im gespeicherten
`|`-String, in `sendMheard()` wäre das Feld also immer leer.

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

# PR 4 — `feat/info-json-flash-version`  *(Branch + Commit `ae15bb7` liegen vor, gebaut)*

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
Das Info-JSON liegt damit bei grob 260 Zeichen; die vorhandene Begrenzung greift bei
`MAX_MSG_LEN_PHONE - 2` = 298. Hier ist der Hinweis wichtiger als beim Mheard-Pfad, weil
eine Überschreitung das JSON **abschneiden** und damit unbrauchbar machen würde.

---

# Stand

| PR | Branch | Commit | Gebaut | Eingereicht |
|---|---|---|---|---|
| 1 | `fix/mheard-ble-buffer-guard` | `a0d2475` | ✅ | #1090 gemerged → **zurückgenommen (#1107)** |
| 2 | `feat/mh-json-src-gw` | `c04ed7b` | ✅ | #1091 gemerged → **zurückgenommen (#1106)** |
| 4 | `feat/info-json-flash-version` | `ae15bb7` | ✅ | #1092 gemerged → **wieder entfernt**, s. u. |
| 3 | `feat/mh-json-hey-path` | `fff4010` | ✅ | #1093 gemerged → **zurückgenommen (#1105)** |

*(eingereicht 2026-08-24/25, alle vier gemergt — und zwischen dem 27. und 29.08. wieder aus
`dev` entfernt. Was der Grund ist und was daraus folgt, steht unten.)*

Alle vier von `origin/dev` abgezweigt, keiner baut auf einem anderen auf. Je PR:

```bash
git push -u fork <branch>
```
dann `https://github.com/icssw-org/MeshCom-Firmware/compare/dev...dl9sau:MeshCom-Firmware:<branch>?expand=1`

Titel und Beschreibung füllt GitHub aus der Commit-Nachricht — nichts zu kopieren.
Wird einer gemergt, brauchen die anderen `git fetch origin dev && git rebase origin/dev`
(PR 2 und 3 fassen denselben `mhdoc`-Block an).

## Querverweis für PR 3

PR 3 zuletzt einreichen, dann diesen Absatz als **Kommentar** darunter (oder über das
Stift-Symbol an die Beschreibung anhängen). Bewusst **nicht** als „hängt ab von"
formuliert — technisch ist der PR eigenständig, und eine behauptete Abhängigkeit ließe den
Maintainer unnötig warten:

> Ergänzung zur Einordnung: Dieser PR ist eigenständig — er baut und funktioniert ohne die
> anderen. Der Reihenfolge halber: `PP` ist das größte der vorgeschlagenen Felder, deshalb
> passt er gut **nach** #1090 (Puffergrenze). Er berührt denselben `mhdoc`-Block wie #1091;
> wird einer der beiden gemergt, rebase ich den anderen umgehend.

GitHub verlinkt `#123` automatisch und zeigt den Bezug dann auch in PR 1 und 2 als
Querverweis — die Zusammengehörigkeit ist damit ohne weiteres Zutun sichtbar.

---

## Rückmeldung zu #1092 (OE1KBC, 2026-08-26)

> „Ich werde die FLASH_VERSION gegen das aktuelle Compile-Datum ersetzen. Begründung: das
> Flash-Datum ändert sich nur selten und nur dann wenn die Flash-Struktur angepasst werden
> muss."

**Er hat recht, und unsere Begründung war an dieser Stelle falsch:** `FLASH_VERSION` ist die
Version der Flash-Struktur, kein Build-Datum — der Datumswert `20260724` hat sie nur so
aussehen lassen (nachgerechnet: die Datei wurde danach noch geändert, die Konstante nicht).

**Es ist eine Ankündigung, kein Ergebnis.** Ob er die Konstante umwidmet oder nur ihre
Verwendung ersetzt, sagt der Satz nicht — also abwarten, was im `dev` landet, und die App
erst darauf einstellen. Das Anliegen selbst (Sub-Releases unterscheidbar machen) hat er
aufgegriffen, das ist der wesentliche Teil.

*Möglicher Nachtrag im PR-Faden:* nach dem **Format** fragen. `YYYYMMDD` als Zahl lässt sich
in der App direkt vergleichen und sortieren; `__DATE__` liefert `"Aug 26 2026"` und müsste
geparst werden (monatsnamen-abhängig, locale-anfällig). Seine Entscheidung — aber es kostet
nichts, es einmal zu erwähnen.

---

## Rückmeldung 2026-08-29 (Rainer, Autor der App) — und was `dev` dazu sagt

> „Bei den FW-PRs bezüglich MH und Info gab es ein paar Probleme, die wurden zurückgezogen.
> Beim Info z. B. war das JSON zu lang. Max. Länge ist derzeit 245 Bytes."

**In `origin/dev` nachgesehen (2026-08-29), alle vier sind weg:**

| | |
|---|---|
| `17d1796` / PR #1105 | Revert #1093 (`PP`, HEY-Link-Kette) |
| `dc7d56d` / PR #1106 | Revert #1091 (`SRC`, `GW`) |
| `c7d5b16` / PR #1107 | Revert #1090 (Puffergrenze) |
| `82db3d4`, danach entfernt | Kurt hatte `FWDATE` aus #1092 auf ein echtes Compile-Datum umgestellt (`cfwdate` statt `FLASH_VERSION`), DK5EN einen zu kleinen Puffer dafür nachgezogen (`2d7f56b`) — **im heutigen `dev` ist `FWDATE` nicht mehr da**. |

Das MH-JSON in `dev` steht wieder auf `TYP CALL DATE TIME PLT HW MOD RSSI SNR DIST PL MESH
NCNT`, das `I`-JSON endet wieder bei `BPIN`.

### Die Ursache, im Quelltext

`phone_commands.cpp:69`, wörtlich:

```c
// MAXIMUM PACKET Length over BLE is 245 (MTU=247 bytes), two get lost, otherwise we need to split it up!
uint8_t blelen = BLEtoPhoneBuff[toPhoneRead][0];
```

**Gesplittet wird nicht** — der Satz beschreibt, was man müsste. Und die Länge ist ein
`uint8_t`: ab 256 Bytes läuft sie über (ein 260-Byte-JSON meldet Länge 4). Die einzige
Prüfung, `json_len > MAX_MSG_LEN_PHONE - 2` in `command_functions.cpp`, kappt erst bei
**298** und greift damit zu spät.

### Nachgemessen — die Zahlen erklären beide Fälle

| JSON | Bytes |
|---|---|
| `I` heute, typisch | **217** |
| `I` heute, sechs fünfstellige Gruppen | **243** ← zwei Bytes unter der Decke, **ohne** Ergänzung |
| `I` + `FWDATE` | 248 / 274 ⇒ **abgeschnitten** |
| `MH` heute | **155** |
| `MH` + `SRC` + `GW` (#1091) | **180** |
| `MH` + `SRC` + `GW` + `PP`, 3 Hops (#1093) | **245** ← genau auf der Kante, bei 4 Hops darüber |

**Für Info ist die Sache damit klar** und deckt sich mit Rainers Auskunft. **Für MH ist es
eine Vermutung mit Zahlen:** `SRC`+`GW` allein bleiben mit 180 Bytes deutlich darunter — eng
wird es erst mit `PP`. Gut möglich also, dass #1093 der Auslöser war und #1090/#1091 im selben
Aufwasch mitgingen. Das ist genau die Frage an Kurt; die Tabelle oben ist die Grundlage dafür.

*Woran man es im Feld sieht:* die App verwirft ein abgeschnittenes JSON still — `MessageHandler`
prüft `json_str.endsWith("}")` und loggt **„ERROR: JSON String does not end with }"**. Wer
diese Zeile im Log hat, hat ein zu langes Paket, keinen Verbindungsfehler.

### Was daraus folgt

1. **Keine neuen Feld-PRs, bevor der Split existiert.** Jede weitere Ergänzung am `I`-JSON
   ist ausgeschlossen — es ist schon voll. Am `MH`-JSON wäre Platz, aber nach vier
   Rücknahmen wäre der nächste Anlauf ohne geklärte Ursache respektlos gegenüber dem
   Maintainer.
2. **Der eigentliche Wunsch ist jetzt ein anderer:** die BLE-Nutzlast splitten (oder
   wenigstens **hart bei 245 abschneiden statt überlaufen zu lassen**, was ein Fünfzeiler
   wäre). Das ist die Voraussetzung für alles Weitere — und es ist ein echter Fehler, kein
   Wunsch: heute genügt ein Knoten mit sechs langen Talkgroup-Nummern, und seine Info kommt
   nicht mehr an.
3. **App-seitig ändert sich nichts** — außer, dass **D9 nicht auf ein Release wartet,
   sondern auf diesen Split**. Der Schätzer (D1/D1b) bleibt auf absehbare Zeit die einzige
   Quelle für die Gateway-Frage.
