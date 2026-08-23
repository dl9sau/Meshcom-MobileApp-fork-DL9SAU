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

> **Status: Build 2 gebaut** — B1 ✅ B2 ✅ (a71f6ba), B3 ✅ B4 ✅ B5 ✅ (c633483),
> B6 ✅ (Build 4, zusammen mit C5/C6).
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

**B6 — ✅ GEBAUT** — Eigenes Rufzeichen in den Statistiken erst ab NodeInfo bekannt
*(gefunden 2026-08-23)*
`StatsService.countPos/countMsg` filtern die eigenen Pakete über `node_call_ref.current`.
Das wird erst beim NodeInfo-Paket („I") gesetzt. Trifft davor eine **wiederholt gehörte
eigene Bake** ein, zählt sie als fremdes `#pos hf` und landet im calls-Set. Fenster ist
klein (nur direkt nach dem Connect), der Fix auch: auf die persistierte Pref `ownCall`
zurückfallen, die es beim Start ohnehin schon gibt.
*Gebaut:* `StatsService.ownOf()` — Live-Call schlägt Pref, exakter Vergleich statt Basis-
Call (ein **zweiter eigener Knoten** ist von hier aus eine fremde Station und soll zählen).

---

## C · Statistik-Ausbau (MY STATS)

> **Status: Build 3 gebaut (f239bff)** — C1 ✅ C2 ✅ C4 ✅, C3 ⚠️ *eingeschränkt*.
> **Build 4** (Feldtest 2026-08-23): C5 ✅ C6 ✅, dazu B6 — offline verifiziert (10 Prüfungen grün).
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

**C5 — ✅ GEBAUT** — Die Zahlen sind missverständlich lesbar *(Feldtest 2026-08-23)*
Zwei Stolpersteine, beide im Test aufgetreten:
- `#pos` / `#msg` / `#dm` zählen **Pakete**, die Zeile `calls` zählt **Stationen**.
  „#pos direct 2" neben „calls direct 1" ist deshalb **kein** Widerspruch — zwei Baken
  derselben Station (Beispiel: 2× db0fri, das einzige Rufzeichen in LastHeard).
- Die drei Call-Mengen **überschneiden sich**: wer direkt *und* über einen Relay gehört
  wurde, steht in `direct` **und** in `hf`. `direct+hf+gw = calls` ist also Zufall und
  keine Invariante — Aufgehen der Summe darf nicht als Prüfkriterium benutzt werden.
*Gebaut:* die calls-Zeile sagt jetzt „**unique** stations · direct … · hf … · gw …",
darunter „direct and hf may overlap" (DL9SAU). Die Paketzeilen bleiben wie sie sind
— „rx … **packets**, deduplicated" steht direkt darüber und trägt den Gegenbegriff.
*Nachgeschärft 2026-08-23 (DL9SAU), in drei Schritten:*
1. Die erste Unterzeile („counted in every way they were heard") sprach nur über den
   **nachrangigen** Punkt (Überlappung) und tat das unverständlich.
2. Der **Hauptpunkt** ist Summe gegen unique — der gehört in die Zeile, nicht in eine
   Fußnote. Statt einer Fußnote jetzt **zwei Abschnittsüberschriften** in Orange:
   „totals since app start" und „by call".
3. **Die Überlappung wurde ganz abgeschafft** *(Entscheidung DL9SAU)*: eine Station wird
   unter dem **besten** Weg geführt, auf dem wir sie je gehört haben. `direct` = mindestens
   einmal direkt, `hf` = **nur** je repeated, `gw` = **nur** je aus dem Netz. „Ich hörte
   den direkten Nachbarn auch mal repeated" ist keine interessante Information und lässt
   den hf-Zähler in Ruhe. Nebeneffekt: die drei **gehen jetzt auf** (= `calls`).
   Kein Herabstufen — ein späterer schlechterer Weg ändert nichts.
   **Paketzeilen bleiben pro Empfang** kategorisiert; dort ist die Zuordnung ohnehin eindeutig.
4. **`calls` zählt jetzt Stationen auf der Luft, nicht Absender** *(Entscheidung DL9SAU)*.
   Auslöser: db0fri stand als direkter Nachbar in Last-Heard, `calls direct` aber auf 0 —
   er hatte nur **repeatet**, noch nicht gebakt. Ein Knoten, den wir beim Weiterreichen
   gehört haben, ist aber definitiv auf HF. Also zählt **Bake ODER Via-Pfad**:
   - **letztes Pfadelement → `direct`**, immer. Dessen HF haben wir empfangen — genau das,
     was die Firmware unter dem Mheard-`CALL` führt. Gilt auch für gw=1-Texte.
   - **alle davor → `hf`**, aber **nur** wo der Pfad beweisbar HF-lokal ist: Positionen
     immer, Texte nur mit **gelöschtem gw-Bit**. Dieselbe Vertrauensregel wie bei
     `HfHeardService.mark()` — ein gw=1-Text kann Relays tragen, die nie auf unserer Luft
     waren.
   **Nebenwirkung, bewusst:** die DB-Zeile darunter ist damit **eine andere Grundgesamtheit**
   — sie kann nur **Absender** zählen, weil die gespeicherten Pfade Freitext sind. Deshalb
   heißt sie jetzt „senders in database (retention window)".

*Überschrift:* „MY STATS · since connect" wiederholte im Info-Tab den Kartentitel und
war zudem falsch — `reset()` wird **nie** aufgerufen, die Zähler laufen ab **App-Start**
und überleben einen BLE-Ab- und Wiederaufbau. Jetzt „totals since app start"; der Name
„MY STATS" erscheint nur noch über der schwebenden Karten-Variante (`showTitle`).

**C6 — ✅ GEBAUT** — „n in database (retention window)" wurde nur EINMAL gemessen
*(Feldtest 2026-08-23)*
`StatsPanel` holt `getStatsDb()` in einem `useEffect([ownCall])`. Im Info-Tab feuert der
beim Mount und dann noch einmal, wenn `config_s.callSign` vom NodeInfo-Paket gesetzt wird
— also **Sekunden nach dem Connect**, direkt nach dem Housekeeping und **bevor** der
Empfang der Session in der DB steht. Danach nie wieder. Ergebnis: die Zahl steht auf dem
Rest, der die Retention überlebt hat, während `calls` daneben live hochläuft — im Test
„3 in database" gegen „calls 10" nach 14 Tagen Abwesenheit.
Kontext dazu (nicht als Fehler zu lesen): die Zahl ist `DISTINCT fromCall` aus
`TextMessages` **∪** `DISTINCT callSign` aus `Positions`. Nach 14 Tagen Pause ist bei
Retention 2/7/30/2/7/2 alles weg außer den Partnern **eigener** DMs (30 Tage).
*Gebaut:* Neuabfrage bei Änderung von `callsAll`, **1,5 s entprellt** — die DB-Zeile wird
erst kurz **nach** dem Zähler geschrieben, eine sofortige Abfrage wäre dauerhaft eine
Station im Rückstand; die Entprellung fasst außerdem Bursts zusammen.

**C4 — Platzierung**: MY STATS in **Info**, Kasten unter „Sensors" (thematisch stimmig).
Alternative/zusätzlich Mheard-Tab zum Vergleich mit den Direktnachbarn.

---

## D · Neue Auswertungen

**D1b — Gateway-Erkennung über die advertised Nachbarzahl** *(Idee DL9SAU, 2026-08-02)*
Zweiter, **unabhängiger** Detektor — und er löst genau die unbestimmte Zeile aus D1:
Steht X als **erster Hop** im Pfad, hat X den Absender **direkt gehört** … oder ihn aus dem
Internet eingespeist. Zähle also je Knoten X die Menge der **Absender, die unmittelbar vor
X** im Pfad standen. X' Bake meldet mit `/N<n>` die Größe seiner **eigenen** Mheard-Liste,
also eine **Obergrenze** seiner HF-Nachbarn.
⇒ **beobachtete Absender-vor-X > advertised NCNT ⇒ X speist aus dem Internet ein ⇒ GW.**
Besonders scharf bei `N1`: schon der zweite abweichende Absender beweist es.
Konservativ (einseitig): normalerweise ist unsere Beobachtung eine **Teilmenge**, ein
Überschreiten ist die Anomalie. Vorbehalte: NCNT wird bei X nach 12 h gepurged und ist
eine Selbstauskunft (kann veralten) → Zeitfenster begrenzen oder einen Sicherheitsabstand
verlangen; dann „wahrscheinlich GW" statt „sicher". Aufwand **klein** (ein Set je Knoten
aus Pfadposition 0→1, plus Vergleich) — der Lernteil liegt schon in AdjacencyService.

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

**D2 — ✅ GEBAUT (f6f9f10)** — „Heard via" für **alle** Knoten verallgemeinert
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

**D5 — HF-Erkennung über Pfadvergleich** — ❌ **NICHT bauen, bereits abgedeckt** (geprüft
2026-08-02). Der „bekannte HF-Pfad" kann nur aus einer Position **oder** einer gw=0-Text-
nachricht stammen. In beiden Fällen ruft der Empfangspfad schon `HfHeardService.mark(pfad)`,
und der Pfad **enthält den Absender** → Absender ist 24 h als HF-lokal markiert → `senderLocal`
wahr → Weltkugel steht bereits auf `dim`. Der Vergleich könnte also **kein** Urteil ändern.
Einzige verbleibende „Lücke": abgelaufenes 24-h-Fenster bei noch erinnertem Pfad — das würde
ein **veraltetes** Urteil wiederbeleben, also genau die Drift, die wir mit dem eingefrorenen
`gwState` beseitigt haben. Auch die Anschlussfrage („zweite Message: DB-Lookup?") entfällt:
gelernt wird beim Empfang, festgeschrieben im `gwState`, kein Lookup nötig.
*(Ursprüngliche Idee unten, zur Nachvollziehbarkeit.)*
**D5 (Original) — HF-Erkennung über Pfadvergleich**
Stimmt der Pfad einer eingehenden Textnachricht mit dem letzten **bekannten HF-Pfad**
desselben Absenders überein → echt HF, trotz GW-Bit. Cache pro Absender aus Positionen
**und** bereits als HF entschiedenen Textnachrichten (nicht nur letzte Position).
Schneller Pfad zuerst, sonst die aufwendigere Kette.

**D6 — Calls unter den Positions-Markern auf der Karte**
*Recherchiert 2026-08-02:* **kein** Plattform-Unterschied und nichts entfernt — in dieser
Codebasis gibt es die Beschriftung **überhaupt nicht**. Belege: keine einzige Plattform-
Fallunterscheidung in `Map.tsx`; die Marker sind pigeon-maps `<Marker>`, die **nur `color`**
kennen und kein Label können; das Rufzeichen erscheint ausschließlich im `MapOverlay`-Popup.
`ios/` ist committet, `android/` wird im CI per `npx cap add android` erzeugt — die App liefe
auf iOS identisch. ⇒ iOS-Screenshots mit Calls stammen von der **eigenständigen nativen
iOS-MeshCom-App**, nicht von dieser. (Nur über diese Codebasis + Upstream urteilbar.)
*Nachtrag 2026-08-23 (Feldbeobachtung DL9SAU):* die **native iOS-App angeschaut — auch dort
tragen die Knoten kein Textlabel.* Damit ist die obige Vermutung („die Screenshots stammen
von der nativen iOS-App") **widerlegt**: die Pseudo-Screenshots in der Doku sind Mockups,
kein reales UI. Es gibt die Beschriftung also **nirgends** — wenn wir sie wollen, sind wir
die Ersten.
*Umsetzung, falls gewollt:* `<Marker>` durch ein eigenes `<Overlay anchor={[lat,lon]}>` mit
Pin **und** Textlabel ersetzen. Offene Fragen: **ab welcher Zoomstufe** (sonst Buchstabensalat
— vermutlich der Grund, warum Upstream es gelassen hat) und Performance bei vielen Knoten.
Braucht Sichtprüfung am Gerät. **Teilt sich die Umbaukosten mit D8** — beide brauchen den
Wechsel von `<Marker>` auf `<Overlay>`.

**D8 — Gateways auf der Karte farblich markieren** *(Idee DL9SAU, 2026-08-23)*
Heute kennt `setMarkerColor()` vier Fälle: **purple** = eigenes Rufzeichen, **green** =
in der Mheard-Liste (direkter HF-Nachbar), **hellblau** `#3ba6db` = österreichische
Club-/Relais-Rufzeichen per Regex `^OE[1-9]X[A-Z]{1,2}-\d{1,2}$`, sonst **blau** `#3578e5`.
Gewünscht: „sicher Gateway" in einer eigenen Farbe (Vorschlag DL9SAU: hellgrün).

*Datenquelle:* **nicht** über `Grp` — siehe Block F, `R=` sind die **selbst gebuchten**
Talkgroups und werden von **jedem** Knoten gesendet, auch von Usern. Kein GW-Indikator.
Es bleibt die **GW-Registry aus D1** (sicher: GW-Bit + genau ein Relay im Pfad ⇒ dieses
Relay **ist** Gateway) plus **D1b** als zweiter, schwächerer Detektor („wahrscheinlich").
⇒ **D8 hängt an D1**; ohne Registry keine Farbe.

*Offene Punkte vor dem Bauen:*
1. **Farbe: Orange** *(entschieden 2026-08-23)*. Hellgrün fällt weg — grün ist schon
   „direkter Nachbar", das wäre genau die Verwechslung, die wir vermeiden wollen.
   **Lila fällt ebenfalls weg**: das ist bereits das **eigene** Rufzeichen
   (`markerColor_own`). Bleibt Orange; Sichtprüfung am Gerät steht noch aus.
2. Ein Knoten kann **beides** sein (direkter Nachbar **und** Gateway). `<Marker>` kennt nur
   **eine** `color` → entweder eine Vorrangregel oder der `<Overlay>`-Umbau aus **D6**, der
   zwei Merkmale gleichzeitig zeigen kann (Pin + Symbol/Label).
3. Nur Knoten **mit Position** erscheinen überhaupt auf der Karte — ein Gateway ohne
   Positionsbake bleibt unsichtbar, egal wie sicher wir uns sind.

---

## D7 · „Experimental features"-Schalter *(Idee DL9SAU, 2026-08-02 — später)*
Diagnose-/Versuchsausgaben hinter einen Settings-Schalter legen, damit sie bei anderen
Testern nicht das Log zumüllen. **Jetzt noch nicht** — erst wenn wir größere Dinge zum
Testen haben. Die anstehende Diagnose für D1b/D3/D4 wird stattdessen als **separater
Commit** geführt, den DL9SAU nur lokal einspielt, solange er das Gerät hat.

## E · Firmware-Wünsche (an das FIRMWARE-Team, icssw)

> Achtung, nicht verwechseln: **Rainer ist der Autor der APP** (Upstream unseres Forks) —
> die Firmware kommt von icssw. Diese Punkte gehen an das Firmware-Team, nicht an Rainer.
> Textentwurf macht DL9SAU bei Gelegenheit.

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
- **`R=` in der Positionsbake = die vom Knoten SELBST gebuchten Talkgroups**
  (";"-getrennt, z. B. `232;2321;2323;`), gesendet von **jedem** Knoten — User wie Digi.
  **Kein Gateway-Indikator** (geprüft 2026-08-23, siehe D8).
- **Server ist Blackbox** (closed source) — er **strippt den Pfad** beim Verteilen
  (Feldbeobachtung). Der hintere Teil `>xxx,DEST` behält dagegen den HF-Teil vor dem Gatewayen.
