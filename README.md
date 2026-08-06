# Visual PBX

PoC: visueller Callflow-Editor für eine PBX, mit generierten Asterisk-Configs und
Live-Reload über das Asterisk Manager Interface (AMI). Läuft komplett als
Docker-Compose-Stack (Frontend, Backend, Asterisk).

## Architektur

```
shared/    Domain-Modell (Topology/Node/Edge/Membership) + Validator, TypeScript
backend/   Express-API: Validierung, Asterisk-Config-Generator, AMI-Client, WebSocket-Status
frontend/  React + React Flow: einfache Ansicht (Graph-Editor) + erweiterte Ansicht (Tabellen)
asterisk/  Ubuntu-22.04-Image mit Asterisk 18, statische Base-Configs + generierte Includes
```

- **Einfache Ansicht**: ComfyUI-artiger Node-Graph-Editor (React Flow). Nodes per Klick
  hinzufügen, Kanten per Drag zwischen Handles ziehen, Eigenschaften im rechten
  Panel bearbeiten.
- **Erweiterte Ansicht**: Rohdaten-/Tabellenansicht für Nodes, Edges, Memberships.
- **Deploy**: validiert die Topologie, generiert `pjsip_generated.conf`,
  `extensions_generated.conf`, `queues_generated.conf`, `voicemail_generated.conf`
  und lädt sie per AMI (`dialplan reload`, `pjsip reload`, `queue reload all`,
  `voicemail reload`) in den laufenden Asterisk-Container.
- **Status**: Node-Status (online/offline, idle/ringing/in_call, Queue-Wartende)
  wird per WebSocket alle 3s aus `PJSIPShowEndpoints`/`QueueStatus` gepusht.

## Starten

```bash
cp .env.example .env    # AMI_SECRET anpassen
docker compose up -d --build
```

- Frontend: http://localhost:8080
- Backend-API: http://127.0.0.1:4000
- Asterisk AMI: 127.0.0.1:5038 (nur lokal veröffentlicht)
- Asterisk SIP: UDP 5060, RTP 10000-10100 (für Softphones im LAN offen)

Die Beispiel-Topologie (Alice/Bob + Support-Ringgroup + Willkommens-IVR) wird beim
ersten Start automatisch angelegt (`backend/src/model/store.ts`).

## Testen

### 1. Registrierung prüfen (ohne Softphone)

```bash
python3 scripts/sip-register-test.py 101 alice123
```

Macht einen echten SIP-REGISTER mit Digest-Auth (rohes UDP, keine
Abhängigkeiten) und sagt, ob Asterisk die Extension akzeptiert. Damit lässt sich
trennen, ob ein Problem an der generierten Config oder am Softphone liegt.
Von einem anderen Rechner aus mit Host-Angabe: `… 101 alice123 192.168.1.50`.

Gegenprobe in Asterisk:

```bash
docker compose exec asterisk asterisk -rx "pjsip show contacts"
```

### 2. Mit einem Softphone

Beliebiges SIP-Softphone (Linphone, Zoiper, MicroSIP) gegen `<host>:5060`
registrieren — Benutzer und Passwort sind das, was im Editor unter *SIP User* /
*SIP Passwort* steht (Seed: `101` / `alice123`, `102` / `bob123`).

Wichtig: Asterisk identifiziert ein Gerät über den **SIP-User**, nicht über die
Extension-Nummer. Der Generator benennt die PJSIP-Objekte deshalb nach dem
SIP-User.

### 3. Callflow anrufen

Es gibt keinen Trunk/DID (im PoC nicht implementiert), deshalb generiert das
Backend Test-Entry-Points: **eine Nummer pro Node, beginnend bei `600`** in
Reihenfolge der Node-Liste. `600` springt in den ersten Node, `601` in den
zweiten usw. Die Zuordnung steht als Kommentar im `[entrypoints]`-Kontext von
`extensions_generated.conf`:

```bash
docker compose exec asterisk asterisk -rx "dialplan show entrypoints"
```

Ohne Softphone lässt sich ein Callflow auch direkt anstoßen:

```bash
docker compose exec asterisk asterisk -rx "channel originate Local/603@internal application Wait 6"
docker compose exec asterisk cat /var/log/asterisk/cdr-csv/Master.csv | tail -2
```

Das CDR zeigt, in welchem Kontext und bei welcher Applikation der Anruf gelandet
ist — praktisch, weil das Messages-Log nur notice/warning/error enthält, kein
Verbose.

### 4. Automatisierte Tests

```bash
npm test        # Validator- und Generator-Tests
npm run typecheck
```

## Entwicklung

```bash
npm install
npm run typecheck   # shared bauen + backend/frontend typecheck
npm test            # Validator- und Generator-Tests (node:test)
npm run build       # Produktions-Bundles

npm run dev:backend    # erwartet Asterisk/AMI auf localhost:5038
npm run dev:frontend   # Vite Dev-Server auf :5173, proxied /api und /ws auf localhost:4000
```

## Validierungsregeln

Der Validator (`shared/src/validator.ts`) läuft identisch im Frontend (live) und
im Backend (vor jedem Speichern/Deploy):

- **Struktur**: Die API akzeptiert beliebiges JSON, deshalb wird die Form geprüft,
  bevor irgendeine Regel auf Felder zugreift.
- **Kantenübergänge**: nur erlaubte Typkombinationen (`ALLOWED_TRANSITIONS`).
- **Voicemail** hat keine ausgehenden Kanten; **Trunk/External** sind reserviert
  und im PoC deaktiviert.
- **Eindeutigkeit**: Node-/Edge-/Membership-IDs, Extension-Nummern, Mailboxen,
  IVR-Ziffern.
- **Eindeutige Fallbacks**: Extension/RingGroup/Queue haben genau einen
  Nachfolger — mehrere ausgehende Kanten würden beim Generieren still verworfen.
- **Gruppen brauchen Mitglieder**: eine leere RingGroup/Queue kann keinen Anruf
  zustellen.
- **Zyklen**: jeder Zyklus braucht mindestens eine Kante mit `timeout` oder
  `invalid` als Exit. Die Prüfung zählt echte einfache Zyklen auf (nicht nur
  einen Repräsentanten pro Back-Edge), damit ein Zyklus ohne Exit sich nicht
  hinter einem Nachbarzyklus mit Exit verstecken kann.

## Umsetzungsdetails, die beim Bauen wichtig wurden

Verifiziert gegen den laufenden Asterisk-18-Container:

- **Endpoint-Benennung**: Asterisk ordnet eine eingehende Registrierung über den
  **Endpoint-Namen** zu (`identify_by` ist per Default `username,ip`). Benennt
  man Endpoints nach der Node-ID (`ext_101`), scheitert jede Registrierung mit
  „No matching endpoint found“, weil das Telefon sich als `101` meldet. Die
  PJSIP-Objekte heißen deshalb wie der SIP-User.
- **AOR `remove_existing`**: Mit `max_contacts=1` und ohne Ersetzungsregel lehnt
  Asterisk ein Telefon ab, das sich nach einem Neustart von einem neuen Port
  meldet („will exceed max contacts“), bis die alte Registrierung abläuft.
- **Voicemail-Modul**: Ubuntu liefert drei sich gegenseitig ausschließende
  Voicemail-Backends. `app_voicemail_odbc` gewann das Laden und scheiterte an der
  fehlenden Datenbank — Voicemail sah konfiguriert aus, konnte aber nichts
  speichern. `modules.conf` blockiert daher die ODBC-/IMAP-Varianten.
- **Entry-Points**: Endpoints registrieren in den Kontext `internal`; die
  Test-Nummern brauchen deshalb ein `include => entrypoints`, sonst sind sie
  nicht wählbar.
- **IVR-Retry**: Asterisk kennt kein `${VAR:-default}` (das ist Substring-Syntax).
  Der Zähler wird beim Eintritt gesetzt, und ein erneuter Prompt springt auf das
  Label `(menu)` statt auf Priorität 1 — sonst würde der Zähler bei jeder
  Fehleingabe zurückgesetzt.
- **Queue-Strategie**: `roundrobin` wurde in Asterisk 12 entfernt; der Generator
  übersetzt es nach `rrmemory`, statt es still zu ignorieren.
- **Queue-Wartezeit**: `timeout` in `queues.conf` ist nur die Klingeldauer pro
  Agent. Die Gesamtwartezeit ist das 5. Argument der `Queue()`-Applikation.
- **RingGroup-Strategie**: `Dial()` kann nur parallel klingeln. `ringall` wird
  parallel umgesetzt, alle geordneten Strategien als sequentielle `Dial()`-Kette
  in Membership-Reihenfolge (Näherung, siehe Einschränkungen).
- **Prompt-Dateien**: Namen werden von Asterisk unter
  `/usr/share/asterisk/sounds/` aufgelöst. `hello-world` existiert, `welcome`
  nicht — ein nicht vorhandener Prompt fällt erst zur Laufzeit auf.
- **React Flow**: Nodes dürfen nicht bei jedem Render neu aus dem State
  aufgebaut werden, sonst verliert React Flow seine Größenmessung und rendert
  **stillschweigend gar keine Kanten**. Der Editor hält die Node-Liste über
  `useNodesState` und merged Änderungen hinein.

## Bekannte PoC-Einschränkungen

- Keine Trunk-/DID-Anbindung an echte Telefonie (nur interne Extensions +
  generierte Test-Entry-Points).
- RingGroup-Strategien außer `ringall` sind eine sequentielle Näherung; echtes
  Round-Robin mit Gedächtnis über Anrufe hinweg bräuchte `app_queue`.
- SIP-Passwörter stehen im Klartext in der Topologie-JSON und werden von der API
  unverschlüsselt ausgeliefert.
- Persistenz ist eine einzelne JSON-Datei (`pbx-data`-Volume), ohne Historie,
  Locking oder Mehrbenutzerbetrieb.
- AMI-Zugangsdaten haben Default-Werte (`visualpbx`/`visualpbx`); der Container
  warnt beim Start, wenn das Default-Secret aktiv ist.
- Der Status-Poller fragt alle 3s per AMI ab; für viele Nodes wäre ein
  Event-Abo (`Newstate`/`QueueCallerJoin`) sparsamer.
