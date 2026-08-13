# Verification matrix

Status reflects evidence produced by this repository on 2026-08-13. “Passed”
means the named automated layer passed; it does not promote a result into a
higher evidence class. The latest Playwright rerun failed its first undo/history
assertion and skipped the remaining seven tests; older browser passes are marked
as such and the current browser regression remains pending in `.agent/TODO.md`.

| Capability | Unit test | Generator test | Asterisk container test | Synthetic SIP test | Browser E2E | Simulated provider test | Real carrier test | Production evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Auth, CSRF, roles, rate limit | Passed | N/A | Indirect | N/A | Earlier pass; latest skipped | N/A | Not run | None |
| SQLite migration/revisions/409/rollback | Passed | N/A | Indirect | N/A | Earlier pass; latest skipped | N/A | Not run | None |
| AES-GCM SIP storage/masking/rotation/tamper | Passed | HA1 output passed | Config loads | Registration uses migrated secrets | Earlier pass; latest skipped | Not run | Not run | None |
| Sound inventory/reference protection | Passed | Prompt mapping passed | Upload mode/GID and prompt load passed | Uploaded custom WAV emitted RTP through IVR | Earlier pass; latest skipped | N/A | Not run | None |
| Atomic deploy/preflight/reload/rollback | Passed | Passed | Passed | Post-reload calls passed | Earlier pass; latest skipped | N/A | Not run | None |
| Editor graph/table/undo/reload | N/A | N/A | N/A | N/A | Latest run failed undo-after-save assertion | N/A | Not run | None |
| Direct internal call | N/A | Passed | Passed | Passed | N/A | N/A | Not run | None |
| Repeated/multiple registration | N/A | PJSIP config passed | Passed | Passed | N/A | N/A | Not run | None |
| Ring group `ringall`/timeout/fallback | Passed | Passed | Passed | Passed | Earlier editor coverage; latest skipped | N/A | Not run | None |
| Queue join/departure/timeout/reload | AMI event tests passed | Strategies passed | Passed | Passed | Earlier editor coverage; latest skipped | N/A | Not run | None |
| IVR prompt/DTMF/timeout/invalid | Passed | Passed | Passed | Passed | Earlier editor/validation pass; latest skipped | N/A | Not run | None |
| Voicemail and CDR | Passed | Passed | Passed | Passed | N/A | N/A | Not run | None |
| Schedule timezone/DST/midnight/weekend/holiday | Passed | Passed | Passed | Open-path call passed | Earlier editor coverage; latest skipped | N/A | Not run | None |
| AMI events/reconnect/WebSocket | Recorded-event tests passed | N/A | Passed | Channel/queue events passed | Earlier outage/reconnect pass; latest skipped | N/A | Not run | None |
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
