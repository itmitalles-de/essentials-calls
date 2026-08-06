# Visual PBX

PoC: visueller Callflow-Editor für eine PBX, mit generierten Asterisk-Configs und
Live-Reload über die Asterisk Manager Interface (AMI). Läuft komplett als
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
docker compose up -d --build
```

- Frontend: http://localhost:8080
- Backend-API: http://localhost:4000
- Asterisk AMI: localhost:5038 (User/Passwort: `visualpbx` / `visualpbx` — **nur PoC**)
- Asterisk SIP: UDP 5060, RTP 10000-10100

Die Beispiel-Topologie (Alice/Bob + Support-Ringgroup + Willkommens-IVR) wird beim
ersten Start automatisch angelegt (`backend/src/model/store.ts`).

## Testen mit einem Softphone

Extension `101` (Alice, Passwort `alice123`) bzw. `102` (Bob, `bob123`) in einem
SIP-Softphone gegen `<host>:5060` registrieren. Zum Testen des Callflows ohne
Trunk/DID (im PoC deaktiviert) wählt man die generierten Entry-Points `600`, `601`, …
(eine Nummer pro Node in der Topologie, siehe `[entrypoints]` in
`extensions_generated.conf`).

## Validierungsregeln (Kurzfassung)

- Erlaubte Kantenübergänge: siehe `shared/src/validator.ts` (`ALLOWED_TRANSITIONS`).
- Voicemail-Nodes haben keine ausgehenden Kanten.
- Trunk/External-Nodes sind reserviert und im PoC deaktiviert.
- Zyklen im Graph brauchen mindestens eine Kante mit `timeout`- oder
  `invalid`-Condition als Exit, sonst Validierungsfehler.

## Bekannte PoC-Einschränkungen

- Keine Trunk-/DID-Anbindung an echte Telefonie (nur interne Extensions + Entry-Points).
- AMI-Zugangsdaten sind hart codiert (`asterisk/conf-templates/manager.conf`,
  `docker-compose.yml`) — vor jedem Einsatz außerhalb einer lokalen Sandbox ändern.
- Persistenz ist eine einzelne JSON-Datei (`pbx-data`-Volume), keine Historie/Mehrbenutzer.
- IVR-Retry-Zähler ist pro Asterisk-Channel-Variable, kein globaler State.

## Entwicklung ohne Docker

```bash
npm install
npm run build:shared
npm run dev:backend    # erwartet Asterisk/AMI auf localhost:5038 (z.B. via docker compose up asterisk)
npm run dev:frontend   # Vite Dev-Server auf :5173, proxied /api und /ws auf localhost:4000
```
