# Dokumentation

Stand: 2026-08-06. Beschreibt den PoC so, wie er im Repo liegt und gegen einen
laufenden Asterisk 18 verifiziert wurde.

| Dokument | Inhalt |
|---|---|
| [architecture.md](architecture.md) | Komponenten, Datenfluss, Deploy-Pipeline |
| [domain-model.md](domain-model.md) | Topology-Modell und alle Validierungsregeln |
| [asterisk-mapping.md](asterisk-mapping.md) | Wie aus Nodes und Kanten Asterisk-Config wird |
| [api.md](api.md) | REST- und WebSocket-Schnittstelle |
| [operations.md](operations.md) | Betrieb, Konfiguration, Testen, Fehlersuche |
| [asterisk-notes.md](asterisk-notes.md) | Fallstricke, die erst im laufenden Asterisk auffielen |
| [roadmap.md](roadmap.md) | Was fehlt, und was es kosten würde |

Wer nur schnell starten will: [../README.md](../README.md).

## Was der PoC kann

- Callflows als Graph bearbeiten (ComfyUI-artiger Editor) oder als Tabellen.
- Topologie live validieren — dieselben Regeln im Browser und im Backend.
- Daraus Asterisk-Config erzeugen und per AMI in einen laufenden Asterisk laden.
- IVR-Ansagen im Browser aufnehmen oder hochladen.
- Node-Status (registriert / im Gespräch / Queue-Wartende) live anzeigen.
- Dark Mode nach Systemeinstellung, manuell übersteuerbar.

## Was er nicht kann

Kein Trunk/DID, also keine Anbindung an das öffentliche Telefonnetz; erreichbar
sind interne Extensions und generierte Test-Nummern. Kein Mehrbenutzerbetrieb,
keine Rechteverwaltung, keine Historie. Details und Aufwandsschätzung in
[roadmap.md](roadmap.md).
