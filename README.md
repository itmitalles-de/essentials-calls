# Essentials+ Calls

Essentials+ Calls is a visual editor and hardened local runtime for internal
Asterisk call flows. The technical repository remains `visual-pbx`; the
product name does not rename the repository, package namespace, default branch,
or pinned Asterisk 18 base.

The stack is an extensively tested proof of concept, not a production PBX. Its
automated evidence uses disposable Docker environments, SIPp endpoints, AMI,
CDR events, and headless browsers. It does **not** establish real trunk, DID,
emergency-call, carrier, NAT/firewall, handset, or production readiness.

## Implemented

- Graph and table editors with shared live validation, bounded undo/redo, and
  keyboard shortcuts.
- Extensions, IVR, ring groups, Asterisk queues, voicemail, and
  Europe/Berlin-aware schedule nodes.
- Versioned, redacted topology import/export with v1 migration and atomic
  import.
- SQLite WAL persistence, immutable revisions, ETags/`If-Match`, conflict
  responses, audit history, and rollback as a new revision.
- Local sessions with scrypt password hashes, CSRF protection, login rate
  limiting, secure cookie policy, and `viewer`/`editor`/`admin` roles.
- AES-256-GCM storage for SIP passwords. API responses and revisions expose
  only `{ "configured": true|false }`; generated Asterisk 18 auth uses a
  pre-computed MD5 HA1 value instead of plaintext.
- Server-authoritative sound inventory validation, protected deletion, and
  deliberate reference replacement.
- Staged Asterisk generation, isolated container preflight, atomic activation,
  targeted reload, runtime canary, last-known-good snapshot, and automatic
  rollback.
- Long-lived AMI events, heartbeat, reconnect/backoff, snapshot refresh,
  polling fallback, and authenticated WebSocket status updates.
- Checksummed CLI backup/empty restore with the master key kept separate.
- Stable, topology-free health/readiness/service metadata for a later
  Essentials+ Office catalog.

## Local start

1. Copy `.env.example` to `.env`.
2. Replace every placeholder with local test-only values. Use a unique
   32-byte Base64 master key and a non-default AMI secret.
3. Start the loopback-bound stack with `docker compose up -d --build`.
4. Create the first administrator with the backend
   `bootstrap-admin --username <name> --password-stdin` CLI. There are no
   default credentials.
5. Open <http://127.0.0.1:8080>.

Do not expose this Compose stack publicly. Production requires HTTPS,
`PBX_ENV=production`, `PBX_SECURE_COOKIES=true`, an external firewall/NAT
design, carrier acceptance, and the other blocked work listed in the roadmap.

## Automated verification

```bash
npm ci
npm audit --audit-level=moderate
npm run typecheck
npm test
npm run build
docker compose config --quiet
docker compose -f docker-compose.yml -f docker-compose.acceptance.yml --profile acceptance config --quiet
npm run test:full-stack
npm run test:e2e
npm run test:backup-restore
```

The runtime suites create isolated Compose projects, use only synthetic
credentials and calls, collect redacted diagnostics only on failure, and remove
their containers and volumes afterward.

## Repository layout

| Path | Responsibility |
| --- | --- |
| `shared/` | Versioned domain model, schedule evaluation, import migration, redaction, validation |
| `backend/` | Auth/RBAC, SQLite, revisions/audit, API, backup, Asterisk generation/deploy, AMI events |
| `frontend/` | React/React Flow editor, role-aware UI, import/export, sounds, revisions |
| `asterisk/` | Pinned Asterisk 18 image, static config, isolated preflight worker |
| `tests/acceptance/` | SIPp/AMI/CDR full-stack acceptance |
| `tests/e2e/` | Playwright semantic browser acceptance |
| `scripts/` | Reproducible acceptance and backup/restore orchestration |

## Documentation

| Document | Contents |
| --- | --- |
| [Architecture](docs/architecture.md) | Components, persistence, event and deploy flows |
| [Domain model](docs/domain-model.md) | Nodes, revisions, import format, and validation |
| [Asterisk mapping](docs/asterisk-mapping.md) | Generated config and atomic activation |
| [Asterisk notes](docs/asterisk-notes.md) | Runtime-tested Asterisk 18 constraints |
| [API](docs/api.md) | REST, roles, ETags, CSRF, and WebSocket |
| [Security](docs/security.md) | Threat boundary, sessions, secrets, headers, and key rotation |
| [Operations](docs/operations.md) | Configuration, bootstrap, tests, diagnostics, and recovery |
| [Backup/restore](docs/backup-restore.md) | Archive contents, separate key, checksums, and empty restore |
| [Verification matrix](docs/VERIFICATION_MATRIX.md) | What each evidence class proves and does not prove |
| [Roadmap and blockers](docs/roadmap.md) | Verified scope and external/legal blockers |
| [Nice-to-have](docs/NICE_TO_HAVE.md) | Explicitly deferred ideas, without scaffolding |

## License and responsibility

This work does not change the repository license. Rights/licensing of the
existing code and responsibility/revenue allocation among involved people
remain external blockers and must be resolved before a product release.
