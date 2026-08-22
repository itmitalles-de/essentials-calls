# API v1

The browser uses `/api` through nginx; the backend is also loopback-bound on
port 4000 in the local Compose stack. JSON is UTF-8. The API uses a local
session cookie and a session-bound CSRF token.

## Service contract (no authentication)

- `GET /health` and `GET /api/health`
- `GET /ready` and `GET /api/ready`
- `GET /api/service`

They expose only `Simple Calls`, product/API versions, capability IDs,
auth mode, health/readiness state, and the non-secret `sipClientEndpoint`
metadata (`host`, `port`, `transport`, and local scope) used by the authenticated
softphone guide. No topology, SIP username, password, master key, or other
credential is included. The corresponding capability ID is
`calls.softphones.guidance`.

## Authentication

- `GET /api/auth/session`: current user, CSRF token, and expiry; HTTP 401
  includes whether bootstrap is required.
- `POST /api/auth/login`: username/password; sets the HttpOnly session cookie
  and returns the CSRF token. HTTP 429 includes `Retry-After`.
- `POST /api/auth/logout` (`viewer`): invalidates the session.

All subsequent mutations require `X-CSRF-Token`. Authentication errors are
401, insufficient roles 403, and CSRF failures 403.

## Users and audit (admin)

- `GET /api/users`
- `POST /api/users` with `{ username, password, role }`
- `PATCH /api/users/:id` with role, disabled state, and/or a new password
- `GET /api/audit?limit=100`

No password hash is returned. HTTP 409 `user-safety` prevents self-disable or
loss of the final active admin.

## Topology and concurrency

`GET /api/topology` (`viewer`) returns:

```json
{
  "topology": {},
  "revision": 7,
  "activeRevision": 6,
  "lastGoodRevision": 6
}
```

It also sets `ETag: "rev-7"`. Extension objects contain only
`sipSecret.configured`, never `sipPassword`.

`PUT /api/topology` (`editor`) requires
`If-Match: "rev-7"`. It creates one immutable revision after shape,
semantic, and sound-inventory validation. A stale precondition gets HTTP 409:

```json
{
  "code": "revision-conflict",
  "expectedRevision": 7,
  "currentRevision": 8
}
```

`POST /api/topology/validate` (`editor`) validates without writing.

Validation rejects `110` and `112` as reserved emergency extension numbers and
rejects the disabled `trunk`/`external` node types. There is no API operation
that activates a carrier route or DID.

## Revision history

- `GET /api/topology/revisions?limit=50` (`viewer`)
- `GET /api/topology/revisions/:revision` (`viewer`)
- `POST /api/topology/revisions/:revision/rollback` (`admin`), with
  `If-Match`; rollback creates a new revision.

Revision metadata includes actor, timestamp, comment, source, readable summary,
and whether it is active.

## Import and export

`GET /api/topology/export` (`viewer`) downloads a schema-v2 redacted
document. This is not an administrative system backup.

- `POST /api/topology/import/dry-run` (`admin`)
- `POST /api/topology/import` (`admin`, requires `If-Match`)

The limit is 2 MiB. Raw/v1 topology can migrate once, including moving legacy
SIP passwords into encrypted storage. V2 plaintext secrets are rejected with
`plaintext-secret-rejected`. Validation, version, corruption, and size
failures create no partial revision.

## SIP-secret command

`POST /api/extensions/:nodeId/secret` (`admin`) requires `If-Match` and
`{ "secret": "…" }`. It writes AEAD ciphertext and creates a redacted
revision. The response never echoes the value.

## Sounds

- `GET /api/sounds` (`viewer`): WAV metadata plus every topology reference.
- `GET /api/sounds/:name` (`viewer`): WAV data.
- `PUT /api/sounds/:name` (`editor`): raw WAV, at most 5 MiB; PCM mono,
  16-bit, 8/16 kHz.
- `DELETE /api/sounds/:name` (`editor`): HTTP 409 `sound-in-use` with all
  references while still used.

A DELETE body may provide `replacement`. The replacement must already exist;
with references, `If-Match` is required. Reference replacement is a new
revision and file deletion occurs only after it succeeds.

## Deploy

`POST /api/deploy` is admin-only and requires `If-Match`. An empty object
deploys the current revision; an optional topology candidate is validated and
saved first.

Success means preflight, activation, targeted reload, and runtime checks all
passed:

```json
{
  "deployed": true,
  "configsWritten": true,
  "activated": true,
  "reloaded": true,
  "runtimeHealthy": true,
  "rolledBack": false,
  "revision": 8,
  "deploymentId": "…",
  "checksum": "…",
  "issues": []
}
```

A failure is HTTP 503 and reports stage flags plus redacted `error` and
`rollbackError`. `rolledBack: true` means the prior target was restored,
reloaded, and runtime-checked. A validation failure is HTTP 400 and performs no
activation.

## Status and WebSocket

`GET /api/status` (`viewer`) returns node states and:

```json
{
  "connection": {
    "state": "connected",
    "lastConnectedAt": "…",
    "lastEventAt": "…",
    "reconnectAttempt": 0
  }
}
```

`/ws/status` accepts only a valid session cookie and immediately sends a
`{ "type": "status", ... }` snapshot, followed by deduplicated updates.
Connection states are `connected`, `reconnecting`, and `degraded`.

## Common status codes

| Code | Meaning |
| --- | --- |
| 400 | malformed input or domain validation |
| 401 | no valid session |
| 403 | role or CSRF failure |
| 409 | revision conflict, protected sound, or user-safety rule |
| 413 | request/import/upload too large |
| 428 | required `If-Match` missing |
| 429 | login rate limit |
| 503 | deploy/runtime or readiness failure |
