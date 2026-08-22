# Backup and empty restore

Backup and restore are administrative CLI operations, deliberately separate
from the redacted topology download offered to ordinary viewers.

## Archive contents

`backup --output <archive.tar.gz>` creates a consistent SQLite online backup
and includes:

- users, password hashes, encrypted SIP credentials, sessions, audit events,
  immutable revisions, and deployment history from SQLite;
- custom WAV prompts;
- generated configuration versions plus `current` and `last-good` links;
- a versioned manifest with product/version, key IDs, file types, sizes, and
  SHA-256 checksums.

The archive explicitly records `masterKeyIncluded: false`. Generated PJSIP
files contain only Asterisk 22 digest HA1 derivatives, not plaintext SIP
passwords.

## Master key

The AES master key must never be placed unencrypted in the normal backup.
Protect and replicate it through a separate secret-management process. An
archive without the matching key restores non-secret state but cannot
authenticate and recover encrypted SIP credentials; the supplied restore fails
closed rather than producing a partially usable system.

## Restore contract

`restore --input <archive.tar.gz>` accepts only empty data, sound, and
generated-config targets. Before copying anything it:

1. rejects unsafe archive paths and escaping symlinks;
2. validates the product and format version;
3. compares the complete file list and SHA-256 checksums;
4. opens the SQLite copy with foreign keys and WAL support;
5. materializes the topology using the supplied master key;
6. invalidates restored sessions; and
7. records a restore audit event.

Only then are the database, sounds, generated versions, and known-good links
copied into their empty targets. Restored sessions are invalidated and custom
sound directories/files receive mode `0750`/`0640` with the configured Asterisk
reader group. Restore itself sets data/database mode `0700`/`0600` before it
returns; this is verified before any backend constructor can normalize modes as
a side effect. A corrupt archive, wrong key, invalid reader group, or non-empty
destination leaves the target untouched. A caught population failure removes
restore-owned entries and preserves a pre-existing empty target root and mode.

## Automated evidence

`npm run test:backup-restore` starts an isolated source stack, creates three
users/roles plus immutable/deployed revisions and a custom synthetic WAV,
executes synthetic calls, and checks archive contents, checksums, key exclusion,
encrypted credentials, audit, and file modes. Restore with unrelated key B must
fail before target population. Restore with A then proves session invalidation,
non-persistence of ephemeral AMI state, Asterisk startup, all semantic routes,
custom IVR playback and observed RTP.

The same rehearsal atomically rotates A to C, verifies every encrypted value,
creates a new backup, requires obsolete A to fail, restores with C into another
set of empty volumes, and repeats recovery/runtime assertions. Unit injection of
an interrupted rotation proves transaction rollback leaves an unambiguous
old-key-repairable state. A separate unit fault proves a handled target write
failure is cleaned up for retry. Audit contains restore/rotation facts but no
key value.
See [operations/MASTER_KEY_RECOVERY.md](operations/MASTER_KEY_RECOVERY.md).

This proves deterministic local recovery only. It does not prove off-site
retention, restore-time objectives, production storage durability, carrier
recovery, or recovery of a lost master key.
