# Architecture

## Product and repository boundary

The product is **Essentials+ Calls** and the canonical repository is
`itmitalles-de/essentials-calls`. The historical npm namespace, persistent
identifiers and `master` branch remain separate compatibility boundaries
documented in
[COMPATIBILITY_IDENTIFIERS.md](COMPATIBILITY_IDENTIFIERS.md). There is no
shared Essentials+ Office database or copied Office component.

## Runtime components

```text
Headless/browser client
        | HTTPS-ready HTTP + authenticated WebSocket
        v
nginx + React :8080  ---->  Express :4000  ----> SQLite WAL (/data)
                                  |  |
                shared volumes <--+  +--> long-lived AMI :5038
                     |                       |
                     v                       v
           generated config/sounds <---- Asterisk 22 :5060/RTP
                                               ^
                                               |
                                      SIPp synthetic clients
```

Published Compose ports bind to `127.0.0.1` by default. nginx proxies API and
WebSocket traffic inside the Compose network. AMI and the backend are not
needed on a public host interface.

## Source boundaries

| Area | Responsibility |
| --- | --- |
| `shared/` | Topology types, v2 format/migration/redaction, schedule evaluator, shape and semantic validation |
| `backend/src/model/` | SQLite schema, legacy migration, revisions, users, sessions, encrypted secrets, audit |
| `backend/src/security/` | scrypt passwords, AES-GCM key loading, session/CSRF/RBAC |
| `backend/src/asterisk/` | config generator, staged deploy, AMI client/event status, WAV storage |
| `backend/src/backup/` and `cli/` | checksummed backup, empty restore, bootstrap, key rotation |
| `frontend/` | graph/table editor, bounded history, import/export, sounds, revisions, role-aware controls |
| `asterisk/` | checksum-pinned Asterisk 22 source runtime and isolated preflight worker |
| `tests/` and `scripts/` | disposable SIPp/AMI/CDR, Playwright, and restore acceptance |

The shared validator gives immediate client feedback, but the backend always
revalidates untrusted data with the current server-side sound inventory.

## Persistence model

`pbx-data/essentials-calls.sqlite3` is the authoritative store:

- users, scrypt hashes, sessions, and login-rate state;
- immutable, redacted topology revisions and current/active/last-good pointers;
- AES-256-GCM SIP-secret rows keyed by extension ID;
- deployments and redacted audit events.

SQLite uses WAL, foreign keys, a busy timeout, and transactions. On first start
only, an existing `topology.json` is copied byte-for-byte to the mode-`0600`
`topology.json.pre-sqlite-migration`, migrated, redacted in revision history,
and the original plaintext source is removed only after the SQLite transaction
commits. The preserved byte-identical copy is an explicit migration artifact,
must be handled as sensitive, and is excluded from normal exports and backups.
All active credential rows are encrypted.

Custom sounds and generated Asterisk versions remain separate named volumes.
Generated files are derivatives. PJSIP files contain an Asterisk 22 digest HA1
credential, not the source password.

## Revision and editing flow

Every save creates a monotonic immutable revision with actor, time, comment,
source, and a readable summary. API reads return an ETag. Mutations require
`If-Match`; a stale client receives HTTP 409 and cannot overwrite newer work.
A rollback reads an old immutable revision and writes it forward as a new
revision. Current, active, and last-known-good revisions are protected from
retention pruning.

The frontend's bounded history tracks node, edge, membership, and property
changes. Selection and viewport moves do not create history. Loading, importing,
and rolling back reset history. Saving creates a revision and updates the
dirty-state baseline, but deliberately does not erase undo or redo: save is not
an editor-history boundary. Undo after save can therefore make the editor dirty
by returning to a topology that predates that revision. Reloading always loads
the persisted current revision as a fresh history root.

## Atomic deploy protocol

1. Prove topology shape.
2. Validate semantic rules and the current sound inventory.
3. Materialize SIP secrets transiently.
4. Generate all files in a private staging directory.
5. Reject unsafe generated text and excessive output.
6. Ask an isolated Asterisk 22 process in the container to load the candidate.
7. Rename staging to an immutable version directory.
8. atomically switch the `current` symlink.
9. run targeted dialplan/PJSIP/queue/voicemail reloads through AMI.
10. verify Asterisk version, dialplan, deployment canary, and endpoint count.
11. atomically update `last-good` and the active revision, then audit success.

Any failure before activation leaves `current` unchanged. A reload or runtime
failure after activation switches back to the previous target, reloads it,
checks that runtime, and records whether rollback succeeded. A successful file
write alone is never reported as a successful deploy.

## Runtime status

`AmiStatusService` maintains one long-lived AMI event connection and handles
endpoint/contact, channel state, bridge, hangup, queue caller, and queue member
events. It:

- deduplicates event identities for a bounded interval;
- heartbeats with AMI Ping;
- reconnects with exponential backoff;
- publishes `connected`, `reconnecting`, or `degraded`;
- refreshes endpoint/queue snapshots after reconnect; and
- retains a slow polling snapshot as fallback.

Transient status never enters a topology revision. Authenticated WebSocket
clients receive snapshots and changes.

## Office integration contract

`/health`, `/ready`, and `/api/service` expose only product name/version,
API version, capability IDs, auth mode, and health/readiness metadata. They
contain no topology, user, credential, or call data.

## Trust boundary

This architecture hardens a local single-tenant proof of concept. External
routes are absent by default; reserved `110`/`112` extension numbers fail
validation and no automatic outside-line or emergency fallback exists. TLS
termination, production network segmentation, real carrier behavior, DID and
emergency routing, legal responsibility, physical endpoints, and operational
acceptance remain external.
