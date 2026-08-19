# Isolated test-DID pilot plan

## Status and hard boundary

This is a plan, not an authorization or deployment procedure. No provider
credential, trunk, DID, public-network route, or emergency capability is
configured by this repository.

A later pilot may run only in one isolated, single-tenant instance with one
approved test SIP provider and test DID. It may involve no customers, production
guarantee, emergency service, recording, transcription, AI, or general public
exposure. It must not forward to `110`, `112`, or any other emergency service.

The pilot must not start until every external gate has a named owner, written
approval, evidence, and a maintenance window. Provider credentials and private
network details stay in an approved secret manager, never Git, diagnostics, or
backup artifacts.

## External gates

| Gate | Required evidence before pilot |
| --- | --- |
| Code and licence rights | Written right to modify, run, and evaluate the code |
| Responsibility | Named technical, security, privacy, and incident owners |
| Revenue allocation | Written agreement or explicit confirmation that the test has no commercial use |
| Provider contract | Contract explicitly permits the isolated test and states limitations |
| SIP access | Dedicated test credentials with revocation and rotation process |
| DID | Dedicated non-customer test DID and documented routing ownership |
| Network design | Reviewed isolated network and data-flow diagram |
| NAT | Provider-specific signalling and media traversal test plan |
| Firewall | Explicit ingress/egress rules; no blanket public exposure |
| RTP port range | Agreed narrow range and observation method |
| Codec | Explicit common codec list and transcoding decision |
| TLS/SRTP | Provider capability and chosen security posture documented; absence is a recorded risk |
| Endpoint | Named test handset/softphone, version, configuration, and owner |
| Privacy | Data categories, retention, access, deletion, and lawful basis reviewed |
| Emergency concept | Written proof that emergency use is unsupported and technically blocked |
| Support | Contacts, escalation path, stop authority, and incident template |
| Backup | Pre-pilot backup plus separately protected matching master key |
| Monitoring | Availability, SIP failure, media, disk, security, and log-retention plan |
| Maintenance window | Approved start/end, rollback point, and post-test shutdown |

Open rights, responsibility, revenue, provider, DID, privacy, emergency, or
operations gates are stop conditions; local green tests do not override them.

## Technical admission controls

- Provider/trunk activation is absent by default and requires an explicit,
  reviewed pilot configuration.
- Outbound routing uses a positive allowlist containing only the approved
  ordinary test destination. A blacklist is not an acceptable primary control.
- `110` and `112` remain reserved by domain validation and must also be denied
  at every provider and firewall layer. There is no fallback route or automatic
  outside line.
- Inbound routing accepts only the dedicated test DID and expected provider
  source/authentication profile.
- Rate, concurrent-call, cost, and time-window limits are fail-closed.
- Credentials are injected at runtime; sanitised logs must not contain SIP
  passwords, master keys, or topologies with secret material.
- The pilot instance and its credentials are shut down after the window.

The present implementation has no external/trunk dialplan support. Adding the
allowlisted adapter is a future, separately reviewed change and must first have
a fully synthetic provider acceptance contract.

## Pilot test matrix

Each row needs timestamped evidence, expected/actual outcome, redacted call ID,
observer, and rollback result.

| Scenario | Required result |
| --- | --- |
| Inbound test call | Dedicated test DID reaches only the approved flow |
| Outbound test call | Only the explicitly allowlisted ordinary test number is reachable |
| `110` / `112` | Rejected locally and by provider policy; no fallback attempt |
| DTMF | Valid, invalid, and timeout branches match the approved flow |
| IVR | Prompt and routing work without recording or transcription |
| Ring group | Approved endpoints ring with documented timeout/fallback |
| Queue | Join, member delivery, timeout, and empty behavior are observed |
| Voicemail | Test-only mailbox works with reviewed retention/deletion |
| Caller ID | Inbound and outbound presentation matches the provider contract |
| Caller abort | Clean hangup and consistent CDR/status |
| Busy | Expected busy/fallback result, no unintended route |
| Timeout | Bounded termination or approved fallback |
| NAT | Signalling and RTP traverse only the reviewed path |
| One-/two-way audio | Both directions observed; one-way failure diagnosed fail-closed |
| Reconnect | Endpoint/provider reconnect does not widen routing |
| Provider failure | No silent alternate carrier or emergency fallback |
| Backup/restore | Empty-target restore with separate key and post-restore test call |
| Rollback | Last-known-good application state restored and reverified |

## Entry, stop, and exit

Entry requires all gates, a named allowlisted destination, valid backup/key,
and the approved window. Stop immediately on unexpected destination reachability,
credential disclosure, emergency-routing attempt, uncontrolled cost, privacy
incident, one-way audio without diagnosis, or rollback failure. Exit requires
provider/DID/trunk disablement, credential revocation or rotation, evidence
retention under the approved policy, and a documented decision before any next
pilot. There is no automatic progression to production.
