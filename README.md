# Visual PBX

Visueller Callflow-Editor für eine Telefonanlage. Der Graph wird in
Asterisk-Konfiguration übersetzt und per AMI in einen laufenden Asterisk
geladen. Läuft komplett als Docker-Compose-Stack.

Proof of Concept — funktionsfähig und gegen einen laufenden Asterisk 18
verifiziert, aber ohne Authentifizierung und ohne Trunk-Anbindung.
Einschränkungen: [docs/roadmap.md](docs/roadmap.md).

## Starten

```bash
cp .env.example .env      # AMI_SECRET ändern
docker compose up -d --build
```

Oberfläche: <http://localhost:8080>

Die Beispieltopologie (Alice, Bob, Support-Ringgruppe, Willkommens-IVR) wird
beim ersten Start angelegt.

## Was es kann

- **Einfache Ansicht** — Node-Graph-Editor: Nodes anlegen, Kanten ziehen,
  Eigenschaften im Inspector bearbeiten.
- **Erweiterte Ansicht** — dieselben Daten als Tabellen, plus Fehlerliste.
- **Live-Validierung** — dieselben Regeln im Browser und im Backend; ein
  fehlerhafter Callflow lässt sich nicht deployen.
- **Deploy** — erzeugt `pjsip`-, `extensions`-, `queues`- und
  `voicemail`-Config und lädt sie per AMI nach.
- **IVR-Ansagen** — im Browser aufnehmen oder Datei hochladen; die Umwandlung
  nach 8 kHz Mono WAV passiert im Browser.
- **Live-Status** — registriert / im Gespräch / Queue-Wartende, per WebSocket.
- **Dark Mode** — folgt dem System, manuell übersteuerbar, bleibt gespeichert.

## Schnell testen

```bash
# Registrierung prüfen, ohne Softphone
python3 scripts/sip-register-test.py 101 alice123

# Callflow anstoßen, ohne Telefon
docker compose exec asterisk asterisk -rx "channel originate Local/603@internal application Wait 6"
docker compose exec asterisk cat /var/log/asterisk/cdr-csv/Master.csv | tail -2
```

Mit einem Softphone: gegen `<host>:5060` registrieren, Benutzer `101` /
Passwort `alice123` (bzw. `102` / `bob123`). Dann `101`, `102` oder die
Testnummern ab `600` wählen — je eine pro Node, weil es keinen Trunk gibt.

## Entwicklung

```bash
npm install
npm run typecheck
npm test            # 52 Tests: Validator, Config-Generator, Sound-Validierung
npm run build

npm run dev:backend    # erwartet AMI auf localhost:5038
npm run dev:frontend   # Vite auf :5173
```

## Aufbau

```
shared/    Domain-Modell + Validator (von Backend und Frontend genutzt)
backend/   Express-API, Config-Generator, AMI-Client, Ansagen-Ablage
frontend/  React + React Flow, ausgeliefert von nginx
asterisk/  Asterisk 18 auf Ubuntu 22.04, Basis-Configs
scripts/   sip-register-test.py
```

## Dokumentation

| Dokument | Inhalt |
|---|---|
| [Architektur](docs/architecture.md) | Komponenten, Datenfluss, Deploy-Pipeline |
| [Domain-Modell](docs/domain-model.md) | Topologie und alle Validierungsregeln |
| [Asterisk-Abbildung](docs/asterisk-mapping.md) | Wie aus Nodes Config wird |
| [API](docs/api.md) | REST und WebSocket |
| [Betrieb](docs/operations.md) | Konfiguration, Testen, Fehlersuche, Sicherheit |
| [Fallstricke](docs/asterisk-notes.md) | Was erst im laufenden Asterisk auffiel |
| [Stand und Offenes](docs/roadmap.md) | Verifiziertes, Grenzen, mögliche Schritte |

Wer an der Asterisk-Erzeugung arbeitet, sollte mit
[docs/asterisk-notes.md](docs/asterisk-notes.md) anfangen: Dort steht, welche
Konstrukte fehlerfrei laden und trotzdem nicht funktionieren.
