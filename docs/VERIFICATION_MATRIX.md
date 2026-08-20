# Verification matrix

Snapshot: 2026-08-20 on branch `stabilize/calls-verified-poc`, reviewed
runtime-content commit `8f0cdd9311b0ef9511615e23866be143e684c71c` (baseline
`d88e8e54e7591bedd667e072737426c840c4160d`).
“Passed” applies only to the named evidence class and never promotes a result
to a real-carrier, DID, telephone-network, or production claim.

| Capability | Unit | Integration | SIPp | Asterisk 18 | Browser | Backup/restore | Real carrier | Real DID | Real telephone network | Production |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Authentication, CSRF, roles, rate limit | Passed | API passed | N/A | Indirect | Passed | Three roles restored; sessions invalidated | Not run | N/A | Not run | None |
| Topology, revisions, conflict, rollback | Passed | API/database/deploy passed | Route topology used | Active/last-good passed | Passed | Revisions and pointers restored | Not run | Not run | Not run | None |
| Save/undo/redo/dirty-state contract | 5 frontend tests passed | N/A | N/A | N/A | Passed: pre/post-save, graph/table, reload, fresh context | Persisted revision reloaded | N/A | N/A | N/A | None |
| AES-GCM SIP secrets and HA1 derivative | Passed | Wrong key/tamper/materialisation passed | Registration passed | HA1 config loaded | Masked/admin flow passed | A/B/C fail-closed and rotation passed | Not run | Not run | Not run | None |
| Atomic deploy, reload, corrupt activation, rollback | Passed | Passed | Calls after reload passed | Preflight/canary/rollback passed | Valid/invalid deploy passed | Active config/calls restored | Not run | Not run | Not run | None |
| Custom WAV, permissions, IVR playback, RTP | Passed | Inventory/upload passed | 56 RTP packets observed | Custom prompt executed | Upload/reference/delete passed | Passed after A and C restores; `0750`/`0640` and reader GID | Not run | Not run | Synthetic only | None |
| Direct internal and replacement registration | N/A | Generator passed | Passed | Passed | N/A | Passed after both restores | Not run | Not run | Synthetic only | None |
| Ring group | Passed | Exact application evidence | Passed | Passed | Editor covered | Passed after both restores | Not run | Not run | Synthetic only | None |
| Native queue and timeout/fallback | Passed | Events/generator passed | Passed | Passed, including reload | Editor covered | Passed after both restores | Not run | Not run | Synthetic only | None |
| Schedule open route and time rules | DST/midnight/holiday passed | Generator/evaluator passed | Open route passed | Passed | Editor covered | Open route passed after both restores | Not run | Not run | Synthetic only | None |
| IVR valid/invalid DTMF and timeout | Passed | Exact destination evidence | Passed | Passed | Validation/editor covered | Timeout/custom-media routes passed | Not run | Not run | Synthetic only | None |
| Voicemail | Passed | Generator/direct application passed | Passed | Passed | N/A | Passed after both restores | Not run | Not run | Synthetic only | None |
| AMI, CDR, WebSocket, reconnect | Passed | Recorded events/API passed | Channel/CDR evidence passed | Passed | Outage/reconnect passed | CDR/WebSocket passed; AMI state not persisted | Not run | Not run | Synthetic only | None |
| Backup checksums, users, audit, file modes | Passed, including population-failure cleanup | Archive corruption/empty-target passed | Post-restore calls passed | Starts after restore | N/A | Passed with fresh source/A/C volumes; modes checked before startup | Not run | Not run | Not run | None |
| Interrupted key rotation | Passed: mid-write and final-audit rollback | Old-key process/durable state stays repairable | N/A | N/A | N/A | A/C rehearsal passed | N/A | N/A | N/A | None |
| Emergency boundary | `110`/`112`, trunk/external rejection passed | No external route generated | No emergency call attempted | No outside line/fallback | PoC warning visible | Boundary persists | Not run | Not run | Not run | None |
| Outbound positive pilot allowlist | Future gate; no adapter | Not implemented | Not implemented | Not implemented | Not implemented | Not implemented | Not run | Not run | Not run | None |

## Recorded runs

- Dependency install: exact Node 24.19.0/npm 11.17.0 `npm ci` passed with
  explicitly pinned install-script approvals.
- Advisory scan: `npm audit --audit-level=moderate` reported zero
  vulnerabilities.
- Static suites: typecheck and production build passed; 30 shared, 70 backend,
  and 5 frontend tests passed (105 total), with zero skips/TODOs.
- Compose: ordinary and acceptance models validated with synthetic required
  variables; Asterisk, backend, frontend, and SIPp acceptance images built from
  digest-pinned bases.
- Full stack: 28 semantic checks passed, followed by Asterisk/backend restart
  and exact SQLite/active-deployment persistence checks.
- Browser: Playwright 1.62.1 with Chrome for Testing 151.0.7922.34 ran all
  eight tests in 32.4 seconds: 8/8 passed, zero skips/TODOs, no unexpected
  console/page errors, unallowlisted HTTP errors, failed requests, or unhandled
  browser promise rejection.
- Recovery: a fresh source ran 27 semantic checks; wrong key B failed closed;
  A restored into an empty target; A-to-C rotation materialised all three
  encrypted credentials; obsolete A failed against the C archive; C restored
  into another empty target. Both valid restores passed users/roles, revisions,
  active/last-good, audit, session invalidation, non-persisted AMI state,
  pre-start data/database modes, Asterisk startup, custom WAV/permissions, IVR
  playback, 56 observed RTP packets, semantic call routes, CDR, and WebSocket
  assertions. The final complete A/B/C orchestration took about 162 seconds;
  unit fault injection additionally proved cleanup after target population
  failure.
- Supply-chain checks: immutable action/base/helper-image references,
  tracked-file high-confidence secret scan including the lockfile, npm
  CycloneDX SBOM generation, worktree whitespace validation, and base-to-head
  PR whitespace validation passed. Asterisk/SIPp apt resolution and absence of
  a container-CVE scanner remain recorded residual gates.

## Evidence-class definitions

- **Unit:** deterministic pure/domain/crypto/database/history assertions.
- **Integration:** API, SQLite, generator, deploy protocol, archive, and event
  behavior without claiming an external telephone network.
- **SIPp:** synthetic SIP registration/calls and RTP in disposable networks.
- **Asterisk 18:** the pinned Ubuntu Asterisk 18.10 container loads and executes
  generated configuration. Upstream support has ended; this is not a production
  support claim.
- **Browser:** semantic Chromium interaction with real local Compose services;
  screenshots are diagnostics, not pass evidence.
- **Backup/restore:** application-level recovery into fresh local volumes with
  a separately supplied synthetic key.
- **Real carrier / DID / telephone network:** requires approved external
  contracts, credentials, numbers, endpoints, and network tests. None ran.
- **Production:** requires supported runtimes plus legal, security, privacy,
  operations, monitoring, support, and explicit release acceptance. None exists.
