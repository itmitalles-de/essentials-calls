# Essentials+ Calls

**Essentials+ Calls** is the modular business-telephony component of
Essentials+. It turns call routing into understandable business rules instead
of exposing customers to raw PBX configuration.

The current implementation originated as the **Visual PBX** proof of concept.
It already provides a visual Asterisk call-flow editor, shared validation,
config generation, prompt handling, deployment through AMI, and live runtime
status. It is a strong technical prototype, but it is **not production-ready**.

The customer-facing product name is **Essentials+ Calls**. The technical slug
and target repository name are **`calls`**.

## Product direction

Calls is not intended to become another generic cloud PBX or a full unified
communications suite. The initial product is a managed, provider-independent
service for small German businesses, with isolated runtimes, clear templates,
safe publishing, rollback, and later integration with other Essentials+
modules.

Read the authoritative product direction before expanding scope:

- [Product strategy](docs/product-strategy.md)
- [Execution roadmap](docs/roadmap.md)
- [Current implemented architecture](docs/architecture.md)

## Current proof-of-concept capabilities

- Graph-based call-flow editor with React Flow
- Advanced table-oriented editor
- Shared frontend/backend topology validation
- Asterisk PJSIP, dialplan, queue, and voicemail config generation
- Explicit save and deploy flow with AMI reload
- Prompt recording/upload and browser-side 8 kHz mono WAV conversion
- Live endpoint, call, and queue status over WebSocket
- Docker Compose runtime with frontend, backend, and Asterisk

## Current hard limits

- No authentication or authorization
- SIP secrets stored in plaintext and returned through the API
- No SIP trunk, DID, public inbound routing, or production outbound calling
- No opening-hours or holiday model
- No revision history, locking, audit log, or rollback
- Single trusted editor and one JSON source-of-truth file
- Asterisk 18 baseline, which must be replaced before a production pilot
- Trusted-network proof of concept only; do not expose it to the public internet

## Run the proof of concept

```bash
docker compose up -d --build
```

Open `http://localhost:8080`.

Useful checks:

```bash
npm test
npm run typecheck
npm run build
docker compose config
```

Runtime telephony checks are documented in
[docs/operations.md](docs/operations.md). A successful build or clean Asterisk
config load does not prove that a real call path works.

## Repository layout

| Path | Responsibility |
|---|---|
| `shared/` | Topology types, validation, fixtures |
| `backend/` | REST/WebSocket API, persistence, config generation, AMI, sounds |
| `frontend/` | Calls editor and runtime-status UI |
| `asterisk/` | Asterisk image, entrypoint, and static templates |
| `docs/` | Product strategy, architecture, operations, API, and roadmap |
| `.agent/` | Durable handoff state and project decisions for coding agents |

## Naming migration

The product and UI now use **Essentials+ Calls**. The GitHub repository must be
renamed from `visual-pbx` to `calls` in repository settings. Existing internal
npm package names under `@visual-pbx/*` remain temporarily as implementation
identifiers and should be migrated in a separate mechanical change together
with the lockfile and import graph.
