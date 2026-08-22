# Domain model

The canonical definitions live in `shared/src/types.ts`; shape and semantic
rules live in `shared/src/validator.ts`.

## Versioned topology

```ts
interface Topology {
  id: string;
  name: string;
  description?: string;
  nodes: PbxNode[];
  edges: Edge[];
  memberships: Membership[];
}
```

The topology is design state. Positions belong to the editor; properties belong
to call behavior; memberships represent group relationships. Runtime status is
a separate ephemeral model.

The current export envelope is schema v2:

```json
{
  "schemaVersion": 2,
  "product": "Essentials+ Calls",
  "exportedAt": "…",
  "redacted": true,
  "topology": {}
}
```

Raw legacy topology and schema-v1 envelopes migrate to v2. Import is limited to
2 MiB, first runs as a dry-run, and creates exactly one revision transaction on
success. Schema-v2 plaintext SIP passwords are rejected. Failed, corrupt,
oversized, or incompatible imports do not partially change state.

## Node types

### Extension

`number`, `sipUser`, optional caller ID and voicemail settings. `110` and `112`
are reserved emergency numbers and are rejected even in the synthetic runtime;
the product makes no emergency-reachability claim. The legacy
`sipPassword` field is write-only during v1 migration/materialization.
Clients receive `sipSecret: { configured: boolean }`.

### IVR

`greeting`, input `timeout`, and `invalidRetries`. Digit, timeout, and
invalid destinations are edges. Greeting references must be safe and present
in the server inventory at save/deploy time.

### Ring group

`strategy` and `ringTimeout`. `ringall` is a parallel Asterisk `Dial`.
Other advertised ring-group strategies are explicit ordered approximations;
they are not Asterisk queue strategies and carry no cross-call memory.

### Queue

`strategy`, per-member `timeout`, total `maxWaitTime`, `joinEmpty`, and
`leaveWhenEmpty`. Queue members use membership role `agent`. Supported
Asterisk strategies include `ringall`, `rrmemory`, `leastrecent`,
`fewestcalls`, and `random`; legacy `roundrobin` maps to `rrmemory`.

### Schedule

```ts
{
  timezone: string;               // IANA, e.g. Europe/Berlin
  windows: Array<{
    id: string;
    weekdays: (1|2|3|4|5|6|7)[]; // Monday through Sunday
    start: string;                // HH:MM inclusive
    end: string;                  // HH:MM exclusive, may cross midnight
  }>;
  holidays: string[];             // explicit YYYY-MM-DD closed dates
}
```

Exactly one `open` and one `closed` edge are required. Multiple windows are
allowed but may not overlap after midnight expansion. The deterministic shared
evaluator mirrors generated `GotoIfTime` behavior and is tested across
Europe/Berlin CET/CEST, weekends, explicit holidays, and midnight boundaries.

### Voicemail

An explicit mailbox with PIN/email/attachment settings. An extension may also
carry embedded voicemail settings. Voicemail is terminal.

`trunk` and `external` remain reserved, disabled types. They are not partial
implementations, and there is no implicit outside line or fallback route. Any
future pilot adapter requires a positive allowlist of the single approved test
destination; a blacklist alone is insufficient.

## Edges and memberships

Edge conditions are `digit`, `timeout`, `invalid`, `open`, `closed`,
or `unconditional`. Digit/invalid apply only to IVR; open/closed only to
Schedule. Schedule has exactly two outputs. Extension, ring group, and queue
have at most one fallback. Self-links, missing targets, ambiguous conditions,
and unsupported type transitions are rejected.

Memberships point from a ring group or queue to an extension, carry
`member`/`agent`, ordering, and optional paused state. Duplicate
memberships and empty groups are rejected.

## Server-authoritative validation

Shape validation runs before any field is dereferenced and enforces collection
and complexity limits. Semantic validation covers:

- duplicate IDs, extension numbers, SIP users, generated names, and mailboxes;
- safe numeric extensions, SIP users, prompt names, timeouts, strategies, and
  queue policies;
- present sound references and required IVR/schedule exits;
- valid memberships and transitions;
- every simple cycle having a timeout/invalid exit; and
- a 5,000-cycle exploration cap to prevent pathological request cost.

Warnings (for example a missing SIP credential or generated test-number
collision) do not block. Errors block save/deploy. The browser shares these
rules for feedback; only backend validation is authoritative.

## Revisions

The state row names:

- `current_revision`: latest editable topology;
- `active_revision`: topology currently verified active in Asterisk; and
- `last_good_revision`: rollback source after a failed activation.

Revision rows are immutable and redacted. Each includes actor, timestamp,
comment, source, and a node/edge/membership summary. `If-Match` prevents
last-write-wins. Rollback is a new revision rather than mutation of history.
The default retention is 100 revisions while protected state pointers remain.

Saving is not a frontend undo boundary. It marks the saved revision as the
dirty-state baseline while preserving valid undo/redo entries. Loading,
importing, rollback, and browser restart begin a new local history root from the
persisted revision.

## Runtime status

```ts
interface NodeStatus {
  nodeId: string;
  availability: 'online' | 'offline' | 'unknown';
  activity: 'idle' | 'ringing' | 'in_call' | 'busy';
  metrics?: { waitingCalls?: number; activeCalls?: number; talkTime?: number };
  callerId?: string;
  queuePosition?: number;
}
```

Status is reconstructed from AMI snapshots/events and is never persisted as
call-flow configuration.
