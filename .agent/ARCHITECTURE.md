# Architecture

This is a navigation index. Do not duplicate the substantial existing project
documentation here.

## Authoritative documents

- [`../docs/architecture.md`](../docs/architecture.md): components, shared
  package build detail, deploy data flow, persistence, status, and frontend map.
- [`../docs/domain-model.md`](../docs/domain-model.md): topology types and every
  validation rule.
- [`../docs/asterisk-mapping.md`](../docs/asterisk-mapping.md): generated files,
  naming, node-to-dialplan mapping, test entry points, and reload behavior.
- [`../docs/asterisk-notes.md`](../docs/asterisk-notes.md): verified Asterisk and
  React Flow pitfalls that clean config loading does not expose.
- [`../docs/api.md`](../docs/api.md): REST and WebSocket contract.
- [`../docs/operations.md`](../docs/operations.md): ports, deployment, security,
  backup, runtime checks, and troubleshooting.
- [`../docs/roadmap.md`](../docs/roadmap.md): verified scope and limitations.

## Runtime map

```text
React/React Flow + nginx :8080
        | REST and WebSocket
        v
Express backend :4000 (host loopback only)
        | writes shared volumes       | AMI :5038 (host loopback only)
        v                             v
topology/config/sound volumes <---- Asterisk 18 :5060 + RTP
```

Compose exposes the frontend plus SIP/RTP for trusted-network use. Backend and
AMI are loopback-bound on the host and communicate inside the Compose network.
There is no authentication boundary in the application.

## Source boundaries

| Area | Responsibility |
| --- | --- |
| `shared/` | Topology types, shape validation, semantic rules, fixtures |
| `backend/src/api/` | REST/WebSocket boundary and untrusted-input handling |
| `backend/src/model/` | `topology.json` persistence |
| `backend/src/asterisk/` | config generation, AMI reload/status, sounds |
| `frontend/src/views/` | graph and advanced editors |
| `frontend/src/components/` | nodes, inspector, prompt picker |
| `asterisk/` | Asterisk image, base templates, runtime entrypoint |
| `docker-compose.yml` | services, ports, and named volumes |

The frontend resolves the shared TypeScript source through a Vite alias; the
backend builds against the compiled shared workspace. See the explanation in
`docs/architecture.md` and `frontend/vite.config.ts` before changing this.

## Persistence and deploy flow

`pbx-data/topology.json` is the call-flow source of truth. Prompt WAVs live in
`asterisk-sounds`. The four files in `asterisk-generated` are derived. Deploy:

1. Prove request shape.
2. Apply shared semantic validation and stop on errors.
3. Save the topology when supplied.
4. Generate PJSIP, extensions, queues, and voicemail config.
5. Ask Asterisk to reload through AMI and report reload failure separately.

Runtime status is polled from AMI and pushed over WebSocket; it is not persisted.

## Testing boundaries

`npm test` covers the validator, config generator, and prompt validation.
`npm run typecheck` and `npm run build` cover all workspaces. CI also builds the
Compose images. Telephony behavior still requires the focused SIP, Asterisk CLI,
and CDR checks in `docs/operations.md`; successful generation is insufficient.

## Important constraints

- This is a trusted-network, single-editor PoC with plaintext SIP credentials.
- The topology has no locking, history, or multi-user conflict handling.
- Static Asterisk config must not be overwritten by generated files.
- Preserve the runtime-tested invariants in `docs/asterisk-notes.md`.
- `trunk` and `external` are reserved model types, not implemented call paths.
