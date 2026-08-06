# Stand und offene Punkte

Stand 2026-08-06. Der PoC ist funktionsfähig und gegen einen laufenden
Asterisk 18 verifiziert, aber bewusst kein Produkt.

## Verifiziert

| Was | Wie geprüft |
|---|---|
| Registrierung | echter SIP-REGISTER mit Digest-Auth, 101 und 102, `200 OK`, Kontakte in `pjsip show contacts` |
| Wiederholte Registrierung | dreimal von neuem Port, jeweils `200 OK`, genau ein Kontakt bleibt |
| Callflow-Ausführung | Anruf auf `603` landet laut CDR in `ivr_ivr_welcome` bei `WaitExten(5)` |
| Eigene Ansage | hochgeladene Datei wird abgespielt, fehlende meldet „does not exist" |
| Voicemail | `app_voicemail.so` läuft, Mailboxen geladen, keine ODBC-Fehler mehr |
| Robustheit der API | kaputtes JSON, `{}`, `nodes: null` → jeweils `400`, Prozess läuft weiter |
| Dark Mode | dunkles OS ohne Klick dunkel; Toggle übersteuert beide Richtungen; überlebt Reload |
| Editor | Node anlegen/löschen, Kanten, Validierung blockiert Deploy — ohne JS-Fehler |
| Tests | 52 Fälle über Validator, Generator und Sound-Validierung |

## Bekannte Einschränkungen

**Telefonie**

- Kein Trunk/DID — nur interne Extensions und generierte Testnummern ab 600.
- RingGroup-Strategien außer `ringall` sind eine sequentielle Näherung ohne
  Gedächtnis über Anrufe hinweg. Echtes Round-Robin bräuchte `app_queue`.
- Kein Zeitplan (Öffnungszeiten), keine Feiertagsregeln, keine Rufumleitung
  nach extern.

**Betrieb**

- Keine Authentifizierung an der Oberfläche.
- SIP-Passwörter im Klartext gespeichert und über die API ausgeliefert.
- Eine JSON-Datei ohne Locking oder Historie; parallele Bearbeitung überschreibt.
- Statusabfrage pollt alle 3 s per AMI. Für viele Nodes wäre ein Event-Abo
  (`Newstate`, `QueueCallerJoin`) sparsamer.
- Mikrofonaufnahme braucht einen sicheren Kontext — über `localhost` in Ordnung,
  unter einer LAN-IP ohne HTTPS blockt der Browser. Upload geht weiterhin.

**Modell**

- Löschen einer Ansage prüft nicht, ob ein IVR sie noch verwendet; der Fehler
  fällt erst im Anruf auf. Die Dateiliste ist nicht Teil der Topologie, deshalb
  kann der Validator es nicht sehen.
- `trunk` und `external` sind im Typsystem reserviert, aber deaktiviert.

## Wenn es weitergehen soll

Grob nach Nutzen sortiert, mit ehrlicher Aufwandsschätzung.

**Klein (Stunden)**

- Ansagen-Referenzen validieren: Sound-Liste ins Validierungsergebnis ziehen,
  damit ein IVR mit fehlender Datei vor dem Deploy auffällt.
- Undo/Redo im Editor — die Topologie ist bereits ein einfaches Zustandsobjekt.
- Export/Import der Topologie als Datei.

**Mittel (Tage)**

- Authentifizierung, und sei es nur ein Passwort vor der Oberfläche. Ohne das
  ist alles Weitere ohnehin nicht einsetzbar.
- SIP-Passwörter verschlüsselt ablegen und in `GET /api/topology` maskieren.
- Zeitpläne als eigener Node-Typ (Öffnungszeiten, Feiertage) — im Dialplan über
  `GotoIfTime` gut abbildbar.
- AMI-Events statt Polling für den Status.

**Groß (Wochen)**

- Trunk/DID: Registrierung beim Provider, eingehendes Routing, ausgehende
  Regeln, Notrufbehandlung. Das ist der Schritt vom Demonstrator zur Anlage.
- Mehrbenutzerbetrieb mit Rollen und Änderungshistorie; die JSON-Datei müsste
  dafür einer echten Datenbank weichen.
- Echtes Queue-Reporting (Wartezeiten, Abbruchquoten, Agentenstatistik).

## Bewusste Entscheidungen

Damit sie nicht später als Versäumnis gelesen werden:

- **Audiokonvertierung im Browser** statt ffmpeg im Backend. Spart ein großes
  Abhängigkeitspaket, und Aufnahme wie Upload gehen durch denselben Pfad.
- **Config-Dateien plus AMI-Reload** statt Asterisk-Realtime (Datenbank). Der
  generierte Dialplan bleibt lesbar und von Hand nachvollziehbar, was für einen
  PoC mehr wert ist als dynamisches Nachladen.
- **Validator in `shared`**, nicht doppelt implementiert. Der Editor zeigt
  Fehler sofort, das Backend vertraut dem Client trotzdem nicht.
- **Status nicht persistiert.** Er ist eine Momentaufnahme der Anlage, keine
  Eigenschaft des Callflows.
