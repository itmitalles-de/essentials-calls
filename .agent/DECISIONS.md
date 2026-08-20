# Decisions

## Repository rename with compatibility boundaries

**Decision:** The canonical repository is `itmitalles-de/essentials-calls` and
the product is Essentials+ Calls. Historical npm/package, persistent path,
volume, browser-storage, AMI/test, and Asterisk identifiers remain compatible;
the default branch stays `master`.

**Reason:** Public identity must match the repository rename without risking an
unrelated workspace/data migration or orphaning installed state. The exact
boundary is documented in `docs/COMPATIBILITY_IDENTIFIERS.md`.

## Save is not an undo boundary

**Decision:** Saving creates an immutable server revision and updates the local
dirty-state baseline, but does not clear the editor's undo/redo stacks.

**Reason:** Save persists current work; it is not a new editing session. Common
editor semantics allow undoing the last domain change after save. Undo can make
the editor dirty relative to the saved revision and redo can restore it.

**Consequence:** Loading, import, rollback, and browser restart establish a new
history root. Unit and eight-case Playwright coverage exercise node creation,
multiple pre/post-save changes, undo/redo, graph/table switching, reload,
revision, rollback, and a fresh browser-context persisted state.

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

## AEAD source secrets and Asterisk 22 digest derivatives

**Decision:** Encrypt SIP passwords with AES-256-GCM in SQLite and materialize
them only transiently. Generate Asterisk 22 `auth_type=digest` with a
pre-computed `password_digest` for the fixed `asterisk` realm instead of
plaintext config. Keep the algorithm at MD5 only for the pinned synthetic SIPp
3.6.1 client and declare it explicitly with `supported_algorithms_uas=MD5`.

**Reason:** This uses the non-deprecated Asterisk 22 configuration form and
meets the no-plaintext persistent-storage boundary. SIPp 3.6.1 predates
SHA-256 digest support; Asterisk 22 with bundled PJProject 2.17 supports
SHA-256 and SHA-512-256, so MD5 is not a runtime limitation.

**Consequence:** Keys are supplied separately and backed up separately. Strong
SIP passwords remain mandatory because HA1 can be guessed offline. Moving the
synthetic client and generated digest contract to SHA-256 is a separate
hardening change that requires full registration/call requalification.

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

## Emergency and pilot routing fail closed

**Decision:** Reject `110` and `112` as extension numbers, keep
`trunk`/`external` disabled, and generate no outside line or fallback. Any
future isolated pilot must use a positive allowlist containing only the approved
ordinary test destination; a blacklist alone is not sufficient.

**Reason:** “Not supported” must be a technical boundary, not merely a warning.
The current repository has no authority or evidence for emergency or carrier
routing.

## Separate administrative backup

**Decision:** Normal topology export is redacted; full backup is a CLI archive
with checksums, encrypted secret state, history, sounds, and last-good config,
but never the master key.

**Reason:** Sharing a topology and recovering a system have different
privileges and threat models.

## Master-key recovery is an A/B/C fail-closed rehearsal

**Decision:** Recovery acceptance must reject unrelated key B, restore an A
archive only with A, atomically rotate all credentials to C, reject old A for a
C archive, and restore C only with C. The key is never in the archive or audit.

**Reason:** A green file-copy test does not prove encrypted-state recovery.
Transactional interruption injection must leave every row consistently
repairable with the former key rather than commit a mixed-key state.

## Empty-target restore validates first and rolls back handled write failures

**Decision:** Verify archive integrity, credential decryption, session
invalidation, and requested sound ownership in staging before target writes.
Set data/database permissions in the restore operation itself. If ordinary
target population then fails, remove only restore-owned entries and preserve a
pre-existing empty target root and its original mode.

**Reason:** Backend startup must not mask an incorrectly restored mode, and a
reported restore failure must not leave an installation that violates the
empty-target retry contract. This is fail-clean handling for caught filesystem
errors, not a claim of crash-atomic multi-volume storage.

## Asterisk 22 LTS supersedes the Asterisk 18 pin

**Decision:** The user's later explicit authorization supersedes the original
Asterisk-18 boundary. Build exact Asterisk 22.10.1 from checksum-verified source
with bundled PJProject 2.17 and Jansson 2.15.0, `BUILD_NATIVE` disabled,
checksum-pinned core/MOH assets, fixed compatibility GID 101, and the existing
FHS/data paths.

**Reason:** Asterisk 18 is upstream-EOL. Asterisk 22 is the current LTS branch;
pinning an exact stable release removes the former EOL conflict without using a
mutable distribution Asterisk package.

**Consequence:** Every runtime evidence class must be rerun on the new image.
LTS support removes only the old runtime-EOL blocker and does not establish
carrier, DID, NAT/audio, emergency, legal, operational, or production
acceptance. No further major upgrade is authorized.
