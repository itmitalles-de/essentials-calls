# Current state

## Product and branch

- Visible product: **Essentials+ Calls**.
- Technical repository/npm namespace: `visual-pbx` (intentionally unchanged).
- Default branch: `master` (intentionally unchanged).
- Current work branch: `agent/essentials-calls-autonomous`.
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
  deliberate replacement, and atomic WAV upload.
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

- `npm audit --audit-level=moderate`: zero advisories.
- After the latest source changes, `npm run typecheck`, `npm test`,
  `npm run build`, and `git diff --check`: passed.
- Tests: 29 shared and 66 backend (95 total), no skips/todos.
- Last fresh Playwright/Compose run: 8/8 semantic tests passed. It predates the
  latest editor-history assertion and WebSocket session-revalidation patch, so
  a final fresh run is still required.
- Last fresh Asterisk/SIPp acceptance: 22 semantic checks passed, then restart and
  SQLite/active-deployment persistence passed.
- Registration includes multiple endpoints and replacement registration.
- Calls cover direct internal, ring group, queue, schedule open path, IVR
  playback/timeout/valid-invalid DTMF, voicemail, AMI channel/queue/hangup, CDR,
  WebSocket, deploy, invalid block, reload, corrupt activation rollback.
- Live backup/empty restore previously passed source calls, checksummed archive,
  separate key, target restore, and post-restore callflows. The full-stack and
  restore runs predate the latest migration/file-mode/AMI-input hardening.
- Compose validation and image builds previously passed; images have not been
  rebuilt since the latest Asterisk entrypoint and sound-volume changes.

## Evidence boundary

All telephone identities, credentials, prompts, and calls are synthetic. No
trunk, DID, emergency call, carrier, physical endpoint, real-network audio,
customer NAT/firewall, or production behavior has been verified. See
`docs/VERIFICATION_MATRIX.md` and `docs/roadmap.md`.

## Publication state

The branch contains a local hardening snapshot commit (see `git log`). It has
not been pushed and no new draft PR has been opened. Existing GitHub draft PR
#2 is unrelated and must not be merged or repurposed. The exact unfinished work
is recorded in `.agent/TODO.md`.
