# Compatibility identifiers

The canonical repository is `itmitalles-de/essentials-calls`, the product name
is **Essentials+ Calls**, and the default branch remains `master`.

The repository rename deliberately does not rewrite identifiers that can affect
installed dependencies, browser state, persistent data, backup archives, or
running local Compose environments. These internal identifiers remain supported
until a separately designed, backward-compatible migration exists:

| Identifier | Current value | Compatibility reason |
| --- | --- | --- |
| Root npm package | `visual-pbx` | Lockfile and workspace identity |
| npm workspace scope | `@visual-pbx/*` | Existing imports and package-lock entries |
| AMI/test labels | `visualpbx`, `visual-pbx-test` | Local configuration and diagnostic identity |
| Browser theme key | `visual-pbx:theme` | Preserve existing local preference |
| SQLite file | `essentials-calls.sqlite3` | Backup/restore and installed data compatibility |
| Compose data volume | `pbx-data` | Do not orphan existing local data |
| Generated/sound volumes | `asterisk-generated`, `asterisk-sounds` | Runtime and recovery compatibility |
| Default Compose project/image prefix | `visual-pbx` | Preserve ordinary local stack identity; build tags are explicit and versioned |
| Asterisk paths and generated names | Existing values | Deployed configuration and rollback compatibility |
| Default branch | `master` | Repository automation and history |

Acceptance scripts use isolated `essentials-calls-*` Compose project names.
They must never reuse ordinary application volumes or mutable image tags.

These names are implementation details, not an alternate repository or product
name. Public clone links, documentation, UI copy, issue references, badges, and
future release metadata must use `itmitalles-de/essentials-calls` and
**Essentials+ Calls**. A mechanical npm-scope, data-path, volume, or Asterisk
rename is outside the verified PoC stabilization scope.

Any future migration must be explicit, reversible, backup-tested, and capable
of reading pre-migration archives. It must not silently create empty replacement
volumes or abandon encrypted data.
