# Backlog — DL9SAU Fork

Gesammelt aus den Tests vom 2026-07-31 / 08-01 (inkl. `tmp-2026-08-01-scrollverhalten.txt`).
Reihenfolge innerhalb der Blöcke = grober Vorschlag, nicht fix.

---

## A · Chat / Scrollverhalten

> **Status: Block A ist komplett.** Build 1 (6906b13): A1 ✅, A5 ✅, A6 ✅, A2 ✅ (als Teil
> von A5: nach dem Entfernen des Markers wird wieder ans Ende gepinnt), A4 ✅ (Pixel-
> Rechnerei entfernt). **A3 ✅** — im Feldtest 2026-08-25 bestätigt, siehe unten. **A7 ✅**
> (2026-08-25 gefunden und gefixt).

**A1 — `scrollToBottom()` cached ein totes DOM-Element** *(Bug, klein)*
`bottomRef.current` wird nur neu geholt, wenn es `null` ist. Ersetzt React den Knoten
(z. B. nach 11 neuen Nachrichten), zeigt der Ref auf einen abgehängten Knoten →
`scrollIntoView` ist ein No-Op → „Button gedrückt, nichts passiert".
Fix: Sentinel-Element aufgeben, stattdessen `el.scrollTop = el.scrollHeight`.

**A2 — Marker-Entfernung verschiebt das Layout** *(Bug, klein)*
Beim Aufholen verschwindet der Marker → Inhaltshöhe schrumpft → man ist nicht mehr ganz
unten → Button kommt zurück, zweiter Druck nötig. Fix: beim Entfernen die Scrollposition
um die Marker-Höhe kompensieren (oder nur entfernen, wenn er außerhalb des Sichtfelds ist).

**A3 — ✅ ERLEDIGT** — Zwei Klicks bei Autoscroll EIN, einer bei AUS *(Bug)*
Kandidaten waren: (a) der Zähler wird in beiden Modi an unterschiedlichen Stellen geleert,
(b) während Tap 1 trifft eine neue Nachricht ein, der Divider wandert, Tap 2 zielt erneut
auf ihn.
*Ergebnis:* **durch A5 verschwunden**, ohne eigenen Fix — beide Kandidaten hingen an der
Pixel-Arithmetik, die dort weggefallen ist. **Feldtest DL9SAU 2026-08-25:** ein Tap genügt,
seitenweises Weiterblättern stimmt auch bei wiederholtem Drücken und nach zwischenzeitlichem
Hochscrollen; die Sichtbarkeitsberechnung passt. „Verhält sich perfekt, gut getestet."
Das ist der Beleg dafür, dass elementbasiertes Scrollen die richtige Entscheidung war: der
Fehler war nie ein eigener Bug, sondern eine Folge des falschen Ansatzes.

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

**A7 — ✅ GEBAUT** — Beim Start galt der ganze DB-Bestand als „neu" *(Feldtest DL9SAU, 2026-08-25)*
Kanal ALL, Autoscroll aus, hochgescrollt: der Kreis zeigte **26 neue Nachrichten** — und der
Kanal enthielt insgesamt 26. Ursache im `msgArr`-Effekt: er misst Ankünfte als
`msgArr.length - prevLen`, und beim Start springt die Länge in **einem** Schritt von 0 auf
N, weil die gespeicherten Nachrichten geladen werden. Das ist von N gleichzeitig
eintreffenden Paketen nicht zu unterscheiden.
*Fix:* nur die **erste** Befüllung wird gesondert behandelt — gezählt wird dort, was
**neuer als der App-Start** ist (`StatsService.getStartedAt()`), alles Ältere war schon da.
Danach zählt wieder das Delta. Wichtig war der Fall „leere Datenbank": dort darf die erste
echte Nachricht nicht verschluckt werden, deshalb der Zeitstempel-Vergleich statt eines
bloßen „erste Füllung ignorieren".
*Grenze:* Nachrichten-Zeitstempel kommen von der Knoten-Uhr. Geht sie nach, kann eine
Nachricht, die genau während des Starts eintrifft, als Bestand gelten — betrifft nur die
erste Füllung. Offline gegen 7 Fälle geprüft, **im Feld bestätigt** (DL9SAU, 2026-08-25).
*Die beobachtete Einschränkung stützt die Diagnose:* der Fehler trat **nur im Kanal ALL**
auf (beim Start ist er ausgewählt, und nur das aktive Segment wird erstbefüllt) und **nur
bei Autoscroll aus** (bei „ein" steht man am Ende, dort räumt `settleAtBottomBoundary` den
Zähler sofort weg). Beides sagt der Mechanismus vorher, statt bloß dazu zu passen.

**A8 — ✅ GEBAUT** — Teile einer gesplitteten Nachricht in Reihenfolge zeigen
*(Feldbefund DL9SAU, 2026-08-25: „der Gegenüber meinte, die messages kamen out of order")*
Im Mesh können die Pakete einer langen Nachricht in beliebiger Reihenfolge ankommen. Der
Marker `(i/n xx)` aus `MsgSplit` reicht zum Sortieren: **gleicher Absender + gleicher Tag +
gleiches n**, geordnet nach `i`. Neu: `MsgGroup.orderMultipart`, eingehängt an der einen
Stelle, an der die Liste fürs Rendern entsteht (`visibleMsgs`) — Zähl- und Scroll-Logik
arbeiten unverändert auf `msgArr_s`.
*Entscheidungen (DL9SAU):*
- **Nur sortieren, nicht zusammenfügen** — sonst müsste der zusammengesetzte Text irgendwo
  gehalten werden, und genau am Puffer arbeiten wir uns ja ab. Die Teile behalten ihre
  eigenen Zeitstempel und Acks.
- **Verankert beim zuerst eingetroffenen Teil**, nicht bei Teil 1: die Nachricht bleibt
  dort, wo ihr **Kontext** ist, statt nach zehn Minuten unter neueren zu landen.
- **Fenster gegen den ersten Teil der Gruppe, nie gegen „jetzt"** — sonst zerfiele eine
  Gruppe später wieder und dasselbe Gespräch sähe morgen anders aus. 2 h; bei 1296
  Tag-Werten *und* Absenderbindung ist eine Kollision darin unwahrscheinlich.
- **Nichts erfunden:** fehlende Teile bleiben sichtbare Lücken (dafür ist der Marker da),
  eine Nachlieferung nach Resend sortiert sich an ihren Platz, ein doppelter Teil bleibt
  erhalten und landet neben seinem Zwilling.
*Nebenwirkung:* zieht ein später Teil nach oben zu seiner Gruppe, steht er über dem
„new messages"-Trenner, obwohl er neu ist. Im Feld beobachten.
Offline gegen 18 Fälle geprüft.

**A9 — ✅ GEBAUT** — Automatischer Resend unbestätigter DM-Teile *(Idee DL9SAU, 2026-08-25)*
Die Firmware wiederholt selbst — aber nur **3× im Abstand von 40 s**, nach 2 Minuten gibt
sie auf (`MAX_RETRANSMIT`, `lora_functions.cpp:1947`, im Quelltext nachgesehen). Danach
bleibt ein verlorener Teil unbestätigt liegen und man muss ihn von Hand nachschicken.
`ResendService` setzt genau dort an, wo die Firmware aufhört.
*Bewusst eng gefasst (Entscheidungen DL9SAU):*
- **Nur DMs.** Eine Kanalnachricht hat kein Empfänger-Ack; die Wolke sagt nur „jemand hat
  wiederholt". Ein überhörtes Repeat als Verlust zu deuten würde den Kanal für **alle**
  mit Duplikaten fluten.
- **Nur Teile einer gesplitteten Nachricht** (die mit `(i/n xx)`-Marker). Eine kurze
  Nachricht bleibt beim Firmware-Retry — dafür ist er da; weh tut der Verlust bei der
  langen.
- **Nicht über den App-Neustart hinweg** — nur was in *diesem* Lauf gesendet wurde.
- **Still**: kein Extra-Eintrag im Chat. Der Rückläufer wird vom vorhandenen
  Resend-Collapse ins Original gefaltet, der auch die Versuche zählt → daher die schon
  gerenderte Zeile `· resent #N at hh:mm`. Dafür unterdrückt der Collapse jetzt den
  Sprung/Blitz bei **eigenen** Nachrichten (bei fremden bleibt er).
- **Abschaltbar**, Default an (`autoResendDM` in den Einstellungen).
*Takt:* 5 / 15 / 40 min **nach der ursprünglichen Sendung**, drei Versuche in gut einer
Stunde — großzügig, weil die Firmware es in den ersten zwei Minuten schon dreimal versucht
hat: kam da nichts, ist die Strecke schlecht oder die Station weg, und schnelle Nachschläge
helfen dann nicht, kosten aber Airtime.
*Kandidaten* kommen aus einer eigenen, engen Abfrage (`getUnackedOwnDMs`) statt aus der
ganzen Nachrichtentabelle — der Ticker läuft jede Minute. Offline gegen 17 Fälle geprüft.

**A6 — DM-Tab: gelb (Filter aktiv) verdeckt grün (neue Nachricht)** *(klein)*
Vorschlag: erst dunkleres Grün probieren; sonst Blinken gelb↔grün ~1 s (nicht flackern).

---

## B · Korrektheits-Fixes (klein, isoliert)

> **Status: Build 2 gebaut** — B1 ✅ B2 ✅ (a71f6ba), B3 ✅ B4 ✅ B5 ✅ (c633483),
> B6 ✅ (Build 4, zusammen mit C5/C6).
> Beide Commits sind **offline gegen den echten Code verifiziert** (Typen mechanisch
> gestrippt, auf blankem node laufen lassen — nichts installiert): 25 + 14 Prüfungen grün.
> **Damit ist B komplett — nichts offen.**

**B1 — Filter: unsichtbarer Variation-Selector U+FE0F** *(Bug, verifiziert reproduziert)*
Regel mit `☀️` (VS16) matcht Nachricht mit `☀` (ohne) **nicht**. Umgekehrt schon.
Satzzeichen-Bezug: sobald im Muster direkt hinter dem Emoji ein Zeichen steht (`.` `,`),
bricht das dazwischenliegende VS16 den Treffer.
Fix: vor dem Vergleich **beide Seiten** `normalize("NFC")` + `︎️` entfernen
(nur fürs Matching). ZWJ **nicht** anfassen (Familien-Emoji).
Dazu: `compilePattern` verwirft bei Regex-Fehler die Regel **still** → Log-Zeile.

**B2 — ✅ GEBAUT** — Auto-Split zerhackt lange Wörter (URLs) *(Bug)*
Regel: **ein Token, das in ein Paket passt (≤ 150 − Tag), wird nie zerschnitten** —
schlägt „balanced". Notfalls unbalanciert oder Token allein in ein Paket.
(Die Zahlen in Beispiel 1 der Notizen — `130` → `116` — waren beispielhaft und
verzählt, kein Hinweis auf eine Kürzungsregel. Geklärt, nichts offen.)

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

**C8 — ✅ GEBAUT** — Laufzeit im MY-STATS-Kopf *(Wunsch DL9SAU, 2026-08-25)*
„Ich weiß nicht, wann ich die App gestartet habe" — ohne Bezugsdauer sind die Zahlen nicht
einzuordnen. Der Kopf sagt jetzt **`totals since app start · 1d 23h 3min`**.
Bewusst als **Dauer**, nicht als Startzeitpunkt: „1d 23h 3min" ist auf einen Blick zu
bewerten, „seit 00:40" verlangt erst Kopfrechnen gegen die aktuelle Uhrzeit (DL9SAU).
*Gebaut:* `StatsService.getStartedAt()` (Zeitpunkt des Modul-Ladens = App-Start; die Zähler
werden nie zurückgesetzt und überleben BLE-Abbrüche), Formatierung über den neuen
gemeinsamen Helfer `TimeFmt.formatAge` — dieselbe Funktion, die im Karten-Overlay „Age"
schreibt, jetzt an einer Stelle statt zweimal. Der Kopf tickt einmal je Minute, sonst würde
er auf einem stillen Kanal stundenlang dieselbe Zahl zeigen.

**C4 — Platzierung**: MY STATS in **Info**, Kasten unter „Sensors" (thematisch stimmig).
Alternative/zusätzlich Mheard-Tab zum Vergleich mit den Direktnachbarn.

**C7 — ✅ GEBAUT** — `#hey` und `#ack` in MY STATS *(Idee DL9SAU, 2026-08-24)*
- **`#hey`** — HEY kommt nicht als Paket in die App, ist aber über das MH-JSON zählbar
  (`PLT 64`, dieselbe Quelle wie D3). Es zählt **fremde** Stationen auf der Luft.
  Beschriftung schlicht **`#hey`**, ohne Zusatz; Gesamtzahl in den Total-Stats.
  **Keine** Aufschlüsselung je Rufzeichen — ob ein Knoten über hey, pos oder als
  Pfad-Referenz als HF-lokal gilt, ist für die calls-Zeile egal (DL9SAU).
  Der eigentliche Wert liegt nicht in der Summe, sondern im Vergleich **erwartet gegen
  empfangen**: festes 15-min-Intervall ⇒ die erwartete Zahl über einen Zeitraum ist
  bekannt ⇒ **Linkqualität über die Hops** (DL9SAU). `PL` trennt dabei die eigene Bake des
  Nachbarn von weitergeleiteten.
  **HEY ist dafür die klarere Messung als Positionen**: die Positionsbake hat kein
  verlässlich festes Intervall (Smart-Beaconing, Bewegung), HEY schon. ⇒ Die Quote gehört
  angezeigt bei **LastHeard/Mheard** und an den **Knoten in der Karte**, nicht nur als
  Summe in MY STATS.
  Die RSSI/SNR-Kette je Hop steckt zwar im HEY, wird aber nicht durchgereicht →
  Firmware-Wunsch E3 (bleibt).
  *Gebaut 2026-08-24 mit D3:* Zeile `#hey` (`own` / `relayed`) in MY STATS, die Quote je
  Knoten in Mheard und Karten-Overlay.
- **`#ack`** — *gebaut 2026-08-24:* Zeile unter **`me`**, weil jedes Ack, das die App
  sieht, zu einer **eigenen** Nachricht gehört: die Firmware reicht es nur durch, wenn es
  zu einer eigenen Aussendung passt (`checkOwnTx`), und nur **einmal je Nachricht**
  (`own_msg_id[..][4] < 2`) — Quelltext geprüft, `lora_functions.cpp:handleACK`.
  Beschriftet nach dem, was die Firmware **sagt**, nicht nach dem Icon:
  **`repeated-only`** (`0x00`, ihr „ONLY HEARD" — die eigene Nachricht kam über die Luft
  zurück **und** es wurde kein Ack vermerkt) gegen **`acked`** (`0x01`/`0x02`).
  **Nicht kumulativ**, siehe Block F. Zuordnung
  identisch zu `ackTxtMsg`, damit Zähler und Haken nie Verschiedenes erzählen; `0x01` und
  `0x02` teilen sich einen Topf, weil sie sich ein Icon teilen **und** weil das
  Firmware-Flag zur Trennung festverdrahtet ist (Block F). Am Ack-Modell wird **nichts** geändert. Ausgeblendet, solange nichts bestätigt
  wurde — eine reine Empfangsstation braucht keinen Zähler, der auf 0 stehen bleibt.
⇒ Gleiche Datenquelle wie D3, zusammen bauen.

---

## D · Neue Auswertungen

**D1b — ✅ GEBAUT** — Gateway-Erkennung über die advertised Nachbarzahl *(Idee DL9SAU, 2026-08-02)*
*Gebaut 2026-08-24 in `GatewayInferenceService`* (die frühere `GatewayService.ts` — die
Datei hält jetzt **beide** Detektoren, D1 und D1b). Zweiter, **unabhängiger** Detektor —
er löst genau die unbestimmte Zeile aus D1: Steht X als **erster Hop** im Pfad, hat X den
Absender **direkt gehört** … oder ihn aus dem Internet eingespeist. Je Knoten X sammeln wir
die **Absender an Pfadposition 0→1**; X' Bake meldet mit `/N<n>` (bzw. Mheard-`NCNT`) die
Größe seiner **eigenen** Mheard-Liste, also eine **Obergrenze** seiner HF-Nachbarn.
⇒ **beobachtet > advertised ⇒ X speist ein ⇒ GW** (`MIN_EXCESS = 1`, also schon der erste
Überschuss; bei `N1` genügt damit der zweite abweichende Absender).
Einseitig wie D1: unsere Sicht ist normalerweise die **Teilmenge**, nur ein Überschreiten
sagt etwas.
**Zeitfenster ehrlich gerechnet:** die Firmware purged einen Mheard-Eintrag nach 12 h, eine
Meldung von n zum Zeitpunkt T deckt also `[T−12h, T]` ab — nur in diesem Intervall
beobachtete Absender werden gegen n gehalten; frischere Beobachtungen warten auf die
nächste Bake. Bleibt die Selbstauskunft als Rest-Unsicherheit ⇒ **„wahrscheinlich"**.
Gefüttert aus **Positions- *und* Nachrichtenpfaden**: Positionen werden nie eingespeist,
füllen die Menge aber schnell — und überschreiten muss ihre **Größe**. Nur-Nachrichten
bräuchte mehrere Einspeisungen bis zum selben Schluss. Live plus **Startup-Replay** aus
DB-Pfaden (Nachrichten + Positionen) und den gespeicherten Mheard-NCNTs.
**Bewusst getrennt gehalten:** eigenes Store-Feld `probable`, **keine** Zählung in der
Registry, **keine** Kartenfarbe — nur die Overlay-Zeile
`GW: probably (7 senders relayed, advertises 5)`. Log beim ersten Verdacht, plus eine
zweite Zeile, wenn D1 später beweist, was D1b vorhergesagt hatte (= Feldprüfung der
Heuristik, kostet nichts).
*Offen (Feld):* ob die Firmware wirklich **jeden** direkt gehörten Absender in ihre
Mheard-Liste nimmt und ob deren Kapazität begrenzt ist — beides bräche die Teilmengen-
Annahme und gäbe Fehlalarme; dann `MIN_EXCESS` hochsetzen.

**D1 — ✅ GEBAUT** — Gateway-Registry (ohne Firmware-Änderung)
*Gebaut 2026-08-24 zusammen mit D8:* `GatewayService` + `GatewayStore`, Regeln 1:1 nach
der Tabelle unten. Live beim Empfang (nach dem Einfrieren von `gwState`), plus **Replay
beim Start** aus den gespeicherten Nachrichten — `gw`, `gwState` und `via` sind alle
persistiert, also steht „(max n)" sofort nach einem Neustart da statt bei 0 anzufangen
(retention-begrenzt wie alles DB-Abgeleitete). Anzeige: Zeile **`GW: n (max m)`** im
Knoten-Overlay, nur bei Knoten, denen wir etwas nachweisen konnten. Einseitig: wir
**setzen** Gateways, nehmen sie nie zurück — die Zahl sagt, wie viel es trägt, nicht ob
es heute noch eines ist. Offline gegen 19 Fälle geprüft.
*Was die Zahl sagt und was nicht* **(Rückfrage DL9SAU, 2026-08-24)**: `GW traffic: n` zählt
**Nachrichten**, nicht Rufzeichen — anders als das darüberstehende `Heard via`, das unique
Stationen zählt. Beide waren gleich formatiert („n (max m)"), genau so verwechselt man sie;
die GW-Zeile schreibt die Einheit jetzt aus. Und sie zählt **nicht nur Einspeisungen**: das
gw-Bit setzt die Firmware auch, wenn ein Gateway HF-Verkehr bloß **weiterreicht**. Der
eingefrorene `gwState` trennt beides so weit es geht — `solid` heißt „Quelle nicht
HF-bestätigt", also **aus dem Internet** eingespeist. Angezeigt wird deshalb
`GW: 45 (max 45) msgs, 12 from internet`; die Differenz ist HF-Verkehr, den er als Gateway
weitergereicht hat. *Wortwahl bewusst nicht „from the network" (DL9SAU): im Mesh ist die
HF-Seite auch ein Netz, das Wort entscheidet also nichts — der Gegensatz ist Internet
gegen Luft.*
*Und was bei einem reinen Repeater dort stand: nichts* — der Zähler springt nur bei
gesetztem gw-Bit an, und das setzt die Firmware nur, wenn ein Knoten **als Gateway**
weiterreicht oder einspeist. Jede gezählte Nachricht **beweist** damit zwar die
Gateway-Eigenschaft, aber der gewöhnliche Repeater hatte gar keine Verkehrszahl (Einwand
DL9SAU). *Gelöst 2026-08-24 in seiner Form* — **eine** Zeile über den Verkehr durch den
Knoten, der Gateway-Anteil als Zusatz:
`Relayed: 128 pkts (12 from internet)` — die Klammer, weil die zweite Zahl eine
**Teilmenge** der ersten ist; mit Komma las sie sich wie eine zweite, eigene Größe
(Rückfrage DL9SAU: „128 beinhaltet die 12?").
- **`pkts`** — alles, was er uns weitergereicht hat, Gateway oder nicht. Neuer Zähler in
  `RelayCountService` (je Relay im Pfad ein Paket), **session-only**: die DB hält eine Zeile
  je Station, es gibt keine Paket-Historie zum Nachspielen, ein „(max)" wäre erfunden.
  Positionen zählen mit ⇒ `pkts`, nicht `msgs`.
- **`from internet`** — davon die, die dieser Knoten **eingespeist** hat (`gwState 'solid'`:
  der Absender war nicht auf unserer Luft bestätigt). Dasselbe Urteil, das die Weltkugel an
  einer einzelnen Nachricht fällt — also ein Begriff, den der Nutzer schon kennt.
- **Bewusst NICHT mehr angezeigt: die Zahl der Pakete mit gw-Bit** (vorher „gatewayed 45").
  *Prüfstein DL9SAU 2026-08-24: „Ich könnte einem Nutzer den Unterschied zwischen den 45
  gatewayten Paketen und den 12 aus dem Internet nicht erklären."* Genau — die 45 mischen
  Einspeisungen und bloß wiederholten HF-Verkehr, weil die Firmware dasselbe Bit für beides
  setzt. Sie ist ein Artefakt unserer Erkennungsmethode, keine Größe, die jemanden
  interessiert. Die Registry zählt sie weiter (sie entscheidet die Kartenfarbe), sie ist nur
  nichts zum Ablesen.
`Heard via` bleibt daneben stehen und zählt weiterhin **Stationen** — jetzt mit
ausgeschriebener Einheit, damit die beiden Zeilen nicht verwechselt werden.

*Zeile 4 der Tabelle* (Quelle HF-bestätigt, mehrere Relays) bleibt für D1 unbestimmt —
dafür ist D1b da (gebaut, aber bewusst nur „wahrscheinlich", ohne Kartenfarbe).
*Diagnose nebenbei:* gw-Bit **ohne** jedes Relay im Pfad wird gezählt und geloggt. Träte
das auf, hängt ein einspeisendes Gateway sich **nicht** selbst in den Pfad — dann wäre
auch die Weltkugel-Annahme „0 Hops = wir hörten die eigene HF des Absenders" zu prüfen.

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

**D3 — ✅ GEBAUT** — HEY-basierte Zuverlässigkeits-Quote *(gebaut 2026-08-24)*
`LinkRateService` + `LinkRateStore`. HEY kommt nicht als Paket in die App, aber die Firmware
schreibt zu **jedem** RF-Empfang einen Mheard-Satz und nennt dort den Pakettyp: `PLT 64` =
`@` = HEY, `PL 0` = der gehörte Knoten hat sie **selbst** gesendet, `PL>0` = er hat eine
**fremde** weitergeleitet (Relay-Aktivität). Aus dem festen 15-min-Intervall folgt die
erwartete Zahl über die Zeitspanne ⇒ Quote. Anzeige `HEY: 11/12 (92%) · relayed 3` in
**Mheard** und im **Karten-Overlay**, Summe als `#hey own/relayed` in MY STATS.
*Zeitstempel:* der des **Knotens** (DATE/TIME aus dem MH-Satz), nicht unsere Empfangszeit —
beim Connect kommt die Mheard-Liste am Stück, nur die Knoten-Stempel legen die Sätze richtig
ab; unplausible Uhr ⇒ übersprungen statt gemischt (zwei Uhren in einer Reihe erfänden
Lücken).
*Pfadlängen-Konvention — im Firmware-Quelltext GEKLÄRT (2026-08-24):* `PL` ist
`msg_last_path_cnt`, startet bei **1** und zählt je Komma im Quellpfad hoch ⇒ es zählt
Pfad-Einträge **inklusive Absender**, **direkt = 1**, eine `0` ist unmöglich (Block F).
Die Feldprobe (`3`, `1`, `3` von **db0fri-12**, dessen Positionen die App gleichzeitig als
„(direct)" loggt) passt genau dazu: die `1` war seine eigene Bake, die beiden `3` waren
weitergeleitet.
Der Service **lernt** den Boden trotzdem weiter — als Sicherung, nicht als Annahme: der
kürzeste je gesehene HEY-Pfad ist per Definition eine selbst gesendete Bake, gedeckelt bei
1. Ändert eine künftige Firmware die Zählweise, folgt die App, statt still das Falsche zu
zählen. Nur über HEY-Sätze gelesen, nie mit anderen Pakettypen gemischt.
*Die Asymmetrie, auf der alles steht:* Verlust macht Abstände nur **länger**, nie kürzer.
Eine Quote gilt deshalb auch bei starkem Verlust weiter — das **ist** die Messung. Nur
Abstände **kürzer** als die Konstante (< 0,6×) heißen „unsere Annahme stimmt nicht" ⇒ dann
`irregular` statt Prozent.
*Obergrenze, keine Wahrheit:* HEY hat Priorität BACKGROUND, eine Lücke kann senderseitig
sein. 100 % heißt „nichts nachweisbar verloren", nicht „perfekt".
Session-only (RAM): die Mheard-Tabelle hält nur **eine Zeile je Station**, es gibt keine
Baken-Historie zum Nachspielen.

**D4 — ✅ GEBAUT** — Positions-Quote nur wo sinnvoll *(gebaut 2026-08-24)*
Gleiche Arithmetik wie D3, gleicher `LinkRateService` — nur wird das Intervall **je Knoten
geschätzt** statt die 30 min anzunehmen: das **untere Perzentil** (p25) der beobachteten
Abstände, denn eine verpasste Bake kann einen Abstand nur verlängern, nie verkürzen.
Streuen die Abstände (p75 > 2,5×p25 — Smart-Beaconing, Bewegung), gibt es **keine
Prozentzahl**, sondern „n heard, irregular"; unter 4 Abständen gar keine Aussage.
*Nachgeschärft 2026-08-25 (Rückfrage DL9SAU „was heißt das?" bei 6 Positionen in 8,5 h):*
das Wort trägt jetzt seinen Grund mit — **`irregular (30-180 min)`**, also die beiden
Abstandswerte, auf denen das Urteil beruht (ohne „apart": in einer Zeile über Bakenrate kann
eine Minuten-Spanne nur der Abstand sein, und das Knoten-Fenster auf der Karte hat keinen
Platz zu verschenken — auch das seine Anmerkung). Ohne sie muss der Leser raten, was wir nicht
messen konnten. Und die Klarstellung, die dabei fehlte: `irregular` ist **kein
Qualitätsurteil**. Es heißt nicht „schlechte Verbindung", sondern „hier ist keine ehrliche
Quote möglich" — bei einem fernen Knoten meist löchriger Empfang über mehrere Hops, sonst
Bewegung/Smart-Beaconing oder ein Neustart mitten im Fenster.
Anzeige `Pos rate: 8/10 (80%, ~30 min)` in Mheard und Karten-Overlay — das geschätzte
Intervall steht **dabei**, weil die Quote ohne es nicht beurteilbar ist.
*Bias:* bei viel Verlust kann die Schätzung ein **Vielfaches** des wahren Intervalls treffen
⇒ die Quote sieht dann besser aus als die Wirklichkeit, nie schlechter. Auch hier
session-only: die Positions-Tabelle hält eine Zeile je Station, keine Bakenhistorie.

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

**D8 — ✅ GEBAUT** — Gateways auf der Karte farblich markieren *(Idee DL9SAU, 2026-08-23)*
*Gebaut 2026-08-24:* `#ff8c00` (darkorange, hält sich besser auf heller Karte als reines
Orange). **Vorrang: eigenes Rufzeichen > Gateway > Mheard > OE-Regex > Standard.** Ein
Knoten kann beides sein, ein Marker hat aber eine Farbe — und „direkter Nachbar" steht
schon in der Heard-Liste, „das hier brückt ins Netz" nirgends sonst. Der `<Overlay>`-Umbau
(D6) war dafür **nicht** nötig; er bleibt offen, falls beides gleichzeitig sichtbar sein soll.

Heute kennt `setMarkerColor()` vier Fälle: **purple** = eigenes Rufzeichen, **green** =
in der Mheard-Liste (direkter HF-Nachbar), **hellblau** `#3ba6db` = österreichische
Club-/Relais-Rufzeichen per Regex `^OE[1-9]X[A-Z]{1,2}-\d{1,2}$`, sonst **blau** `#3578e5`.
Gewünscht: „sicher Gateway" in einer eigenen Farbe (Vorschlag DL9SAU: hellgrün).

*Datenquelle:* **nicht** über `Grp` — siehe Block F, `R=` sind die **selbst gebuchten**
Talkgroups und werden von **jedem** Knoten gesendet, auch von Usern. Kein GW-Indikator.
Es bleibt die **GW-Registry aus D1** (sicher: GW-Bit + genau ein Relay im Pfad ⇒ dieses
Relay **ist** Gateway) plus **D1b** als zweiter, schwächerer Detektor („wahrscheinlich").
*Dritter Weg, heute nicht baubar:* die **HEY-Bake announciert ein Gateway selbst** — Ziel
`HG` statt `H` (Firmware, parkierte Idee 2026-07-28). Das wäre die sichere Auskunft, aber
HEY wird nicht an die App durchgereicht ⇒ hängt an **Firmware-Wunsch E2** (`GW` ins
MH-JSON). Solange der nicht da ist, sind D1/D1b das, was wir haben.
⇒ **D8 hängt an D1**; ohne Registry keine Farbe.

*Offene Punkte vor dem Bauen:*
1. **Farbe: Orange** *(entschieden 2026-08-23)*. Hellgrün fällt weg — grün ist schon
   „direkter Nachbar", das wäre genau die Verwechslung, die wir vermeiden wollen.
   **Lila fällt ebenfalls weg**: das ist bereits das **eigene** Rufzeichen
   (`markerColor_own`). Bleibt Orange — **Sichtprüfung am Gerät bestanden**
   (DL9SAU, 2026-08-24: „orange ist schick").
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

Alle an Stellen, wo die Firmware die Information **bereits hat** — seit dem Quelltext-Lesen
am 2026-08-24 **mit Fundstelle belegt** (lokaler Sparse-Clone `/Users/thomas/MeshCom-Firmware`,
Branch `dev`). Die ersten vier sind je **eine Zeile**: die Daten liegen im selben Struct, sie
werden nur nicht serialisiert. ⇒ Als **PR im Aufwasch**, nicht als Bitte.

1. **`"SRC"` (Ursprung) ins MH-JSON** — heute nur `CALL` = letzter Hop. Mit dem Ursprung
   bestätigen wir HF über **4 Hops** (HEY-Reichweite) statt 2 (Positions-Reichweite).
   *Liegt bereit:* `lora_functions.cpp` füllt `mheardLine.mh_sourcecallsign = aprsmsg.msg_source_call;`
   ⇒ `mhdoc["SRC"] = mheardLine.mh_sourcecallsign.c_str();`
   *Gemessene Begründung* (Feldtest DL9SAU, 2026-08-24, ~75 min an einem Standort mit
   **einem** direkten Nachbarn): 16 HEY-Beobachtungen, davon **5 zuordenbar** (die eigenen
   Baken des Nachbarn) und **11 nicht** — weitergeleitete HEYs fremder Knoten, deren
   Ursprung die Firmware kennt und nicht mitschickt. Mit `SRC` wären das 11 HF-Bestätigungen
   für entfernte Knoten, und D3 könnte auch für Stationen eine Quote führen, die wir nie
   direkt hören. Ohne `SRC` bleibt D3 auf die Handvoll direkter Nachbarn beschränkt.
2. **`"GW"` ins MH-JSON** — die Firmware **wertet `HG` schon aus**:
   `mheard_functions.cpp:537 if(mheardLine.mh_destinationpath == "HG") mheardPathLen[ipos] = ... | 0x80;`
   — sie merkt sich das Gateway-Bit für ihre eigene Pfadtabelle, schickt es aber nicht.
   ⇒ `mhdoc["GW"] = (mheardLine.mh_destinationpath == "HG") ? 1 : 0;`
   Das ist die **sichere** Gateway-Auskunft, auf die D1/D1b nur schätzen (siehe D8).
3. **HEY-Link-Kette durchreichen** (RSSI/SNR je Hop) — die ganze Kette liegt als String da:
   `lora_functions.cpp:664 mheardLine.mh_path_payload = aprsmsg.msg_payload;`, und
   `mheard_functions.cpp:405-445` parst daraus **nur** den Nachbar-Count, der Rest wird
   verworfen. ⇒ `mhdoc["PP"] = mheardLine.mh_path_payload.c_str();` zeigt das **schwache
   Glied** einer Strecke. (Einziger Punkt mit spürbarer Längenwirkung, siehe unten.)
4. **Version genauer melden** *(DL9SAU, 2026-08-24)*: die App zeigt nur `4.35p`.
   `command_functions.cpp:4861` baut `snprintf(fwver, ... "%-4.4s %-1.1s", SOURCE_VERSION,
   SOURCE_VERSION_SUB)` → `idoc["FWVER"]`. Das Build-Datum gibt es schon als
   **`FLASH_VERSION 20260724`**. ⇒ **neuer Schlüssel** `idoc["FWDATE"] = FLASH_VERSION;`
   statt `FWVER` umzuformatieren — so brechen bestehende Apps (auch Upstream) nicht.
   Ein kurzer **git-Hash** wäre die Kür (PlatformIO-Build-Flag), das Datum reicht für
   Sub-Releases.
5. Ältere Wünsche: `pong` → BLE (RTT), `tx-repeated` / MQTT-Durchsatz / Airtime-Zähler.

*Warum ausgerechnet 1 und 2 so viel wert sind* **(DL9SAU, 2026-08-24)**: wir schätzen heute
an **zwei** Stellen, und beide Male aus demselben Grund — das `gw`-Bit wird auch gesetzt,
wenn ein Gateway bloß **HF weiterreicht**, nicht nur beim Einspeisen. Also raten wir sowohl
„ist X überhaupt ein Gateway" (D1/D1b) als auch „kam diese Quelle über HF oder aus dem
Internet" (Weltkugel). Die beiden Einzeiler machen beides deterministisch, **ohne die
Luftschnittstelle anzufassen** — das ist es, was sie als PR überhaupt aussichtsreich macht:
- **`GW` aus dem `HG`-Ziel** ⇒ Gateway-Identität **sicher**. Grenze: nur für Knoten, die wir
  **direkt** hören; für ferne Gateways bleiben D1/D1b.
- **`SRC`** ⇒ HF-Bestätigung des **Ursprungs** über die HEY-Reichweite (4 Hops statt 2 bei
  Positionen). **HEY läuft nur auf HF** — wer dort als Ursprung steht, war nachweislich auf
  der Luft. Damit kippt die unbestimmte Zeile aus D1: `gw`-Bit **plus** HF-bestätigter
  Ursprung heißt dann „ein Gateway hat **weitergereicht**", nicht „eingespeist".
Die 15-min-HEYs sind dafür der Taktgeber: sie kommen regelmäßig, unabhängig vom Verkehr,
und sie kommen ausschließlich über HF.

*Hausordnung des Firmware-Repos* (`CLAUDE.md` im Wurzelverzeichnis, gilt für uns):
PRs gehen gegen den **`dev`**-Branch, vorher auf den aktuellen Stand rebasen;
**minimale, gezielte Änderungen — ausdrücklich keine Umbauten/Refactorings**; und die
**PR-Beschreibung auf Deutsch**, detailliert: welche Dateien/Funktionen geändert wurden und
**warum**, vor dem Absenden verfasst.

*Was der PR beachten muss:*
- Das MH-JSON wird an **zwei** Stellen gebaut — live in `mheard_functions.cpp:331-343` und
  beim Ausgeben der gespeicherten Liste ab `:633`. **Beide** patchen; eine Hilfsfunktion
  wäre schöner, verstößt aber gegen die „keine Refactorings"-Regel oben ⇒ zwei mal dieselbe
  Zeile ist hier die *richtige* Lösung, nicht die faule.
- **Längenbudget:** `uint8_t bleBuffer[MAX_MSG_LEN_PHONE]`, gefüllt per
  `serializeJson(mhdoc, bleBuffer+1, measureJson(mhdoc)+1)` — **ohne Prüfung**, ob das
  Ergebnis in den Puffer passt. Jedes neue Feld wächst bei **jedem** Empfang mit, und
  MH-Sätze sind das häufigste über die Schnittstelle. Eine Grenzprüfung gehört mit in den
  PR (nützt auch ohne unsere Felder).

---

## F · Verifizierte Firmware-Fakten (nicht neu herleiten)

- **RX-Dedup by msg_id** vor Weitergabe an die App → App sieht **unique** Pakete, nie
  Luftschnittstellen-Kopien. „Pakete auf Luft / Retransmissions" ist app-seitig unmöglich.
  *Quelltext 2026-08-24:* `is_new_packet()` (`lora_functions.cpp:1411`) vergleicht die
  4-Byte-`msg_id` gegen einen Ring, und der **ganze** Verarbeitungszweig hängt in
  `if(is_new_packet(...))` (`:702`) — das Duplikat fällt weg, bevor irgendetwas an die App
  geht. Ringgröße `MAX_DEDUP_RING` = **60**, auf einer Variante **100** (Kommentar dort:
  *„was 60, wraparounds observed"*) ⇒ bei dichtem Verkehr kann ein spätes Duplikat doch
  durchrutschen. Folge für `Relayed: n pkts`: dieselbe Nachricht über einen zweiten Pfad
  zählt **einmal**, gutgeschrieben den Relays der **zuerst** eingetroffenen Kopie. *Das ist
  kein Mangel, sondern die Aussage* (DL9SAU): wo mehrere Wege bestehen, ist der, der
  regelmäßig zuerst da ist, **der Weg, über den das Netz hier tatsächlich läuft**. Gemessen
  wird wirksame Zustellung, nicht theoretische Beteiligung — das Paket-Gegenstück zu dem,
  was `Heard via` über Stationen sagt (D2).
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
- **Ack: drei Icons, drei Zustände** (Original-App; Quelltext beider Seiten geprüft
  2026-08-24). **Haken** = die App hat an die Firmware übergeben · **Wolke** = `0x00` ·
  **Wolke mit Haken** = `0x01`/`0x02`. App-seitig: `ack_type 0x00` → 1, `0x01`/`0x02` → 2,
  `ack = 2` ist terminal. Was die Firmware damit **meint**:
  - `0x00` = **„ONLY HEARD"** (`lora_functions.cpp:685`, wörtlich so kommentiert): unser
    eigener Knoten hat unsere eigene **Text**nachricht wieder von der Luft empfangen, jemand
    hat sie also **wiederholt**. Lokal erzeugt, **einmal**, und nur **solange noch kein Ack
    vermerkt ist** (`own_msg_id[icheck][4] == 0x00`). Aussage über **Ausbreitung**, nicht
    über Zustellung.
  - `0x01` = ein **Ack**: über die Luft von einem **Gateway** (`lora_functions.cpp:1026`
    bzw. `:1057`, im Zweig `if(bGATEWAY && bSendAckGateway)`; **nur** für `*`, `WLNK-1`,
    `APRS2SOTA` und Gruppen — eine reine DM wird dort ausdrücklich **nicht** bestätigt),
    **oder** der eigene Knoten meldet „Server erreicht" (`loop_functions.cpp:3426`, nur
    wenn er selbst Gateway mit IP ist).
  - `0x02` = **Altlast**. `print_buff[10]` wird in der ganzen Firmware **ausschließlich auf
    `0x01`** gesetzt; als Flag über die Luft kommen `0x00`/`0x02` nicht vor.
  - **DM-Bestätigung läuft anders**: der Absender hängt einen APRS-Ack-Wunsch `{NNN` an die
    Nutzlast (`loop_functions.cpp:3391`), die Bestätigung kommt über den APRS-Mechanismus
    zurück, nicht über diesen Binärpfad. *(Wie die App das auf das Icon abbildet, ist noch
    nicht nachgelesen.)*
  - ⇒ **`acked` impliziert `repeated-only` nicht.** Kommt das Ack zuerst, unterbleibt der
    Heard-Bericht ganz; und ein Repeat kann ohne jedes Ack bleiben. Getrennte Beobachtungen,
    keine Stufen einer Leiter (Rückfrage DL9SAU 2026-08-24).
  - **Feldtest 2026-08-24 (DL9SAU), zwei Befunde:** (a) Der beobachtete **Repeat einer
    Kanalnachricht** landet **nicht** im Repeat-Topf — für `*`-Verkehr meldet die Firmware
    ihn als Ack. Der Topf zählt also „wiederholt gehört **und sonst nichts**", daher der
    Name `repeated-only`. (b) Eine **DM an db0fri-12** hat `acked` von 1 auf 2 gezogen: der
    adressierte Knoten bestätigt also selbst, und das erreicht die App über denselben Pfad.
    ⇒ `acked` heißt **bei einer DM** „der Empfänger hat's", **bei einer Kanalnachricht**
    „ein Gateway hat's bzw. es kam wiederholt zurück". Zwei Bedeutungen, ein Icon — das ist
    Firmware-seitig so und wird nicht umgebaut.
  ⇒ **„Wolke mit Haken" heißt nur bei einer DM „der Empfänger hat's".** Bei einer
  Kanalnachricht bedeutet dasselbe Icon „Server erreicht / Rundruf-Ack". Die Firmware
  räumt an der Stelle selbst ein, dass die Unterscheidung nicht implementiert ist:
  `print_buff[10]=0x01; // switch ack GW / Node currently fixed to 0x00`.
  Das ist der „Teil-Ack" aus DL9SAUs Einwand, an der Quelle belegt — **trotzdem nicht
  umbauen**, das Verhalten ist so gewollt (Entscheidung 2026-08-24).
- **`PL` im MH-JSON zählt Pfad-Einträge INKLUSIVE Absender** (Quelltext geprüft
  2026-08-24, `aprs_functions.cpp`): `msg_last_path_cnt` startet bei **1** und wird je
  Komma im Quellpfad erhöht. ⇒ **direkt gehört = `PL 1`**, ein Relay = 2, usw. Eine **0
  kann gar nicht vorkommen**. Damit ist die offene Frage aus D3 beantwortet.
- **`updateMheard` läuft für JEDES empfangene LoRa-Paket**, sofern der letzte Hop nicht das
  eigene Rufzeichen ist (`lora_functions.cpp`) — die Grundlage von D3.
- **12-h-Purge der Mheard-Liste bestätigt** (`mheard_functions.cpp`):
  `if((mheardEpoch[iset]+(60*60*12)) < getUnixClock())`. Das ist das Fenster, auf das sich
  D1b stützt.
- **`MAX_MHEARD` ist gedeckelt**: **30** (ESP32), **80** (ESP32-S3/nRF52840), 50
  (XML/SBUFFER), 10 (TBEAM-Dev). Hat ein Knoten mehr Nachbarn als der Deckel, sättigt NCNT
  ⇒ **möglicher Fehlalarm bei D1b**. Bei 30/80 selten, aber jetzt benannt statt vermutet.
- **Die Firmware verwirft selbst Mheard-Sätze mit unsynchronisierter Uhr**:
  `if(strYear.toInt() < 2025) return;` — unsere eigene Zeitstempel-Prüfung in D3 passt dazu.
- **Versions-Konstanten** (`configuration_global.h`): `SOURCE_VERSION "4.35"`,
  `SOURCE_VERSION_SUB "p"`, `SOURCE_VERSION_WEB_SUB "p"`, **`FLASH_VERSION 20260724`**.
  Das Build-Datum **gibt es also schon** — es wird nur nicht an die App gemeldet (→ E4).
- **Server ist Blackbox** (closed source) — er **strippt den Pfad** beim Verteilen
  (Feldbeobachtung). Der hintere Teil `>xxx,DEST` behält dagegen den HF-Teil vor dem Gatewayen.
