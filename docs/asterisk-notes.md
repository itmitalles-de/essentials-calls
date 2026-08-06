# Fallstricke

Alles hier ist beim Bauen aufgefallen und wurde gegen einen laufenden
Asterisk 18 (Ubuntu 22.04) geprüft — nicht aus der Dokumentation abgeleitet.
Gemeinsames Muster: Die Konfiguration lädt fehlerfrei, und der Fehler zeigt
sich erst im Anruf.

## Endpoints heißen wie der SIP-User, nicht wie der Node

```
NOTICE res_pjsip/pjsip_distributor.c: Request 'REGISTER' from '<sip:101@…>'
       failed for '…' - No matching endpoint found
```

Asterisk ordnet eine eingehende Anfrage über den **Endpoint-Namen** zu;
`identify_by` steht per Default auf `username,ip`. Ein Endpoint namens
`ext_101` wird von einem Telefon, das sich als `101` anmeldet, nie gefunden —
auch dann nicht, wenn `username=101` im Auth-Abschnitt steht.

`identify_by=auth_username` löst es nicht. Der zuverlässige Weg ist, den
Abschnitt nach dem SIP-User zu benennen. Deshalb verlangt der Validator einen
eindeutigen `sipUser`.

Tückisch daran: `pjsip show endpoints` listet die Objekte sauber auf. Dass
sich nichts registrieren kann, sieht man erst beim Versuch.

## `max_contacts=1` sperrt neu startende Telefone aus

```
WARNING res_pjsip_registrar.c: Registration attempt from endpoint '101'
        to AOR '101' will exceed max contacts of 1
```

Ein Telefon, das neu startet, meldet sich von einem neuen Quellport. Ohne
Ersetzungsregel gilt das als zusätzlicher Kontakt und wird mit `403` abgelehnt,
bis die alte Registrierung abläuft. Behoben mit `remove_existing=yes` am AOR.

## Ubuntu lädt das falsche Voicemail-Modul

```
ERROR loader.c: app_voicemail declined to load.
WARNING app_voicemail_odbc.c: Failed to obtain database object for 'asterisk'!
```

Das Paket bringt drei sich ausschließende Voicemail-Backends mit; wer zuerst
lädt, gewinnt. Gewonnen hatte `app_voicemail_odbc`, das eine ODBC-Datenbank
braucht und bei jeder Nachricht scheitert.

Besonders irreführend: `voicemail show users` listete die Mailboxen korrekt auf.
Nur speichern konnte es nichts. `modules.conf` blockiert jetzt die ODBC- und
IMAP-Varianten.

## Asterisk kennt kein `${VAR:-default}`

`${VAR:-0}` ist keine Shell-Ersetzung, sondern Substring-Syntax, und liefert
einen leeren String. Aus `$[${RETRY:-0} + 1]` wird `$[ + 1]`:

```
WARNING ast_expr2.fl: ast_yyerror(): syntax error, unexpected '+', expecting $end
```

Gelöst durch Initialisieren beim Eintritt plus `0`-Präfix im Ausdruck
(`$[0${RETRY} + 1]`), das auch bei ungesetzter Variable gültig bleibt.

## Erneuter IVR-Prompt darf nicht auf Priorität 1 springen

Ein `Goto(ivr_x,s,1)` nach einer Fehleingabe läuft erneut über
`Set(RETRY=0)` — der Zähler wird zurückgesetzt und die Schleife endet nie.
Der Sprung geht deshalb auf das Label `(menu)` hinter der Initialisierung.

## Endpoints erreichen nur ihren eigenen Kontext

Endpoints registrieren in `internal`. Ein zweiter Kontext `entrypoints` ist von
dort **nicht** wählbar, solange kein `include => entrypoints` in `internal`
steht. Ohne das waren die dokumentierten Testnummern schlicht tot, obwohl
`dialplan show entrypoints` sie korrekt anzeigte.

## `roundrobin` gibt es in Queues nicht mehr

Die Strategie wurde in Asterisk 12 entfernt. `app_queue` fällt still auf
`ringall` zurück. Der Generator übersetzt nach `rrmemory`.

## Queue-Wartezeit steht nicht in `queues.conf`

`timeout` dort ist die Klingeldauer **pro Agent**. Die maximale Gesamtwartezeit
ist das fünfte Argument der Applikation: `Queue(name,,,,120)`. Wer nur
`queues.conf` setzt, wundert sich über Anrufer, die ewig warten.

## Eigene Ansagen liegen woanders, als man denkt

Auf Debian/Ubuntu ist `/usr/share/asterisk/sounds/custom` ein Symlink nach
`/usr/local/share/asterisk/sounds`. Dateien dort sind als `custom/<name>`
abspielbar.

`format_wav` verlangt PCM, Mono, 16 Bit, 8 oder 16 kHz. Eine Stereo- oder
44,1-kHz-Datei wird klaglos gespeichert und scheitert erst im Anruf — deshalb
prüft das Backend den RIFF-Header beim Upload.

Prompt-Namen ohne Endung angeben: Asterisk sucht das passende Format selbst.
`welcome` existiert übrigens nicht in den Core-Sounds, `hello-world` schon.

## Debian bookworm hat kein Asterisk-Paket

`E: Package 'asterisk' has no installation candidate`. Das Image basiert
deshalb auf Ubuntu 22.04, dessen `universe` Asterisk 18.10 mitbringt.

## Nützlich beim Prüfen

Das Messages-Log enthält nur notice/warning/error. Was ein Anruf tatsächlich
durchlaufen hat, steht im CDR:

```bash
docker compose exec asterisk asterisk -rx "channel originate Local/603@internal application Wait 6"
docker compose exec asterisk cat /var/log/asterisk/cdr-csv/Master.csv | tail -2
```

Die Spalten für Kontext und letzte Applikation zeigen, wo der Anruf gelandet
ist — deutlich verlässlicher als zu prüfen, ob die Config „geladen aussieht".

---

## Nicht Asterisk: React Flow verliert Kanten

Wird das `nodes`-Array bei jedem Render neu aus dem State aufgebaut, verliert
React Flow seine per ResizeObserver gemessenen Node-Größen. Ohne die kann es
keine Kanten berechnen und rendert **stillschweigend gar keine** — keine
Warnung, keine Fehlermeldung, die Kanten sind einfach weg.

Der Editor hält die Liste deshalb über `useNodesState` und merged Änderungen
aus der Topologie hinein, statt sie neu abzuleiten. Aus demselben Grund werden
Löschungen aus React Flow zurück in die Topologie gespiegelt — sonst setzt der
Sync-Effekt den Node sofort wieder ein und das Löschen wirkt folgenlos.
