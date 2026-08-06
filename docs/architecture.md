# Architektur

## Komponenten

```
┌─────────────────┐     HTTP/WS      ┌──────────────────┐      AMI (TCP 5038)   ┌────────────┐
│ frontend        │ ───────────────▶ │ backend          │ ────────────────────▶ │ asterisk   │
│ nginx + React   │ ◀─────────────── │ Node/Express     │ ◀──────────────────── │ Asterisk 18│
│ :8080           │   Status-Push    │ :4000            │   Endpoint-/Queue-    │ :5060 SIP  │
└─────────────────┘                  └──────────────────┘   Status              └────────────┘
                                            │                                          ▲
                                            │  schreibt Dateien                        │ liest
                                            ▼                                          │
                                     ┌──────────────────────────────────────────────────┐
                                     │ Volumes: asterisk-generated, asterisk-sounds     │
                                     └──────────────────────────────────────────────────┘
```

Das Backend redet mit Asterisk auf zwei Wegen: Konfiguration wird als Datei in
ein geteiltes Volume geschrieben, der Reload und die Statusabfragen laufen über
AMI. Beides ist nötig — AMI kann keine Config-Dateien schreiben, und ohne Reload
liest Asterisk neue Dateien nicht.

## Workspaces

| Workspace | Rolle |
|---|---|
| `shared/` | Domain-Modell und Validator. Wird von Backend **und** Frontend importiert, damit die Validierung an beiden Enden identisch ist. |
| `backend/` | Express-API, Config-Generator, AMI-Client, Sound-Ablage. |
| `frontend/` | React-Editor, Vite-Build, ausgeliefert von nginx. |
| `asterisk/` | Image mit Asterisk 18 und statischen Basis-Configs. |

`shared` ist der Grund für das Monorepo: Ein Validierungsfehler soll im Editor
sofort sichtbar sein, aber das Backend darf sich nicht darauf verlassen, dass
der Client geprüft hat. Eine gemeinsame Implementierung verhindert, dass beide
Seiten auseinanderlaufen.

### Ein Detail beim Build

Das Frontend importiert `shared` über einen Vite-Alias direkt aus dem
TypeScript-Quellcode, das Backend aus dem kompilierten `dist/`. Grund: `tsc`
erzeugt einen CommonJS-Barrel mit dynamischer `__exportStar`-Schleife, die
Rollup beim Produktionsbuild nicht statisch analysieren kann — der Build bricht
mit „is not exported by" ab. Siehe Kommentar in `frontend/vite.config.ts`.

## Datenfluss beim Deploy

```
Editor ──▶ PUT/POST /api/deploy
              │
              ├─ 1. Struktur prüfen  (validateTopologyShape)
              ├─ 2. Regeln prüfen    (validateTopology) ──▶ Fehler? 400, Ende
              ├─ 3. Topologie sichern (topology.json)
              ├─ 4. Config erzeugen  (generateAll) ──▶ /shared-config/*.conf
              └─ 5. AMI-Reload       (dialplan, pjsip, queue, voicemail)
```

Schritt 1 und 2 sind bewusst getrennt: Die API nimmt beliebiges JSON entgegen,
also muss die Form bewiesen sein, bevor Regeln auf Felder zugreifen. Ohne diese
Trennung riss ein fehlerhafter Request den ganzen Prozess ab.

Schritt 4 schreibt vier Dateien, die per `#include` aus den statischen
Basis-Configs im Asterisk-Image gezogen werden. Handgeschriebenes (Transport,
Logger, Codecs) bleibt so unangetastet.

## Persistenz

| Volume | Inhalt |
|---|---|
| `pbx-data` | `topology.json` — die einzige Quelle der Wahrheit für den Callflow |
| `asterisk-generated` | die vier generierten `*_generated.conf` |
| `asterisk-sounds` | hochgeladene IVR-Ansagen als WAV |

Die Topologie ist eine einzelne JSON-Datei ohne Locking. Für einen PoC mit einem
Bearbeiter ist das ausreichend; zwei gleichzeitige Speichervorgänge würden sich
gegenseitig überschreiben.

## Statusmodell

Der Status ist bewusst **nicht** Teil der Topologie und wird nicht persistiert.
Das Backend fragt alle 3 Sekunden per AMI `PJSIPShowEndpoints` und `QueueStatus`
ab und schiebt das Ergebnis über WebSocket an alle offenen Editoren.

Ist Asterisk nicht erreichbar, liefert die Abfrage für jeden Node `unknown`
statt einen Fehler zu werfen — der Editor bleibt bedienbar, auch wenn die
Telefonanlage gerade neu startet.

## Frontend-Aufbau

```
App.tsx                 Shell: Tabs, Speichern/Deploy, Theme-Toggle, Statusverteilung
├── views/SimpleView    React-Flow-Graph + Inspector
│   ├── components/PbxNodeView     Node-Darstellung inkl. Statuspunkt
│   ├── components/Inspector       typspezifische Formulare
│   └── components/GreetingPicker  Ansage aufnehmen/hochladen
├── views/AdvancedView  Tabellen für Nodes, Edges, Memberships + Fehlerliste
├── theme.ts            Hell/Dunkel/System mit Persistenz
└── audio.ts            Konvertierung nach 8 kHz Mono WAV im Browser
```

Die Audiokonvertierung läuft absichtlich im Browser (Web Audio API): Das spart
ffmpeg im Backend-Image, und Aufnahme (webm/opus) wie Upload (mp3, m4a, ogg,
wav) gehen durch denselben Pfad.
