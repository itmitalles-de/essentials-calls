# Current state

## Product and branch

- Visible product: **Essentials+ Calls**.
- Technical repository/npm namespace: `visual-pbx` (intentionally unchanged).
- Default branch: `master` (intentionally unchanged).
- Current work branch: `master`.
- Asterisk base: Ubuntu 22.04 package, Asterisk 18.x (no major migration).
- Scope: hardened local/synthetic proof of concept, not production telephony.

## Implemented

- SQLite WAL single-tenant store for users, sessions, login-rate state, redacted
  immutable topology revisions, AES-256-GCM SIP secrets, deployments, and audit.
- One-time `topology.json` migration with an unchanged pre-migration copy.
- Bootstrap-only first admin; scrypt, HttpOnly/SameSite sessions, expiry/logout,
  CSRF, role enforcement, rate limiting, security headers, last-admin safety.
- Masked topology API, explicit secret changes, wrong-key/cipher-tamper checks,
  transactional key rotation, and Asterisk 18 MD5 HA1 generation without
  plaintext in generated config.
- ETag/`If-Match`, HTTP 409, revision comments/summaries, retention, and
  rollback forward as a new revision.
- Versioned v2 JSON schema, 2 MiB import limit, v1 migration, dry-run,
  atomic import, and redacted normal export.
- Sound inventory validation, all-reference display, protected delete,
  deliberate replacement, atomic WAV upload, and live synthetic proof that an
  uploaded prompt is group-readable and emits RTP through the IVR.
- Bounded undo/redo excluding selection/viewport, keyboard shortcuts, graph and
  table editing, role UI, revisions, theme persistence.
- Schedule node with IANA timezone, windows, explicit holidays, two outputs,
  Europe/Berlin DST/midnight/weekend tests, and `GotoIfTime` generation.
- Atomic staged deploy, generator safety scan, isolated Asterisk preflight,
  immutable version directories, symlink activation, targeted reload, runtime
  canary/endpoint checks, last-good rollback, and audit.
- Long-lived AMI event connection with heartbeat, backoff, degraded state,
  dedupe, reconnect snapshot, slow polling fallback, and authenticated
  WebSocket push.
- Native queues and explicit separation from ring-group approximations.
- Checksummed CLI backup/empty restore with key kept separate and sessions
  invalidated.
- Topology-free product/health/readiness/capability contract.
- GitHub Actions jobs for static checks, Compose/image build, SIPp/Asterisk,
  Playwright, and live backup/restore.

## Verified locally on 2026-08-13

- Fresh `npm ci` and `npm audit --audit-level=moderate`: passed with zero
  advisories after updating transitive `nanoid` from 3.3.17 to 3.3.18 for
  GHSA-2v37-7h3g-55p8.
- `npm run typecheck`, `npm test`, `npm run build`, both Compose model
  validations, all Compose image builds, and `git diff --check`: passed.
- Tests: 29 shared and 66 backend (95 total), no skips/todos.
- Fresh Asterisk/SIPp acceptance: 24 semantic checks passed, then restart and
  SQLite/active-deployment persistence passed. It uploads a generated 8 kHz
  WAV, verifies directory mode 0750 and file mode 0640 with Asterisk GID 101,
  observes `BackGround(custom/synthetic-live-ivr)`, and receives 150 RTP
  packets during the synthetic IVR call.
- Registration includes multiple endpoints and replacement registration.
- Calls cover direct internal, ring group, queue, schedule open path, IVR
  playback/timeout/valid-invalid DTMF, voicemail, AMI channel/queue/hangup, CDR,
  WebSocket, deploy, invalid block, reload, corrupt activation rollback.
- The fresh Playwright run did not pass: test 1 expected one Undo after saving
  to remove `E2E Extension`, but the node remained visible at
  `tests/e2e/app.spec.ts:145`; the remaining 7 tests did not run. An older 8/8
  pass exists, but the current browser regression remains open.
- Live backup/empty restore previously passed source calls, checksummed archive,
  separate key, target restore, and post-restore callflows. It was not rerun in
  this continuation and predates the latest migration/file-mode/AMI-input and
  custom-WAV acceptance changes.

## Evidence boundary

All telephone identities, credentials, prompts, and calls are synthetic. No
trunk, DID, emergency call, carrier, physical endpoint, real-network audio,
customer NAT/firewall, or production behavior has been verified. See
`docs/VERIFICATION_MATRIX.md` and `docs/roadmap.md`.

## Publication state

The earlier hardening snapshot is on `master` and `origin/master` at `e0e05d0`.
This continuation is committed locally on `master` but intentionally not pushed
because the user requested a pause. Existing GitHub draft PR #2 is unrelated
and must not be merged or repurposed. The exact unfinished technical work is
recorded in `.agent/TODO.md`.

## Simple Business design-system contract

- `.simple-business-design-system.json` pins the central UI source to commit
  `8bbee92` and package version `0.1.1`; no rules are copied into this product.
- The root workspace consumes the exact public release artifact, the web
  frontend loads its token stylesheet before local styles, and the root build
  runs the shared icon-semantics check.
- Existing UI remains legacy; package activation is not a claim that the full
  visual migration is complete.
