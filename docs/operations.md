# Operations

## Supported local boundary

The supplied stack is a disposable/local Asterisk 18 environment. Published
ports default to loopback:

| Service | Default |
| --- | --- |
| Frontend | `127.0.0.1:8080/tcp` |
| Backend | `127.0.0.1:4000/tcp` |
| SIP | `127.0.0.1:5060/udp` |
| RTP | `127.0.0.1:10000-10100/udp` |
| AMI debug mapping | `127.0.0.1:5038/tcp` |

Do not change `PBX_BIND_ADDRESS` to a public interface without a separate
network/security design. The test configuration is not a production perimeter.

## Required configuration

| Variable | Purpose |
| --- | --- |
| `AMI_SECRET` | Unique 16–256 character local AMI secret using letters, digits, `. _ @ % + = , : -`; Asterisk refuses empty/historical/unsafe values |
| `PBX_MASTER_KEY_FILE` or `PBX_MASTER_KEY` | Exactly 32 bytes, Base64 or hex, for AES-256-GCM |
| `PBX_ENV` | `test`, `development`, or `production` |
| `PBX_SECURE_COOKIES` | Must be `true` in production |
| `PBX_TRUST_PROXY` | Enable only behind a controlled reverse proxy |
| `DATA_DIR` | SQLite persistent area |
| `CONFIG_OUT_DIR` | Immutable generated versions/current/last-good |
| `SOUNDS_DIR` | Custom WAV prompts |
| `SOUNDS_READER_GID` | Numeric Asterisk group ID used for mode-`0640` uploaded prompts |
| `AMI_HOST` / `AMI_PORT` / `AMI_USERNAME` | Internal AMI connection |

Prefer a mounted secret file for the master key. Do not commit `.env`, keys,
AMI secrets, passwords, real extension data, or provider information.

## Bootstrap

Start the Compose services only after replacing every `.env.example`
placeholder with synthetic/local values. Run the built backend CLI
`bootstrap-admin --username <name> --password-stdin` once and feed its
password through a protected stdin source. The CLI refuses a second bootstrap;
additional accounts are created by an authenticated admin.

## Automated acceptance

Run the full regression:

```bash
npm ci
npm audit --audit-level=moderate
npm run typecheck
npm test
npm run build
docker compose config --quiet
docker compose -f docker-compose.yml -f docker-compose.acceptance.yml --profile acceptance config --quiet
docker compose -f docker-compose.yml -f docker-compose.acceptance.yml --profile acceptance build
npm run test:full-stack
npm run test:e2e
npm run test:backup-restore
```

- `test:full-stack` builds a fresh isolated project, bootstraps a synthetic
  admin, imports/deploys, runs SIPp/AMI/CDR/WebSocket checks, forces a bad
  activated config, verifies rollback, restarts Asterisk/backend, and proves
  persistence.
- `test:e2e` drives Chromium semantically; no manual browser or screenshot
  comparison is required.
- `test:backup-restore` restores into separate empty volumes and repeats
  synthetic calls.

Diagnostics are created under ignored `artifacts/` only after failure and
credential-like values are redacted. Passing runs remove their containers and
volumes. A skipped runtime suite is not a passing runtime result.

## CI

GitHub Actions runs separate static, Compose/image, synthetic telephony,
Playwright, and backup/restore jobs with read-only repository permissions and
synthetic environment values. The Docker jobs can be resource-sensitive on
hosted runners; the same scripts are the reproducible local authority if a
runner has a demonstrable RTP/network limitation. Deterministic tests must not
be disabled to hide such a limitation.

## Deploy observation

Use the API result and deployment audit, not a successful file write, as the
outcome. Useful runtime checks include:

```text
core show version
dialplan show internal
pjsip show endpoints
pjsip show contacts
queue show
voicemail show users
cdr show status
```

An AMI outage is visible as `reconnecting` and then `degraded`; the editor
continues to serve design data. On reconnect the service rebuilds a snapshot.

## Failure handling

- Validation/write/preflight/initial AMI failures leave the active symlink
  unchanged.
- Reload or post-reload runtime failures trigger last-good restoration.
- If rollback itself fails, the deploy response and audit say so explicitly;
  investigate Asterisk before another deploy.
- A missing/wrong master key causes startup/materialization failure instead of
  silently dropping credentials.
- Invalid sound formats and referenced-sound deletion fail before replacement.
- A stale editor gets 409 and must reload/merge deliberately.

## Backup and restore

Use the CLI workflow in [backup-restore.md](backup-restore.md), not raw copies
of the live WAL database. Store the master key separately. Restore accepts only
empty targets and invalidates copied sessions. After any restore, run the
synthetic acceptance appropriate to the target before considering it usable.

## Production prerequisites

HTTPS, secret management, host/container patching, monitoring, off-site backup,
restore drills, firewall/NAT, abuse/fraud controls, real handset tests,
provider/DID behavior, emergency-call handling, carrier acceptance, legal
review, ownership/revenue decisions, and an operations owner are not supplied
by this local stack.
