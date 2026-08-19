# Master-key recovery and rotation

## Recovery property

SIP credentials are AES-256-GCM ciphertext in SQLite. A normal backup contains
that ciphertext and its key identifiers but never the master key. The archive
and matching 32-byte key must therefore be protected, replicated, access
controlled, and tested as separate recovery assets. Losing the key means the
SIP credentials are not recoverable from the archive.

Backend startup, restore, and credential materialisation fail closed for a
missing, malformed, wrong, or tampered key. Do not “recover” by deleting secret
rows or silently issuing replacement credentials.

## Synthetic A/B/C rehearsal

`npm run test:backup-restore` is the authoritative disposable rehearsal. It
uses generated non-production values and fresh Compose projects/volumes:

1. create source key A and save encrypted SIP credentials;
2. create a checksummed backup whose manifest states
   `masterKeyIncluded: false`;
3. attempt restore with unrelated key B and require failure before target
   population;
4. restore into an empty target with A;
5. prove all encrypted values materialise, sessions are invalidated, roles,
   revisions, active/last-good deployment, sounds, audit, and file modes remain;
6. start Asterisk and prove the restored custom IVR WAV emits RTP through the
   synthetic callflow;
7. atomically rotate every credential from A to key C;
8. prove every value can be read with C and the audit contains the rotation
   count/key ID but no key material;
9. back up the rotated state and require restore with old key A to fail closed;
10. restore into another empty target with C and repeat state plus callflow
    verification.

The unit suite additionally injects an interruption during rotation. Because
re-encryption and the rotation audit use one SQLite transaction, the partial
write rolls back: all rows remain consistently readable with A, no mixed key
set is committed, and a later retry is unambiguous.

## Operator procedure

Before recovery or rotation:

- stop application writes and identify the exact archive/key pair by protected
  inventory metadata, never by printing key contents;
- verify the target data, sounds, and generated-config directories are empty;
- verify archive ownership, expected product/version, checksums, and an
  out-of-band approval record;
- mount the key as a root-readable secret file when possible; and
- capture no shell trace, environment dump, database copy, or diagnostic bundle
  containing secret material.

For restore, run the built `restore --input <archive>` CLI with `DATA_DIR`,
`SOUNDS_DIR`, `CONFIG_OUT_DIR`, `SOUNDS_READER_GID`, and exactly one approved
master-key source. The CLI validates the complete archive before populating the
empty target, materialises credentials, invalidates all copied sessions, sets
data/database/sound permissions, and records `backup.restore`.

For rotation, keep normal writes stopped, provide the old key through
`PBX_MASTER_KEY_FILE` and new key C through `PBX_NEW_MASTER_KEY_FILE`, run the
built `rotate-master-key` CLI once, then atomically update the runtime secret
reference. Restart and verify all credentials plus one synthetic registration
before creating a new C backup. Keep A only under the approved retention policy
for old A archives; A cannot decrypt newly rotated C data.

After either operation, use `verify-recovery` before normal startup and run the
post-restore synthetic acceptance. Never infer recovery from a successful file
copy alone.

## Audit and diagnostics

Allowed audit facts are actor, action, time, affected credential count, and
non-secret key ID. Raw A/B/C values, SIP passwords, ciphertext material, cookie
or session tokens, and environment dumps are prohibited. Acceptance failure
artifacts are redacted, short-lived, and must be reviewed before external
sharing.

## Limits

This rehearsal proves application-level recovery in disposable local containers.
It does not prove an external secret manager, off-site custody, production RTO/
RPO, hardware compromise recovery, carrier credential rotation, or an operator
runbook under incident conditions. Those remain pilot/production gates.
