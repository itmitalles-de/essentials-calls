# Verification matrix

Snapshot: 2026-08-22 on branch `agent/simple-calls-ui-softphones`, verified
implementation commit `893708974be427f1d2ab38d297684e1265398762`
(stabilization baseline `219361ce5a2b4d1f128ce02948bdfc648a696283`).
“Passed” applies only to the named evidence class and never promotes a result
to a real-carrier, DID, telephone-network, or production claim.

| Capability | Unit | Integration | SIPp | Asterisk 22 | Browser | Backup/restore | Real carrier | Real DID | Real telephone network | Production |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Authentication, CSRF, roles, rate limit | Passed | API passed | N/A | Indirect | Passed | Three roles restored; sessions invalidated | Not run | N/A | Not run | None |
| Topology, revisions, conflict, rollback | Passed | API/database/deploy passed | Route topology used | Active/last-good passed | Passed | Revisions and pointers restored | Not run | Not run | Not run | None |
| Save/undo/redo/dirty-state contract | 5 frontend tests passed | N/A | N/A | N/A | Passed: pre/post-save, graph/table, reload, fresh context | Persisted revision reloaded | N/A | N/A | N/A | None |
| Simple Business shell, themes, softphone guidance | 2 URL-allowlist tests passed | Service metadata passed | N/A | Endpoint metadata only | Desktop/mobile navigation, theme, official links, no secret output passed | N/A | Not run | Not run | Not run | None |
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
- Static suites: design-contract lint, typecheck, and production build passed;
  30 shared, 70 backend, and 7 frontend tests passed (107 total), with zero
  skips/TODOs.
- Compose: ordinary and acceptance models validated with synthetic required
  variables; the policy check found three ordinary and four acceptance images,
  all with explicit project-isolated version tags and none with `latest`;
  Asterisk, backend, frontend, and SIPp acceptance images built from
  digest-pinned bases.
- Full stack: 28 semantic checks passed, followed by Asterisk/backend restart
  and exact SQLite/active-deployment persistence checks. The successful rerun
  used its own Compose project, volumes, and host-port range; an earlier start
  detected and preserved an unrelated process already using port 18080.
- Browser: Playwright 1.62.1 with Chrome for Testing 151.0.7922.34 ran all
  eight tests in 39.1 seconds: 8/8 passed, zero skips/TODOs, no unexpected
  console/page
  errors, unallowlisted HTTP errors, failed requests, or unhandled browser
  promise rejection.
- Recovery: a fresh source ran 27 semantic checks; wrong key B failed closed;
  A restored into an empty target; A-to-C rotation materialised all three
  encrypted credentials; obsolete A failed against the C archive; C restored
  into another empty target. Both valid restores passed users/roles, revisions,
  active/last-good, audit, session invalidation, non-persisted AMI state,
  pre-start data/database modes, Asterisk startup, custom WAV/permissions, IVR
  playback, 56 observed RTP packets, semantic call routes, CDR, and WebSocket
  assertions. Unit fault injection additionally proved cleanup after target
  population failure. Source, target, and rotated restores used unique Compose
  projects, empty volumes, and non-overlapping host/RTP ranges.
- Supply-chain checks: immutable action/base/helper-image references, explicit
  versioned Compose build tags with a fail-closed no-`latest` policy,
  tracked-file high-confidence secret scan including the lockfile, 226-component
  npm and 6-component pinned Asterisk-source CycloneDX SBOM generation,
  worktree whitespace validation, and base-to-head PR whitespace validation
  passed. Exact direct apt versions resolved from named Ubuntu/Debian snapshots;
  Node runtime images had no package manager or checked development dependency.
  Checksum-verified Trivy 0.74.0 found zero HIGH/CRITICAL issues in Asterisk and
  frontend and no new or fixable finding in any image. Fifteen unique unfixed
  Debian IDs remain explicitly package-scoped through 2026-09-20 (30 backend
  and 33 SIPp-image occurrences); this is a visible PoC exception and production
  blocker, not a clean vulnerability claim.
- Repository controls: GitHub full-action-SHA enforcement, Dependabot
  vulnerability alerts, and automated security fixes are enabled; the current
  alert list is empty. Weekly npm/action/Docker updates are checked in but take
  effect only from the default branch. Managed secret/code scanning is not
  available without GitHub Advanced Security; only the narrower local secret
  scan is evidenced.

## Evidence-class definitions

- **Unit:** deterministic pure/domain/crypto/database/history assertions.
- **Integration:** API, SQLite, generator, deploy protocol, archive, and event
  behavior without claiming an external telephone network.
- **SIPp:** synthetic SIP registration/calls and RTP in disposable networks.
- **Asterisk 22:** the checksum-pinned Asterisk 22.10.1 source runtime with
  bundled PJProject 2.17 and Jansson 2.15.0 loads and executes generated
  configuration. LTS status is not a production-acceptance claim.
- **Browser:** semantic Chromium interaction with real local Compose services;
  screenshots are diagnostics, not pass evidence.
- **Backup/restore:** application-level recovery into fresh local volumes with
  a separately supplied synthetic key.
- **Real carrier / DID / telephone network:** requires approved external
  contracts, credentials, numbers, endpoints, and network tests. None ran.
- **Production:** requires supported runtimes plus legal, security, privacy,
  operations, monitoring, support, and explicit release acceptance. None exists.
