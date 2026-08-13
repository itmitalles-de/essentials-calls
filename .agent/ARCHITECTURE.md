# Architecture handoff

Authoritative detail:

- `docs/architecture.md`
- `docs/domain-model.md`
- `docs/asterisk-mapping.md`
- `docs/asterisk-notes.md`
- `docs/api.md`
- `docs/security.md`
- `docs/backup-restore.md`
- `docs/VERIFICATION_MATRIX.md`

## Runtime map

```text
React/nginx -> authenticated REST + WebSocket -> Express
                                              |-> SQLite WAL (source of truth)
                                              |-> volumes (sounds/config versions)
                                              '--> AMI event/reload connection
                                                        |
                                                        v
                                            pinned Asterisk 18 <- SIPp
```

## Invariants

- Visible name is Essentials+ Calls; technical repo/package identity remains
  `visual-pbx`.
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

## Persistence

`pbx-data/essentials-calls.sqlite3` contains users, sessions, login-rate
state, immutable redacted revisions, AEAD SIP secrets, deployment history, and
audit. `asterisk-sounds` contains custom WAVs.
`asterisk-generated/versions/<deployment>` contains HA1-based Asterisk
configuration and manifests; `current` and `last-good` are atomic symlinks.

## Verification

`npm test` covers shared/backend logic. The three runtime authorities are:

- `npm run test:full-stack`: Asterisk 18 + SIPp + AMI + CDR + restart;
- `npm run test:e2e`: Chromium against real Compose services; and
- `npm run test:backup-restore`: separate source/empty target plus post-restore
  calls.

Passing these proves only the columns marked in the verification matrix.
