# Visual PBX

Visual call-flow editor for a phone system. The graph is translated into
Asterisk configuration and loaded into a running Asterisk instance through AMI.
Runs entirely as a Docker Compose stack.

Proof of concept — functional and verified against a running Asterisk 18
instance, but without authentication or trunk integration.
Limitations: [docs/roadmap.md](docs/roadmap.md).

## Start

```bash
cp .env.example .env      # change AMI_SECRET
docker compose up -d --build
```

UI: <http://localhost:8080>

The example topology (Alice, Bob, a support ring group, and a welcome IVR) is
created on first start.

## Features

- **Simple view** — node graph editor: create nodes, draw edges, and edit
  properties in the inspector.
- **Advanced view** — the same data as tables, plus an error list.
- **Live validation** — the same rules run in the browser and backend; an
  invalid call flow cannot be deployed.
- **Deploy** — generates `pjsip`, `extensions`, `queues`, and `voicemail`
  configuration and loads it through AMI.
- **IVR prompts** — record in the browser or upload a file; conversion to
  8 kHz mono WAV happens in the browser.
- **Live status** — registered / in a call / waiting in a queue, via WebSocket.
- **Dark mode** — follows the system, can be overridden manually, and persists.

## Quick Test

```bash
# Check registration without a softphone
python3 scripts/sip-register-test.py 101 alice123

# Start a call flow without a phone
docker compose exec asterisk asterisk -rx "channel originate Local/603@internal application Wait 6"
docker compose exec asterisk cat /var/log/asterisk/cdr-csv/Master.csv | tail -2
```

With a softphone, register against `<host>:5060` with user `101` / password
`alice123` (or `102` / `bob123`). Then dial `101`, `102`, or the test numbers
starting at `600` — one per node, since there is no trunk.

## Development

```bash
npm install
npm run typecheck
npm test            # 52 tests: validator, config generator, prompt validation
npm run build

npm run dev:backend    # expects AMI on localhost:5038
npm run dev:frontend   # Vite on :5173
```

## Structure

```
shared/    Domain model + validator (used by backend and frontend)
backend/   Express API, config generator, AMI client, prompt storage
frontend/  React + React Flow, served by nginx
asterisk/  Asterisk 18 on Ubuntu 22.04, base configurations
scripts/   sip-register-test.py
```

## Documentation

| Document | Contents |
|---|---|
| [Architecture](docs/architecture.md) | Components, data flow, and deployment pipeline |
| [Domain model](docs/domain-model.md) | Topology and all validation rules |
| [Asterisk mapping](docs/asterisk-mapping.md) | How nodes become configuration |
| [API](docs/api.md) | REST and WebSocket |
| [Operations](docs/operations.md) | Configuration, testing, troubleshooting, and security |
| [Pitfalls](docs/asterisk-notes.md) | What only became apparent with a running Asterisk |
| [Status and roadmap](docs/roadmap.md) | Verified behavior, limitations, and possible next steps |

Anyone working on Asterisk generation should start with
[docs/asterisk-notes.md](docs/asterisk-notes.md): it explains which constructs
load without errors but still do not work.
