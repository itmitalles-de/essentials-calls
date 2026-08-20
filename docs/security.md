# Security model

## Boundary

Essentials+ Calls is a single-tenant local application. The application
protects its HTTP/API boundary, persistent topology data, SIP credentials, and
administrative actions. The supplied Compose stack binds published ports to
loopback by default and is not a public deployment template.

The implementation does not replace TLS termination, host hardening, firewall
policy, customer NAT design, carrier controls, or operational monitoring.

## Authentication and sessions

- There are no default users or passwords.
- The first admin is created once with the `bootstrap-admin` CLI and
  `--password-stdin`; bootstrap refuses to run after any user exists.
- Passwords are hashed with scrypt (`N=32768, r=8, p=1`) and a random
  16-byte salt.
- Login failures are rate-limited per source/username key and audited without
  password material.
- Opaque 256-bit session tokens are stored only as SHA-256 hashes.
- Sessions expire after eight hours; logout deletes the server-side session.
- Cookies are `HttpOnly`, `SameSite=Strict`, path-scoped, and use `Secure`
  when configured. Production startup rejects
  `PBX_SECURE_COOKIES=false`.
- Every mutating authenticated API request requires its session-bound CSRF
  token.

## Authorization

Every API route enforces its role server-side:

| Role | Rights |
| --- | --- |
| `viewer` | Read topology/revisions/sounds/status and redacted export |
| `editor` | Viewer rights plus edit/save, validation, sound upload/delete |
| `admin` | Editor rights plus deploy, SIP-secret changes, import, rollback, users/roles, audit, CLI backup/restore |

The UI hides unavailable controls but is not the authorization boundary. The
last active administrator cannot be downgraded or disabled, and an admin cannot
disable their own active session.

## SIP credentials

- The master key is exactly 32 bytes and comes only from
  `PBX_MASTER_KEY_FILE` or `PBX_MASTER_KEY`.
- Missing or malformed key material causes backend startup to fail closed.
- SQLite stores each SIP password with AES-256-GCM, a random 96-bit IV, an
  authentication tag, key ID, and the extension ID as additional authenticated
  data.
- Ciphertext tampering and a wrong key are detected before materialization.
- Revisions, audit events, normal errors, `GET /api/topology`, and topology
  exports never contain plaintext SIP passwords.
- A masked save preserves the existing encrypted value. Only the admin-only
  explicit secret endpoint changes it.
- Legacy v1 import may migrate plaintext once into AEAD storage. Schema v2
  rejects plaintext credentials, including in dry-run.
- The one required byte-identical pre-SQLite migration copy is the sole legacy
  plaintext exception. It is mode `0600`, excluded from normal exports and
  backups, and the original `topology.json` is removed only after commit.
- Asterisk 22 receives an MD5 HA1 digest for the fixed local realm
  (`username:asterisk:password`) through `auth_type=digest` and
  `password_digest`; generated files do not contain the plaintext SIP
  password. MD5 is retained only for the pinned synthetic SIPp 3.6.1 client,
  not as a replacement for strong source passwords or encrypted database
  storage.

## Master-key lifecycle

Keep the key in a secret manager or root-readable secret file and back it up
separately from the ordinary application archive. Without it, encrypted SIP
credentials cannot be recovered.

Rotation is an explicit offline administrative operation:

1. create and separately protect a new 32-byte key;
2. stop normal writes;
3. run `rotate-master-key` with the current key plus
   `PBX_NEW_MASTER_KEY_FILE` or `PBX_NEW_MASTER_KEY`;
4. atomically update the runtime secret source;
5. restart and verify materialization and a synthetic registration;
6. retain the old key only according to the approved backup-retention policy.

Rotation decrypts and re-encrypts all SIP values in one SQLite transaction and
audits only the count and non-secret key ID.

The automated A/B/C rehearsal proves that an unrelated or obsolete key fails
closed, a matching key restores every encrypted value, rotation is atomic, and
an injected interruption leaves a consistent old-key-repairable database. See
[operations/MASTER_KEY_RECOVERY.md](operations/MASTER_KEY_RECOVERY.md).

## HTTP and logging

Helmet protects API responses. nginx adds CSP, frame denial, no-sniff,
no-referrer, and a restrictive permissions policy to the application. HSTS is
enabled by the backend in production; HTTPS termination remains an external
deployment responsibility.

Audit detail redacts keys matching password, secret, token, ciphertext,
authorization, or cookie. Request errors are generic at the 500 boundary.
Synthetic failure artifacts redact credential-like fields and are created only
on failed acceptance runs. CI uploads only those redacted paths for three days;
the normal backup archive and master key are never CI artifacts. A tracked-file
high-confidence secret scan complements review but is not a substitute for a
managed secret scanner or incident response.

## Emergency and external-routing boundary

The application rejects extension numbers `110` and `112`, rejects disabled
`trunk`/`external` nodes, generates no carrier context, and has no automatic
outside line or fallback. This is a fail-closed absence of support, not an
emergency-service implementation. A future isolated test-DID adapter must use a
positive destination allowlist; a blacklist cannot be its sole control.

## Known security limits

- This is not penetration-tested production software.
- SIP and RTP transport in the test stack are not TLS/SRTP.
- The local MD5 HA1 derivative used by the SIPp 3.6 compatibility contract is
  susceptible to offline guessing if weak SIP passwords are chosen. Moving the
  synthetic client and configuration to SHA-256 remains a hardening item.
- Voicemail policy, customer firewall/NAT, abuse prevention, emergency calls,
  carrier fraud controls, and public exposure are outside the local proof.
- Asterisk 22 LTS is upstream-supported, but that removes only the former
  runtime-EOL blocker. It does not establish carrier, network, security, legal,
  operational, or production acceptance.
- Repository Dependabot/vulnerability alerts and enforced SHA-pinning policy
  are not enabled, and no container CVE scanner is configured. CI pins its own
  action uses and base images and emits npm plus pinned Asterisk-source SBOMs,
  but repository settings and image-vulnerability governance remain external
  pilot gates.
