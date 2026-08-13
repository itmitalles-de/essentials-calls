# Asterisk 18 mapping

Source: `backend/src/asterisk/configGenerator.ts` and
`backend/src/asterisk/deploy.ts`.

## Generated files

Each immutable deployment version contains:

| File | Content |
| --- | --- |
| `pjsip_generated.conf` | AOR/auth/endpoint per extension |
| `extensions_generated.conf` | internal numbers, synthetic entrypoints, call-flow/IVR/schedule contexts, runtime canary |
| `queues_generated.conf` | native Asterisk queues and members |
| `voicemail_generated.conf` | mailboxes in the static `default` context |
| `manifest.json` | deployment ID, SHA-256 aggregate, and file map |

Static transport/module/logger/CDR settings remain in the Asterisk image.
Generated text must carry the Essentials+ Calls header, stay under 4 MiB, avoid
control characters and include/exec directives, and include required contexts.

## Names and PJSIP authentication

Endpoint, AOR, and auth names derive from the sanitized SIP user because
Asterisk identifies inbound registrations by endpoint name. Call-flow targets
are `node_<sanitized-node-id>`; IVR contexts are
`ivr_<sanitized-node-id>`; queue names derive from node IDs.

The encrypted password is materialized only in backend memory. Asterisk 18 does
not support the later `password_digest` option, so the generator writes:

```ini
[101]
type=auth
auth_type=md5
realm=asterisk
username=101
md5_cred=<MD5 of 101:asterisk:password>
```

This preserves Asterisk 18 compatibility and removes plaintext from generated
storage. Strong random SIP passwords and restrictive file permissions remain
necessary because HA1 permits offline guessing.

## Dialplan mapping

- **Extension:** `Dial(PJSIP/<endpoint>,20)`, then its fallback or embedded
  voicemail, then hangup.
- **IVR:** `Background`, `WaitExten`, digit extensions, timeout, bounded
  invalid retries, and explicit destinations.
- **Ring group:** `ringall` produces one parallel `Dial(A&B,…)`; other
  ring-group strategies produce an ordered series and are clearly
  approximations.
- **Queue:** native `Queue(<id>,,,,<maxWaitTime>)`; per-agent timeout,
  strategy, empty policy, and members live in `queues_generated.conf`.
- **Schedule:** explicit holiday comparisons route closed first; each window
  becomes timezone-aware `GotoIfTime` clauses. Midnight windows split across
  the source and following weekday.
- **Voicemail:** `VoiceMail(<mailbox>@default,u)`, then hangup.

Every node also receives a synthetic entrypoint starting at 600. These are
local test aids, not DIDs. The validator warns if an internal extension shadows
one.

## Staging, preflight, and activation

Generation writes mode-0640 files into
`versions/.staging-<deployment-id>`, then renames the complete directory.
The Asterisk container's private filesystem worker copies static config into a
disposable tree, starts a separate Asterisk 18 process, loads the candidate,
and checks dialplan/PJSIP readiness. No Docker socket or public validation
endpoint is used.

After preflight, the backend atomically swaps `current`, invokes targeted AMI
reloads, and verifies:

- `core show version` returns Asterisk;
- the internal dialplan is active;
- the unique deployment canary is visible; and
- at least the expected number of PJSIP endpoints exists.

Only then does it atomically update `last-good` and the active revision.
Failure after activation restores the former symlink, reloads it, checks its
runtime, and records `failed-rolled-back` or a rollback error.

## Queue versus ring group

A ring group is a simple distribution attempt without queue state. Only its
`ringall` behavior is truly parallel; the other values are ordered
approximations.

A queue uses `app_queue`, emits caller/member events, has per-agent and total
timeouts, empty policies, and persistent in-memory queue behavior across
configuration reloads. Legacy `roundrobin` maps to Asterisk's `rrmemory`.

No reporting warehouse, SLA analytics, or carrier call distribution is
implemented.

## Runtime evidence boundary

The acceptance stack proves these configurations load and execute on the
pinned Ubuntu 22.04 Asterisk 18 package using SIPp, AMI, and CDR events. It says
nothing about a real provider, public number, emergency call, customer
firewall/NAT, handset, or real-network audio quality.
