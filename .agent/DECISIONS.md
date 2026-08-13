# Decisions

## Product name without administrative repository migration

**Decision:** User-visible branding is Essentials+ Calls; repository/package
namespace, default branch, and Asterisk 18 base remain unchanged.

**Reason:** The assignment explicitly separates product naming from technical
administration and major-version migration.

## SQLite WAL single-tenant persistence

**Decision:** Replace mutable `topology.json` with SQLite WAL for users,
sessions, audit, revisions, deploy history, and encrypted SIP values.

**Reason:** It supplies transactions, optimistic concurrency, online backup,
and durable history without an unjustified PostgreSQL service.

**Consequence:** Existing JSON migrates exactly once after a byte-identical,
mode-`0600` backup. The original plaintext source is removed only after commit;
the preserved migration artifact is excluded from normal export/backup and
must be handled as sensitive. Generated Asterisk files remain derivatives.

## Local sessions and server-side roles

**Decision:** Use no-default local users, scrypt hashes, opaque HttpOnly
sessions, CSRF, and viewer/editor/admin authorization on every API route.

**Reason:** This is the smallest self-contained single-tenant trust boundary.
OIDC/Office SSO is explicitly deferred.

## AEAD source secrets and Asterisk 18 HA1 derivatives

**Decision:** Encrypt SIP passwords with AES-256-GCM in SQLite and materialize
them only transiently. Generate Asterisk 18 `md5_cred` HA1 for the fixed
`asterisk` realm instead of plaintext config.

**Reason:** Asterisk 18 supports HA1 but predates newer `password_digest`.
This meets the no-plaintext persistent-storage boundary without changing the
Asterisk major.

**Consequence:** Keys are supplied separately and backed up separately. Strong
SIP passwords remain mandatory because HA1 can be guessed offline.

## Optimistic concurrency and immutable history

**Decision:** Require `If-Match`, return 409 on stale writes, and implement
rollback as a new immutable revision.

**Reason:** Blind last-write-wins is unsafe for parallel editors, while a full
collaborative merge engine is outside scope.

## Shared validator, authoritative server inventory

**Decision:** Browser and backend share domain rules, but only the backend
combines them with the current sound inventory and authorizes persistence.

**Reason:** Immediate UX feedback must not make the client a trust boundary.

## Atomic deploy with isolated Asterisk preflight

**Decision:** Stage immutable versions, load candidates in a second private
Asterisk process, atomically switch symlinks, reload/check the live runtime, and
roll back to last-good.

**Reason:** Text generation and successful writes do not prove loadability or
runtime activation.

## AMI events with snapshot fallback

**Decision:** Maintain a long-lived AMI connection, event projection,
heartbeat/backoff/degraded state, reconnect snapshot, and slow polling fallback.

**Reason:** Polling alone is stale and expensive; events alone can be lost
across disconnects. Runtime state remains ephemeral.

## Ring group and queue remain distinct

**Decision:** Ring-group `ringall` is parallel Dial; other ring-group
strategies are documented ordered approximations. Queue strategies use
`app_queue` and are only claimed where synthetic runtime evidence exists.

**Reason:** Do not disguise an approximation as native queue semantics.

## No half-finished trunk/DID

**Decision:** Keep trunk/external disabled unless a separate synthetic provider
can cover the complete required contract.

**Reason:** Partial mock behavior would encourage false carrier and emergency
claims.

## Separate administrative backup

**Decision:** Normal topology export is redacted; full backup is a CLI archive
with checksums, encrypted secret state, history, sounds, and last-good config,
but never the master key.

**Reason:** Sharing a topology and recovering a system have different
privileges and threat models.
