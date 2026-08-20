# Current state

## Snapshot

- Product: **Essentials+ Calls**, a single-tenant callflow editor, simulator,
  and isolated synthetic Asterisk 22 LTS technical proof of concept.
- Canonical repository: `itmitalles-de/essentials-calls`; default branch:
  `master`; stabilization branch: `stabilize/calls-verified-poc`.
- Baseline: `d88e8e54e7591bedd667e072737426c840c4160d`; verified tree:
  `4a907716a702fad76bdc6970a8f44fcfcba4beb5`; Asterisk runtime-content
  commit: `4a5bad7afe6768163e8ba6e24a17afe1b5ce8e6d`.
- Historical npm, data, volume, browser-storage, AMI/test, Asterisk-path, and
  branch identifiers remain only as documented compatibility identifiers.
- The user's later authorization superseded the original Asterisk-18 boundary.
  The runtime now builds exact Asterisk 22.10.1 with bundled PJProject 2.17 and
  Jansson 2.15.0 from checksum-verified sources on a digest-pinned Ubuntu base.

## Implemented contract

- Extensions, IVR, ring groups, queues, voicemail, schedules, immutable
  revisions, graph/table editing, rollback, AMI, CDR, WebSocket status, and a
  synthetic SIPp/Asterisk runtime.
- Saving updates the persisted revision/dirty baseline but preserves undo/redo.
  Reload, import, rollback, and browser restart establish a new history root.
- Local admin/editor/viewer authorization, sessions/CSRF/rate limits, SQLite
  WAL, encrypted SIP credentials, redacted topology/audit, HA1 generation,
  staged atomic deployment, preflight, canary, and last-good rollback.
- Checksummed empty-target recovery keeps the master key separate, invalidates
  sessions, preserves sounds/config/revisions, and now rehearses wrong key B,
  A-to-C rotation, obsolete A rejection, and C restore. Interrupted rotations
  roll back both durable and process-local key state. Restore validates keys
  and permissions before target writes, sets data/database modes itself, and
  removes its writes again if normal target population fails.
- `110`/`112` and `trunk`/`external` fail closed. There is no outside line,
  real trunk, DID, carrier route, emergency fallback, recording,
  transcription, or AI feature.
- CI uses Node 24.19.0, immutable action/base-image references, short-lived
  redacted failure artifacts, a fail-closed tracked-file secret scan, and an
  npm plus Asterisk-source CycloneDX SBOM. PR whitespace validation compares
  the actual base/head range; the acceptance diagnostic helper image is digest
  pinned. Compose build outputs use explicit version tags in isolated project
  namespaces, and CI rejects implicit or explicit `latest` tags.

## Verified locally through 2026-08-20

- Fresh exact Node 24.19.0/npm 11.17.0 `npm ci`; moderate audit: zero
  vulnerabilities.
- Typecheck and production build passed. Unit suites: 30 shared, 70 backend,
  and 5 frontend tests (105/105), no skips or TODOs.
- Ordinary and acceptance Compose models validated. The explicit-tag policy
  passed for three ordinary and four acceptance images; Asterisk, backend,
  frontend, and SIPp acceptance images built from digest-pinned bases.
- Full-stack: 28 semantic checks passed, then Asterisk/backend restart and
  exact user/role/topology/revision/audit/active-deployment persistence passed;
  the complete successful run took 110.40 seconds.
- Browser: Playwright 1.62.1, Chrome for Testing 151.0.7922.34, all 8 tests in
  33.2 seconds (61.24 seconds including stack lifecycle), no skips/TODOs and no
  unexpected console/page errors,
  unallowlisted HTTP failures, failed requests, or unhandled browser promise
  rejections.
- Backup/recovery: 177.77 seconds; fresh source/A/C volumes and image
  namespaces; both wrong-key cases failed closed; valid A and C restores passed
  user/role/revision/audit,
  session invalidation, non-persisted AMI state, pre-start file modes, Asterisk
  startup, custom WAV/IVR, 56 RTP packets, semantic routes, CDR, and WebSocket
  checks. Unit injection also proved cleanup after a target-population error.
- Secret scan including the lockfile, immutable action/image verification,
  224-component npm and 6-component Asterisk CycloneDX SBOM generation,
  worktree whitespace validation, and base-to-head PR whitespace validation
  passed.

## Evidence boundary and residual gates

All identities, credentials, prompts, calls, and media were synthetic. No real
provider, SIP trunk, DID, emergency call, handset, public telephone network,
carrier NAT/audio behavior, customer, or production operation was used.

Open gates include code/licence rights; responsibility and revenue allocation;
provider contract/access/DID; privacy and emergency concepts; NAT/firewall,
TLS/SRTP, codec and endpoint tests; monitoring/support/maintenance; controlled
Asterisk/PJProject/Jansson update governance; reproducible remaining apt
packages; enforced repository security controls; dependency alerts; container
CVE scanning; and explicit carrier/legal/production acceptance.

The isolated test-DID document is a future gate plan only. It must not run
without named approvals, one explicit ordinary test destination on a positive
allowlist, provider credentials outside Git, and an approved maintenance
window. The review branch must not be merged automatically.
