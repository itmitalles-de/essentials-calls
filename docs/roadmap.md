# Status, roadmap, and blockers

Status: 2026-08-13. Essentials+ Calls is a hardened, automated **local
proof of concept**. It is not represented as a production telephone system.

## Locally implemented and verified

- SQLite WAL persistence, one-time protected JSON migration, immutable
  revisions, ETags/409 conflict protection, retention, audit, and rollback.
- No-default local authentication, scrypt, HttpOnly/SameSite sessions, expiry,
  logout, CSRF, rate limiting, server-side viewer/editor/admin authorization,
  and admin safety rules.
- AES-256-GCM SIP storage, redacted API/revisions/export, explicit secret
  command, legacy migration, ciphertext/wrong-key/rotation tests, and Asterisk
  18 HA1 generation without plaintext config.
- Server sound inventory validation, reference listing/protected deletion,
  deliberate replacement, and atomic WAV writes.
- Bounded editor undo/redo, versioned import/export/schema/migration, graph and
  table editing, theme persistence, roles, revisions, and conflict UI.
- Schedule nodes with IANA timezone, multiple windows, weekdays, explicit
  holidays, open/closed routes, midnight and CET/CEST handling.
- Staged generation, isolated Asterisk preflight, atomic symlinks, targeted
  reload, runtime canary, last-known-good rollback, and deployment audit.
- Long-lived AMI events with heartbeat, backoff, degraded state,
  deduplication, reconnect snapshot, polling fallback, and authenticated
  WebSocket updates.
- Native Asterisk queues separated from ring groups and synthetic event/call
  coverage.
- Checksummed backup and empty restore, separate master key, and post-restore
  synthetic calls.
- Stable Office discovery metadata without a shared database.

See [VERIFICATION_MATRIX.md](VERIFICATION_MATRIX.md) for the exact evidence
class and unverified columns.

## Blocked

These items require authority, third parties, real infrastructure, legal work,
or an explicit separate migration. They do not block continued local quality
work:

- rights and licensing status of the existing code;
- responsibility and revenue allocation among involved people;
- real SIP trunk integration;
- real DID routing;
- real endpoints/handsets and softphones;
- emergency-call concept, location, routing, and legal obligations;
- carrier acceptance and provider-specific behavior;
- audio quality in a real telephone network;
- customer firewall/NAT design and validation;
- production operation, monitoring, incident response, patching, and support.

Trunk/DID nodes remain disabled. No half-finished provider adapter was added
because the required fully synthetic provider contract (registration, inbound,
outbound, auth error, reconnect, codec negotiation, outage, routing) was not
available. Even such a simulation would not prove real-carrier or emergency
readiness.

## Not scheduled in this scope

The documentation-only list is in [NICE_TO_HAVE.md](NICE_TO_HAVE.md). Those
ideas have no code, dependencies, empty database tables, or implied commitment.

## Release gate

A future product release requires all blocked ownership/legal and operational
items to be assigned and evidenced, plus real carrier and device verification.
Local SIPp, AMI, CDR, Docker, and Playwright success is necessary engineering
evidence but cannot satisfy that gate by itself.
