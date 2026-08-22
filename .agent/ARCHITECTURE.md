# Architecture handoff

Authoritative detail:

- `docs/architecture.md`
- `docs/domain-model.md`
- `docs/asterisk-mapping.md`
- `docs/asterisk-notes.md`
- `docs/api.md`
- `docs/security.md`
- `docs/backup-restore.md`
- `docs/operations/MASTER_KEY_RECOVERY.md`
- `docs/COMPATIBILITY_IDENTIFIERS.md`
- `docs/PILOT_TEST_DID.md`
- `docs/VERIFICATION_MATRIX.md`

## Runtime map

```text
React/nginx -> authenticated REST + WebSocket -> Express
                                              |-> SQLite WAL (source of truth)
                                              |-> volumes (sounds/config versions)
                                              '--> AMI event/reload connection
                                                        |
                                                        v
                                            pinned Asterisk 22 <- SIPp
```

## Invariants

- Product and canonical repository are Essentials+ Calls and
  `itmitalles-de/essentials-calls`; historical npm/data/runtime names remain
  only as documented compatibility identifiers.
- SQLite revisions and encrypted secret rows are authoritative. Generated files
  are immutable derived versions.
- API topology, revisions, audit, and normal exports contain no plaintext SIP
  passwords.
- Every mutation is authenticated, authorized, CSRF-protected, and audited
  where security or configuration state changes.
- Every topology mutation uses an expected revision; stale writers receive 409.
- Backend validation is authoritative and includes the live sound inventory.
- Deploy success requires staging, isolated Asterisk preflight, activation,
  reload, and runtime checks. Failure after activation invokes rollback.
- Runtime AMI state is never persisted as topology.
- Test/public Compose ports remain loopback-bound by default.
- Trunk/external stay disabled; synthetic calls are never carrier evidence.
- `110`/`112` are rejected, no outside-line/emergency fallback exists, and a
  future pilot requires an explicit positive destination allowlist.
- Save preserves local undo/redo while updating the dirty baseline; reload,
  import, rollback, and browser restart establish a new history root.
- Base images use immutable digests; direct apt inputs use exact versions from
  named Ubuntu/Debian snapshots. Node runtime images exclude package managers
  and development dependencies. The local-image CVE gate permits only the
  package-scoped, expiring PoC exception recorded in `.github`.

## Persistence

`pbx-data/essentials-calls.sqlite3` contains users, sessions, login-rate
state, immutable redacted revisions, AEAD SIP secrets, deployment history, and
audit. `asterisk-sounds` contains custom WAVs.
`asterisk-generated/versions/<deployment>` contains HA1-based Asterisk
configuration and manifests; `current` and `last-good` are atomic symlinks.

## Verification

`npm test` covers shared/backend logic. The three runtime authorities are:

- `npm run test:full-stack`: Asterisk 22 + SIPp + AMI + CDR + restart;
- `npm run test:e2e`: Chromium against real Compose services; and
- `npm run test:backup-restore`: separate source/empty target plus post-restore
  calls, wrong/obsolete key rejection, A-to-C rotation, custom WAV, and RTP.

Passing these proves only the columns marked in the verification matrix.
