# Asterisk 22 LTS runtime notes

These constraints were exercised in the disposable Asterisk container. A
configuration loading without an error is not sufficient evidence; the
acceptance suite also registers endpoints, places calls, observes AMI/CDR, and
checks post-reload behavior.

## Endpoint identity and re-registration

A PJSIP endpoint must be named after the SIP user. Merely placing
`username=101` in an auth section does not let an endpoint named
`ext_101` match a REGISTER. `remove_existing=yes` is also necessary with
`max_contacts=1`, otherwise a client restarting on a new source port is
rejected until the former contact expires.

`direct_media=no` keeps Asterisk on the synthetic audio path. This makes the
custom-WAV/RTP assertion deterministic and avoids mistaking endpoint-to-endpoint
media for runtime evidence; it does not prove real NAT traversal.

## No plaintext password in generated PJSIP

The pinned Asterisk 22 runtime uses `auth_type=digest` and a pre-computed
`password_digest`, so the deprecated `auth_type=md5`/`md5_cred` fields are not
generated. The realm must exactly match the realm used for HA1 calculation.

The current synthetic SIPp 3.6.1 client supports MD5 digest only, so the local
test contract explicitly emits `password_digest=MD5:<HA1>` and
`supported_algorithms_uas=MD5`. This is a test-client compatibility limit, not
an Asterisk 22 limitation: the bundled PJProject 2.17 runtime also supports
SHA-256 and SHA-512-256. Application users use scrypt, source SIP passwords
remain AES-256-GCM encrypted, and the full-stack suite confirms REGISTER and
INVITE authentication without plaintext generated credentials.

## IVR control flow

Asterisk does not implement shell `${VAR:-default}` semantics. Retry
arithmetic uses an initialized variable and a `0` prefix. Re-prompting jumps
to a label after initialization; returning to priority 1 would reset the count
and permit an endless invalid-input loop.

## Voicemail modules

The source image builds the file-backed voicemail module and explicitly keeps
ODBC/IMAP alternatives disabled, so `app_voicemail.so` handles stored messages.
Listing mailboxes alone does not prove message storage; the synthetic flow
exercises the application.

## Queue details

Asterisk removed queue strategy `roundrobin`; `rrmemory` is the compatible
replacement. `queues.conf timeout` is per-member ring time, while the fifth
`Queue()` argument is the caller's total wait limit. Queue reload must be
tested while its runtime exists, not inferred from a successful file parse.

## Sounds

The source image preserves the compatibility lookup
`/usr/share/asterisk/sounds/custom` to the shared local sounds directory. It
installs checksum-pinned English GSM core prompts and Opsound WAV music-on-hold
assets. Asterisk-compatible uploads are PCM, mono, 16-bit, and 8 or 16 kHz. The
backend validates this before an atomic file replacement, and deploy validation
checks that every IVR reference exists.

## Isolated preflight

The running Asterisk process cannot safely prove a candidate before it becomes
active. A private shared-volume handshake starts a second process with isolated
run/log/spool/database paths and candidate includes. It verifies both process
readiness and required objects, then removes the work tree. This is more than a
text syntax scan but still only validates the pinned container.

## Runtime canary and rollback

Reload commands may return successfully while the desired objects are absent.
Each deployment therefore carries a unique dialplan canary and an expected
endpoint count. A missing canary or endpoints makes the deploy fail and invokes
last-known-good rollback.

## Useful evidence

The full-stack suite inspects `pjsip show contacts`, dialplan canaries, queue
events, and AMI `Cdr` events. CDR and event paths are more useful than
startup logs for determining which application a synthetic call actually
reached.

## Non-Asterisk editor note

React Flow needs stable measured node objects. The graph keeps React Flow state
and merges topology changes rather than rebuilding nodes on each render;
otherwise edges can disappear without an exception. Selection and viewport
changes stay outside topology history.
