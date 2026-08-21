# Current state

## Snapshot

- Product: **Simple Calls**, a single-tenant callflow editor, simulator, and
  isolated synthetic Asterisk 22 LTS technical proof of concept.
- Canonical public repository: `itmitalles-de/simple-calls`; default branch:
  `master`.
- Current branch: `agent/simple-calls-ui-softphones`; stabilization baseline:
  `219361ce5a2b4d1f128ce02948bdfc648a696283`; locally verified implementation:
  `9f5b32ead2956e1944544e3630f5dc698581e6ba`.
- Historical npm, data, volume, browser-storage, AMI/test, Compose, Asterisk
  path, and `master` identifiers remain documented compatibility boundaries.
- Exact Asterisk 22.10.1, bundled PJProject 2.17, and Jansson 2.15.0 are built
  from checksum-verified sources on a digest-pinned Ubuntu base.

## Implemented contract

- Extensions, IVR, ring groups, queues, voicemail, schedules, immutable
  revisions, graph/table editing, rollback, AMI, CDR, WebSocket status, and a
  synthetic SIPp/Asterisk runtime.
- Save updates the persisted revision/dirty baseline without clearing undo or
  redo. Reload, import, rollback, and browser restart create a new history root.
- The responsive shell, navigation, icons, and system/light/dark themes consume
  the exact Simple Business v0.1.1 design-system release pinned in
  `.simple-business-design-system.json`.
- **Geräte & Softphones** links only to allowlisted official vendor landing
  pages and shows a selected extension plus sanitized local SIP endpoint. It
  exposes no password, master key, QR code, account file, or credential URL.
- Local roles/sessions/CSRF/rate limits, SQLite WAL, AES-GCM SIP credentials,
  redacted topology/audit, HA1 generation, staged deployment, isolated
  preflight, runtime canary, and last-good rollback are implemented.
- Empty-target recovery keeps the master key separate, invalidates sessions,
  and rehearses wrong B, valid A restore, A-to-C rotation, obsolete A rejection,
  and valid C restore. Interrupted rotations remain transactionally repairable.
- `110`/`112` and `trunk`/`external` fail closed. There is no outside line,
  real trunk, DID, emergency fallback, recording, transcription, or AI.
- CI uses exact Node 24.19.0, immutable action/base references, explicit
  non-`latest` image tags, short-lived redacted diagnostics, a tracked-file
  secret scan, CycloneDX SBOMs, and checksum-pinned Trivy 0.74.0.

## Verified locally on 2026-08-22

- `npm ci` and moderate audit passed with zero vulnerabilities.
- Design lint, typecheck, and production build passed. Unit suites: 30 shared,
  70 backend, and 7 frontend tests (107/107), no skips or TODOs.
- Ordinary and acceptance Compose validation, explicit image-tag validation,
  all image builds, supply-chain validation, secret scan, and `git diff --check`
  passed.
- Full stack: 28 semantic checks plus Asterisk/backend restart and exact
  persistence passed in a fresh isolated project. An unrelated occupied port
  was preserved and the successful rerun used a separate port range.
- Browser: Playwright 1.62.1 with Chrome for Testing 151.0.7922.34 ran all
  eight tests in 39.4 seconds: 8/8 passed, zero skips/TODOs, no unexpected
  console/page errors, failed requests, unallowlisted HTTP failures, or
  unhandled browser promise rejections.
- Backup/recovery used fresh source/A/C projects and volumes. Both wrong/obsolete
  key paths failed closed; A and C restores passed users, roles, revisions,
  active deployment, audit, session invalidation, non-persisted AMI state,
  modes, Asterisk startup, custom WAV/IVR, 56 RTP packets, semantic calls, CDR,
  and WebSocket assertions.
- 226-component npm and 6-component Asterisk SBOM generation passed. Trivy found
  no HIGH/CRITICAL issue in Asterisk or frontend and no new/fixable finding in
  any image. Fifteen unique unfixed Debian IDs remain narrowly excepted until
  2026-09-20 and are a visible production blocker.

## GitHub state

- Draft PR #3 (`stabilize/calls-verified-poc` -> `master`) is open and all five
  CI jobs plus the Dependabot configuration check are green at `219361ce`.
- Draft PR #24 contains only the earlier design-system activation attempt; four
  jobs pass and browser E2E fails. The current branch supersedes it and must be
  proposed as a separate stacked draft PR, not by repurposing #24.
- Historical rebranding PR #2 is closed without merge and superseded by the
  repository rename and later work.

## Evidence boundary and residual gates

All identities, credentials, calls, prompts, and media were synthetic. No real
provider, trunk, DID, emergency call, handset/softphone call, public telephone
network, carrier NAT/audio behavior, customer, or production operation ran.

Open gates include code/licence rights; responsibility and revenue allocation;
provider contract/access/DID; privacy and emergency concepts; NAT/firewall,
TLS/SRTP, codec and real endpoint tests; monitoring/support/maintenance;
Asterisk/source and snapshot update ownership; the expiring CVE exception;
managed secret/code scanning; and explicit carrier/legal/production acceptance.
The isolated test-DID plan must remain inactive until every named external gate,
one positive ordinary test-number allowlist, and a maintenance window exist.
