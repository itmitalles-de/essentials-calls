# Current state

## Snapshot

- Product: **Essentials+ Calls**, a single-tenant callflow editor, simulator,
  and isolated synthetic Asterisk 18 technical proof of concept.
- Canonical repository: `itmitalles-de/essentials-calls`; default branch:
  `master`; stabilization branch: `stabilize/calls-verified-poc`.
- Baseline: `d88e8e54e7591bedd667e072737426c840c4160d`; reviewed runtime-content
  commit: `8f0cdd9311b0ef9511615e23866be143e684c71c`.
- Historical npm, data, volume, browser-storage, AMI/test, Asterisk-path, and
  branch identifiers remain only as documented compatibility identifiers.
- Asterisk stays on Ubuntu 22.04's 18.10 package by explicit scope. Upstream
  support has ended, so this remains a production blocker rather than an
  authorization to upgrade within this branch.

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
  npm CycloneDX SBOM. PR whitespace validation compares the actual base/head
  range; the acceptance diagnostic helper image is digest pinned.

## Verified locally through 2026-08-20

- Fresh exact Node 24.19.0/npm 11.17.0 `npm ci`; moderate audit: zero
  vulnerabilities.
- Typecheck and production build passed. Unit suites: 30 shared, 70 backend,
  and 5 frontend tests (105/105), no skips or TODOs.
- Ordinary and acceptance Compose models validated. Asterisk, backend,
  frontend, and SIPp acceptance images built from digest-pinned bases.
- Full-stack: 28 semantic checks passed, then Asterisk/backend restart and
  exact user/role/topology/revision/audit/active-deployment persistence passed.
- Browser: Playwright 1.62.1, Chrome for Testing 151.0.7922.34, all 8 tests in
  32.4 seconds, no skips/TODOs, unexpected console/page errors, unallowlisted
  HTTP failures, failed requests, or unhandled browser promise rejections.
- Backup/recovery: about 162 seconds; fresh source/A/C volumes; both wrong-key
  cases failed closed; valid A and C restores passed user/role/revision/audit,
  session invalidation, non-persisted AMI state, pre-start file modes, Asterisk
  startup, custom WAV/IVR, 56 RTP packets, semantic routes, CDR, and WebSocket
  checks. Unit injection also proved cleanup after a target-population error.
- Secret scan including the lockfile, immutable action/image verification,
  224-component CycloneDX SBOM generation, worktree whitespace validation, and
  base-to-head PR whitespace validation passed.

## Evidence boundary and residual gates

All identities, credentials, prompts, calls, and media were synthetic. No real
provider, SIP trunk, DID, emergency call, handset, public telephone network,
carrier NAT/audio behavior, customer, or production operation was used.

Open gates include code/licence rights; responsibility and revenue allocation;
provider contract/access/DID; privacy and emergency concepts; NAT/firewall,
TLS/SRTP, codec and endpoint tests; monitoring/support/maintenance; supported
Asterisk strategy; enforced repository security controls; dependency alerts;
container CVE scanning; and explicit carrier/legal/production acceptance.

The isolated test-DID document is a future gate plan only. It must not run
without named approvals, one explicit ordinary test destination on a positive
allowlist, provider credentials outside Git, and an approved maintenance
window. The review branch must not be merged automatically.
