# API

Basis-URL `http://127.0.0.1:4000` (direkt) oder `/api` über den nginx des
Frontends. Alle JSON-Antworten sind UTF-8; Fehlermeldungen sind deutsch, weil
sie unverändert in der Oberfläche angezeigt werden.

## Topologie

### `GET /api/topology`

Liefert die gespeicherte Topologie. Beim ersten Start wird die Beispieltopologie
angelegt.

> Enthält SIP-Passwörter im Klartext. Siehe [operations.md](operations.md#sicherheit).

### `PUT /api/topology`

Speichert eine Topologie. Wird nur bei fehlerfreier Validierung geschrieben.

```json
{ "saved": true, "issues": [] }
```

`400` bei Struktur- oder Regelfehlern:

```json
{ "saved": false, "issues": [{ "severity": "error", "code": "duplicate-sip-user", "message": "…", "nodeId": "ext-102" }] }
```

### `POST /api/topology/validate`

Prüft, ohne zu speichern. Antwortet immer `200` mit `{ "issues": [...] }` —
auch Warnungen erscheinen hier.

### `POST /api/deploy`

Validiert, speichert, erzeugt die Config und lädt sie in Asterisk.

Mit leerem Body (`{}`) wird die gespeicherte Topologie deployt; mit einer
Topologie im Body wird diese zuvor gespeichert.

```json
{ "deployed": true, "issues": [], "configsWritten": true, "reloaded": true }
```

Wenn Asterisk nicht erreichbar ist, sind die Dateien trotzdem geschrieben:

```json
{ "deployed": false, "configsWritten": true, "reloaded": false, "reloadError": "AMI connect timeout (asterisk:5038)" }
```

`400`, wenn die Validierung Fehler meldet — dann passiert nichts.

### `GET /api/status`

Momentaufnahme des Node-Status. Für laufende Aktualisierung besser den WebSocket
nutzen.

```json
{ "statuses": [ { "nodeId": "ext-101", "availability": "online", "activity": "idle" } ] }
```

Ist Asterisk nicht erreichbar, steht überall `unknown` — kein Fehler.

## Ansagen

### `GET /api/sounds`

```json
{ "sounds": [ { "name": "willkommen", "reference": "custom/willkommen",
                "sizeBytes": 16044, "updatedAt": "2026-08-06T21:12:53.637Z",
                "durationSeconds": 1 } ] }
```

`reference` ist der Wert, der ins `greeting`-Feld eines IVR gehört.

### `PUT /api/sounds/:name`

Lädt eine Ansage hoch. Body ist die rohe WAV-Datei (kein Multipart),
`Content-Type: audio/wav`, maximal 5 MB.

Der Name wird auf `[a-z0-9_-]` reduziert; eine Endung `.wav` wird entfernt.
Punkte sind bewusst nicht erlaubt, damit `..` nicht als Namensbestandteil
überlebt.

Akzeptiert wird nur, was Asterisk auch abspielen kann: PCM, Mono, 16 Bit,
8000 oder 16000 Hz. Andernfalls `400` mit konkreter Begründung:

```json
{ "error": "Nur Mono wird unterstützt (Datei hat 2 Kanäle)." }
```

Die Prüfung ist kein Formalismus — eine Stereo-Datei wird klaglos gespeichert
und scheitert erst mitten im Anruf.

```bash
curl -X PUT http://127.0.0.1:4000/api/sounds/willkommen \
     -H 'Content-Type: audio/wav' --data-binary @ansage.wav
```

### `GET /api/sounds/:name`

Liefert die WAV-Datei zurück (`audio/wav`), für die Vorschau im Editor.

### `DELETE /api/sounds/:name`

```json
{ "deleted": true }
```

Löscht nur die Datei. Ein IVR, das noch darauf zeigt, bleibt unverändert und
scheitert dann beim Anruf — der Validator kann das nicht sehen, weil die
Dateiliste nicht Teil der Topologie ist.

## WebSocket

`ws://<host>/ws/status`

Nach dem Verbinden kommt sofort eine Nachricht, danach alle 3 Sekunden:

```json
{ "type": "status", "statuses": [ { "nodeId": "ext-101", "availability": "online", "activity": "in_call" } ] }
```

Es gibt keine Nachrichten vom Client zum Server.

## Sonstiges

`GET /api/health` → `{ "ok": true }`

## Fehlerformat

Validierungsfehler kommen als `issues`-Liste (siehe
[domain-model.md](domain-model.md#validierungsregeln)). Alles andere:

```json
{ "error": "Ungültiges JSON im Request-Body." }
```

`500` wird geloggt und generisch beantwortet. Ein fehlerhafter Request beendet
den Prozess nicht — das war einmal anders und ist mit Error-Middleware und
Shape-Prüfung behoben.
