# Operations

## Supported local boundary

The supplied stack is a disposable/local Asterisk 22 LTS environment. Published
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
| `PBX_CLIENT_SIP_HOST` | Non-secret host label shown to authenticated users in the softphone guide; defaults to `127.0.0.1` |
| `PBX_CLIENT_SIP_PORT` | Non-secret SIP port shown in the guide; Compose derives it from `PBX_SIP_PORT` and defaults to `5060` |

Prefer a mounted secret file for the master key. Do not commit `.env`, keys,
AMI secrets, passwords, real extension data, or provider information.

## Bootstrap

Start the Compose services only after replacing every `.env.example`
placeholder with synthetic/local values. Run the built backend CLI
`bootstrap-admin --username <name> --password-stdin` once and feed its
password through a protected stdin source. The CLI refuses a second bootstrap;
additional accounts are created by an authenticated admin.

The authenticated **Geräte & Softphones** page is guidance, not an embedded
phone or software distribution channel. It links only to an explicit allowlist
of official vendor landing pages and shows the selected extension number plus
the configured non-secret endpoint. It never returns a SIP password, QR code,
credential URL, generated account file, or mirrored installer. A client on a
different host cannot use the loopback default; changing that boundary requires
an approved NAT/firewall/audio design and real endpoint acceptance.

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
npm run validate:compose-images
docker compose -f docker-compose.yml -f docker-compose.acceptance.yml --profile acceptance build
npm run test:full-stack
npm run test:e2e
npm run test:backup-restore
npm run scan:secrets
npm run --silent sbom > simple-calls-npm.cdx.json
npm run --silent sbom:asterisk > simple-calls-asterisk.cdx.json
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
  persistence check. It also verifies the responsive application shell,
  theme selection, and the allowlisted, secret-free softphone guidance.
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
static job checks the real PR base/head range for whitespace and creates
CycloneDX npm and pinned Asterisk-source SBOMs. The tracked-file secret scan
includes the lockfile. Only redacted failure diagnostics and the SBOMs are
uploaded, with three-day retention.

GitHub's repository setting requires full action SHAs. Dependabot vulnerability
alerts and automated fixes are enabled; `.github/dependabot.yml` schedules
weekly npm, action, and Docker updates once this configuration reaches the
default branch. Managed secret/code scanning is not available without Advanced
Security and is not claimed by these controls.

Every Compose build output has an explicit component/version tag and uses the
current Compose project as its local image namespace. The policy check rejects
implicit or explicit `latest` tags and prevents the isolated full-stack,
browser, and recovery projects from racing on one mutable local tag.

Asterisk 22.10.1, bundled PJProject 2.17 and Jansson 2.15.0, English core
prompts, and Opsound music-on-hold are fetched as exact releases and verified
against checked-in SHA-256 values during the image build. Direct Ubuntu
packages use exact versions from snapshot `20260820T120000Z`; Debian build and
SIPp packages use exact versions from archive/security imports
`20260820T142943Z` and `20260820T142410Z`. Any apt update error is fatal. The
minimal Jammy base first bootstraps exact CA/openssl versions from the signed
live archive so it can reach Canonical's HTTPS-only snapshot service.

`npm run scan:containers` downloads exact Trivy 0.74.0, verifies archive SHA-256
`2ae6fe3ee734b7fdf11335663e18c75ea12dccc76062f09f164a3b0f8be4371a`,
refuses registry fallback, asserts package managers/dev dependencies are absent
from Node runtime images, and scans all four local images. New or fixable
HIGH/CRITICAL findings fail. The package-scoped Debian exception in
`.github/container-cve-policy.json` expires on 2026-09-20; update the snapshots,
rerun every runtime suite, and remove or explicitly re-review it before then.
Snapshot pins are reproducible inputs, not an automatic patch stream.

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
