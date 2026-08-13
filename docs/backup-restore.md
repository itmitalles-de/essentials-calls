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
files contain only Asterisk 18 HA1 derivatives, not plaintext SIP passwords.

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
copied into their empty targets. A corrupt archive, wrong key, or non-empty
destination leaves the target untouched.

## Automated evidence

`npm run test:backup-restore` starts an isolated source stack, imports and
deploys a synthetic topology, executes synthetic calls, creates an archive,
checks its manifest, restores into separate empty volumes, and then repeats
registration, direct call, ring group, queue, schedule, IVR, CDR, and WebSocket
checks against the restored target.

This proves deterministic local recovery only. It does not prove off-site
retention, restore-time objectives, production storage durability, carrier
recovery, or recovery of a lost master key.
