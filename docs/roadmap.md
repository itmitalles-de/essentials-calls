# Status, roadmap, and blockers

Status: 2026-08-20. Essentials+ Calls is a single-tenant callflow editor,
simulator, and isolated synthetic Asterisk 22 LTS runtime: a technical
proof of concept, not a production PBX or telephone service.

## Implemented PoC boundary

- Extensions, IVR, ring groups, native queues, voicemail, Europe/Berlin-aware
  schedules, immutable callflow revisions, rollback, graph/table editing, and
  bounded save-aware undo/redo.
- Local viewer/editor/admin accounts, scrypt passwords, sessions, CSRF, rate
  limiting, optimistic concurrency, audit, and SQLite WAL persistence.
- AES-256-GCM SIP-secret storage, redacted revisions/API/export, Asterisk 22
  digest HA1 derivatives, atomic master-key rotation, and separate-key
  recovery.
- Server-authoritative sound inventory, atomic WAV upload, generated
  configuration, isolated preflight, atomic activation, reload canary, and
  last-known-good rollback.
- AMI status/events, CDR, authenticated WebSocket updates, and ephemeral runtime
  state separated from configuration.
- Disposable SIPp/Asterisk, Chromium, and A/B/C backup/recovery acceptance with
  synthetic identities, credentials, prompts, calls, WAV, and RTP only.
- Digest/SHA-pinned actions, bases, source archives and SBOM inputs; exact apt
  versions from named Ubuntu/Debian snapshots; minimized Node runtimes; and a
  local-image CVE gate whose only exception is package-scoped and expires on
  2026-09-20.
- Fail-closed absence of external routing: `trunk`/`external` are disabled,
  `110`/`112` are reserved, and there is no automatic outside line.

The exact evidence and its limits are in
[VERIFICATION_MATRIX.md](VERIFICATION_MATRIX.md). A green synthetic suite does
not promote any row to carrier, DID, public-network, or production evidence.

## External and production blockers

The following require authority, third parties, infrastructure, or a separately
approved engineering project:

- code ownership and licence rights;
- responsibility, liability, and revenue allocation;
- approved provider contract, dedicated test SIP access, and test DID;
- real inbound/outbound carrier behavior and fraud/cost controls;
- an emergency-service concept, legal assessment, location/routing design, and
  technical proof (none is claimed here);
- real handset/softphone, codec, caller-ID, one-/two-way audio, NAT, firewall,
  reconnect, and provider-failure acceptance;
- privacy, voicemail retention, support, monitoring, incident response,
  backups, maintenance windows, and an operations owner;
- TLS/SRTP policy, host/network hardening, managed secret/code scanning, and
  remediation or reviewed renewal of the time-limited Debian CVE exception;
- controlled maintenance of the pinned Asterisk 22/PJProject source chain and
  named package snapshots, with complete requalification for every runtime
  update; and
- production capacity, availability, RTO/RPO, penetration, carrier, and legal
  acceptance.

These blockers do not authorize scope expansion. Asterisk 22 LTS removes the
former Asterisk-18 EOL blocker, but it does not remove any real-world or
production gate.

## Possible next controlled milestone

Only after all external gates are evidenced, the documentation-only
[isolated test-DID pilot plan](PILOT_TEST_DID.md) may become a separately
approved implementation task. It requires one isolated instance, one named
provider/DID, one positively allowlisted ordinary test destination, an approved
maintenance window, and explicit shutdown/rollback. It forbids customers,
emergency calls, recording, transcription, AI, and automatic production
progression.

Before such a pilot, build a fully synthetic provider contract covering
registration, inbound/outbound routing, authentication errors, reconnect,
codec negotiation, outage, positive allowlisting, and fail-closed emergency
denial. Simulation still would not be carrier acceptance.

## Explicitly not in this milestone

No production SIP trunk, real DID, `110`/`112`, billing, tariff accounting,
multi-tenant cloud PBX, recording, transcription, AI receptionist, contact
centre, mobile app, Kubernetes, public exposure, any further Asterisk major
upgrade, or customer operation is planned or scaffolded here. See
[NICE_TO_HAVE.md](NICE_TO_HAVE.md) for other deferred ideas.

## Production release gate

Production requires every blocker above to have an owner and evidence, all
applicable synthetic and real-world matrix columns to pass on a supported
runtime, and an explicit release decision. Neither a CI badge nor this technical
PoC is that decision.
