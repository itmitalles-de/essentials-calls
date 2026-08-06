# Betrieb

## Starten

```bash
cp .env.example .env      # AMI_SECRET ändern
docker compose up -d --build
```

| Dienst | Port | Bindung |
|---|---|---|
| Frontend | 8080 | alle Interfaces |
| Backend | 4000 | nur 127.0.0.1 |
| Asterisk SIP | 5060/udp | alle Interfaces (Softphones im LAN) |
| Asterisk RTP | 10000-10100/udp | alle Interfaces |
| Asterisk AMI | 5038 | nur 127.0.0.1 |

Backend und AMI hängen auf Loopback, weil das Frontend die API über den
compose-internen nginx erreicht und AMI eine vollständige Fernsteuerung von
Asterisk ist.

## Konfiguration

| Variable | Default | Wirkung |
|---|---|---|
| `AMI_USERNAME` | `visualpbx` | AMI-Benutzer, wird beim Start in `manager.conf` eingesetzt |
| `AMI_SECRET` | `visualpbx` | AMI-Passwort; beim Default warnt der Container |
| `PORT` | `4000` | Backend-Port |
| `DATA_DIR` | `/data` | Ablage von `topology.json` |
| `CONFIG_OUT_DIR` | `/shared-config` | Zielverzeichnis der generierten Configs |
| `SOUNDS_DIR` | `/sounds` | Ablage hochgeladener Ansagen |
| `AMI_HOST` / `AMI_PORT` | `asterisk` / `5038` | AMI-Verbindung |

Die AMI-Zugangsdaten stehen nicht im Image: Das Entrypoint-Skript rendert
`manager.conf` beim Start aus einem Template und beschränkt den Zugriff per
`permit` auf Loopback und RFC1918.

## Testen

### Registrierung ohne Softphone

```bash
python3 scripts/sip-register-test.py 101 alice123
```

Führt einen echten SIP-REGISTER mit Digest-Auth aus. Trennt zuverlässig, ob ein
Problem an der generierten Config oder am Softphone liegt. Von einem anderen
Rechner mit Host-Angabe: `… 101 alice123 192.168.1.50`.

### Callflow ohne Telefon anstoßen

```bash
docker compose exec asterisk asterisk -rx "channel originate Local/603@internal application Wait 6"
docker compose exec asterisk cat /var/log/asterisk/cdr-csv/Master.csv | tail -2
```

Das CDR zeigt Kontext und letzte Applikation. Nützlich, weil
`/var/log/asterisk/messages` nur notice/warning/error enthält, kein Verbose.

### Code

```bash
npm test          # Validator- und Generator-Tests
npm run typecheck
npm run build
```

CI führt beides aus und baut zusätzlich alle Compose-Images — das fängt
Brüche in den Dockerfiles, die die Node-Tests nicht sehen können.

## Fehlersuche

Die aufschlussreichste Zeile zuerst:

```bash
docker compose logs asterisk | grep -iE "no matching|forbidden|does not exist|failed"
```

| Symptom | Wahrscheinliche Ursache |
|---|---|
| `No matching endpoint found` | SIP-User des Geräts passt nicht zum Endpoint-Namen |
| `will exceed max contacts` | alte Registrierung blockiert; sollte durch `remove_existing=yes` erledigt sein |
| `File … does not exist in any format` | Prompt-Name zeigt auf eine Datei, die es nicht gibt |
| Deploy meldet `reloadError` | AMI nicht erreichbar oder Zugangsdaten falsch |
| Editor bleibt auf „Lädt…" | Backend nicht erreichbar; die Oberfläche zeigt sonst einen Fehlerdialog |
| Mikrofonaufnahme fehlt | Browser erlaubt Mikrofon nur in sicherem Kontext (localhost oder HTTPS) |

Aktueller Zustand in Asterisk:

```bash
docker compose exec asterisk asterisk -rx "pjsip show endpoints"
docker compose exec asterisk asterisk -rx "pjsip show contacts"
docker compose exec asterisk asterisk -rx "dialplan show internal"
docker compose exec asterisk asterisk -rx "queue show"
docker compose exec asterisk asterisk -rx "voicemail show users"
```

Generierte Dateien ansehen:

```bash
docker compose exec asterisk cat /etc/asterisk/generated/extensions_generated.conf
```

## Sicherheit

Der PoC ist für ein vertrauenswürdiges Netz gedacht. Vor jedem weitergehenden
Einsatz relevant:

- **Keine Authentifizierung.** Wer die Oberfläche erreicht, kann die Anlage
  umkonfigurieren.
- **SIP-Passwörter im Klartext** in `topology.json` und in jeder Antwort von
  `GET /api/topology`.
- **AMI-Default-Zugangsdaten**, wenn `.env` nicht gesetzt ist. Der Container
  warnt beim Start.
- **SIP/RTP offen** auf allen Interfaces, nötig für Softphones im LAN. Ins
  Internet gehört das nicht ohne Firewall und Fail2ban.

## Sichern und Zurücksetzen

Die gesamte Konfiguration steckt in `topology.json` und den Ansagen:

```bash
docker compose exec backend cat /data/topology.json > topology-backup.json
docker run --rm -v visual-pbx_asterisk-sounds:/s -v "$PWD":/out alpine \
  tar czf /out/sounds-backup.tar.gz -C /s .
```

Zurücksetzen auf die Beispieltopologie:

```bash
docker compose down
docker volume rm visual-pbx_pbx-data visual-pbx_asterisk-generated
docker compose up -d
```

Die generierten Configs sind reine Ableitungen und müssen nicht gesichert
werden — ein Deploy erzeugt sie neu.
