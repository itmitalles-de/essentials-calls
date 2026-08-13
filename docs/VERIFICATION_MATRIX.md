# Verification matrix

Status reflects evidence produced by this repository on 2026-08-13. “Passed”
means the named automated layer passed; it does not promote a result into a
higher evidence class. The final all-suite rerun after the most recent
file-permission, session, and migration hardening is explicitly pending in
`.agent/TODO.md`.

| Capability | Unit test | Generator test | Asterisk container test | Synthetic SIP test | Browser E2E | Simulated provider test | Real carrier test | Production evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Auth, CSRF, roles, rate limit | Passed | N/A | Indirect | N/A | Passed | N/A | Not run | None |
| SQLite migration/revisions/409/rollback | Passed | N/A | Indirect | N/A | Passed | N/A | Not run | None |
| AES-GCM SIP storage/masking/rotation/tamper | Passed | HA1 output passed | Config loads | Registration uses migrated secrets | Secret editing/rights passed | Not run | Not run | None |
| Sound inventory/reference protection | Passed | Prompt mapping passed | Prompt config loads | IVR playback path passed | Passed | N/A | Not run | None |
| Atomic deploy/preflight/reload/rollback | Passed | Passed | Passed | Post-reload calls passed | Passed | N/A | Not run | None |
| Direct internal call | N/A | Passed | Passed | Passed | N/A | N/A | Not run | None |
| Repeated/multiple registration | N/A | PJSIP config passed | Passed | Passed | N/A | N/A | Not run | None |
| Ring group `ringall`/timeout/fallback | Passed | Passed | Passed | Passed | Editor coverage | N/A | Not run | None |
| Queue join/departure/timeout/reload | AMI event tests passed | Strategies passed | Passed | Passed | Editor coverage | N/A | Not run | None |
| IVR prompt/DTMF/timeout/invalid | Passed | Passed | Passed | Passed | Editor/validation passed | N/A | Not run | None |
| Voicemail and CDR | Passed | Passed | Passed | Passed | N/A | N/A | Not run | None |
| Schedule timezone/DST/midnight/weekend/holiday | Passed | Passed | Passed | Open-path call passed | Editor coverage | N/A | Not run | None |
| AMI events/reconnect/WebSocket | Recorded-event tests passed | N/A | Passed | Channel/queue events passed | Real outage/reconnect passed | N/A | Not run | None |
| Backup and empty restore | Passed | N/A | Passed | Post-restore calls passed | N/A | N/A | Not run | None |
| Trunk registration/inbound DID/outbound routing | Not implemented | Not implemented | Not run | Not run | Not implemented | Not run | Not run | None |
| Emergency calls/carrier compliance | N/A | N/A | N/A | N/A | N/A | Not simulated | Not run | None |
| Real devices/audio/NAT/firewall | N/A | N/A | N/A | Synthetic only | Headless only | Not run | Not run | None |

## Evidence classes

- **Unit test:** deterministic domain, API, database, crypto, backup, and event
  behavior without an external runtime.
- **Generator test:** exact Asterisk snippets and safety invariants.
- **Asterisk container test:** pinned Asterisk 18 starts, preflight-loads,
  reloads, exposes runtime canaries, survives restart, and rolls back.
- **Synthetic SIP test:** SIPp registers and places local calls; AMI/CDR
  confirms semantic paths.
- **Browser E2E:** Playwright drives the real frontend/API with semantic DOM
  assertions; screenshots alone are not evidence.
- **Simulated provider test:** would require a separate synthetic provider for
  inbound/outbound trunk behavior. None exists in this scope.
- **Real carrier test:** requires a real contracted carrier and DIDs. Not run.
- **Production evidence:** requires an approved deployment, monitoring,
  security/legal controls, real endpoints, and operational acceptance. None.
