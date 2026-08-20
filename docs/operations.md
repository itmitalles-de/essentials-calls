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
No external route, DID, or emergency fallback is configured; `110` and `112`
are rejected by topology validation.

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
npm run scan:secrets
npm run --silent sbom > essentials-calls-npm.cdx.json
git diff --check
```

- `test:full-stack` builds a fresh isolated project, bootstraps a synthetic
  admin, imports/deploys, runs SIPp/AMI/CDR/WebSocket checks, forces a bad
  activated config, verifies rollback, restarts Asterisk/backend, and proves
  persistence. Route assertions cover direct calls, ring group, queue,
  schedule, IVR valid/invalid DTMF and timeout, voicemail, custom WAV, and RTP.
- `test:e2e` drives Chromium semantically and fails on unexpected console/page
  errors, request failures, and HTTP errors outside the exact negative-path
  method/path/status allowlist. Its eight cases include save/undo/redo,
  graph/table switching, revision/rollback, reload, and a fresh browser-context
  persistence check.
- `test:backup-restore` uses fresh source/A/C projects and volumes, requires a
  wrong key and obsolete key to fail closed, rotates A to C, verifies users,
  roles, revisions, encrypted secrets, audit, session invalidation and file
  modes, then repeats custom-WAV/RTP and callflow checks after each valid restore.

Diagnostics are created under ignored `artifacts/` only after failure and
credential-like values are redacted. Passing runs remove their containers and
volumes. A skipped runtime suite is not a passing runtime result.

## CI

GitHub Actions runs on Ubuntu 24.04 with the exact Node 24 version in `.nvmrc`.
Third-party actions and Docker bases are pinned to immutable digests/commits;
the jobs cover static checks, Compose/images, synthetic telephony, Playwright,
and recovery with read-only repository permissions and synthetic values. The
static job checks the real PR base/head range for whitespace and creates a
CycloneDX npm SBOM. The tracked-file secret scan includes the lockfile. Only
redacted failure diagnostics and the SBOM are uploaded, with three-day
retention.

The Ubuntu apt repositories still resolve the Asterisk 18 and SIPp packages at
image-build time; a repository-wide enforced SHA policy, dependency alerts, and
container CVE scanning are not configured. These are recorded residual
supply-chain gates, not hidden by the successful build.

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
- An interrupted master-key rotation rolls back its transaction and remains
  consistently readable with the former key; do not mix keys or edit rows.
- Invalid sound formats and referenced-sound deletion fail before replacement.
- A stale editor gets 409 and must reload/merge deliberately.

## Backup and restore

Use the CLI workflow in [backup-restore.md](backup-restore.md), not raw copies
of the live WAL database. Store the master key separately and follow the
[master-key recovery rehearsal](operations/MASTER_KEY_RECOVERY.md). Restore
accepts only empty targets and invalidates copied sessions. After any restore,
run the synthetic acceptance appropriate to the target before considering it
usable.

## Production prerequisites

HTTPS, secret management, host/container patching, monitoring, off-site backup,
restore drills, firewall/NAT, abuse/fraud controls, real handset tests,
provider/DID behavior, emergency-call handling, carrier acceptance, legal
review, code/licence rights, ownership/revenue decisions, supported runtime
versions, supply-chain governance, and an operations owner are not supplied by
this local stack. See the documentation-only
[test-DID pilot gates](PILOT_TEST_DID.md); they do not authorize a rollout.
