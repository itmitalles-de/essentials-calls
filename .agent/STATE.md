# Current State

## Project goal

Visual PBX is a visual editor for internal Asterisk call flows. It stores one
topology, validates it in both browser and backend, generates Asterisk config,
reloads Asterisk through AMI, and shows live endpoint/queue status.

## Current status

- Default branch: `master`.
- Implementation baseline inspected: `039d5e4` (the documentation-only commit
  immediately before this persistent handoff migration).
- The checkout was clean and matched `origin/master` after a fresh fetch.
- The repository is explicitly a functional proof of concept, not a production
  PBX product.
- `docs/roadmap.md` records runtime verification against Asterisk 18 dated
  2026-08-06. That runtime environment was not independently rechecked during
  this documentation migration.
- GitHub had no open issues or pull requests at the handoff.

## Working

- React/React Flow offers graph and advanced table views over one shared topology.
- The shared package performs structural and semantic validation in browser and
  backend; deploy is blocked on validation errors.
- The backend stores `topology.json`, generates PJSIP/dialplan/queue/voicemail
  files, and requests reloads over AMI.
- Browser recording/upload converts prompts to 8 kHz mono WAV; the backend
  validates uploads and stores them in the shared sounds volume.
- WebSocket status reflects periodic AMI polling and is not persisted.
- Docker Compose runs frontend/nginx, backend/Express, and Asterisk 18, with
  named volumes for topology data, generated config, and sounds.
- Existing documentation reports verified SIP registration, call-flow execution,
  prompt playback, voicemail, malformed-request handling, editor behavior, and
  52 validator/generator/sound tests.

## Active work

No active repository-specific workstream is recorded. The old root handoff also
contained no active goal. Select work from a user request or `docs/roadmap.md`.

## Recently completed

- `04631fa` translated the root README to English.
- `7a613bc` added the detailed architecture, domain, API, operations, pitfalls,
  and roadmap documentation set.
- `2c43720` added prompt recording/upload and themed dark mode.
- `039d5e4` added a generic root handoff, now migrated into `.agent/`.

## Known issues

- No authentication or authorization protects the UI/API.
- SIP passwords are plaintext in `topology.json` and API responses.
- There is no trunk/DID or public telephone network integration; only internal
  extensions and generated test numbers are implemented.
- One JSON file has no locking or history; concurrent saves overwrite each other.
- UI and SIP/RTP bind to all interfaces; this stack is for a trusted network,
  not direct internet exposure.
- Status polls AMI every three seconds rather than subscribing to events.
- A sound may be deleted while an IVR still references it; deploy validation does
  not currently include the sound inventory.
- `trunk` and `external` exist only as reserved, disabled model types.
- Microphone recording requires localhost or HTTPS; plain LAN HTTP allows upload
  but browsers generally block microphone capture.
- `npm audit` reports one high and one moderate development-tooling advisory in
  Vite/esbuild. Its suggested fix upgrades Vite across a major-version boundary;
  no dependency change was made during this documentation migration.

## Next recommended tasks

`docs/roadmap.md` is authoritative. Its highest-value small candidate is to
validate IVR sound references before deploy. Authentication and safer SIP-secret
handling are the first medium-sized prerequisites for use beyond a trusted PoC.
No item is currently selected as active.

## Relevant files

- `docs/architecture.md` — implemented component and data-flow architecture.
- `docs/roadmap.md` — verified status, limitations, decisions, and candidate work.
- `docs/asterisk-notes.md` — runtime-verified generator constraints.
- `shared/src/types.ts` and `shared/src/validator.ts` — model and invariants.
- `backend/src/api/routes/topology.ts` — validation/save/deploy API flow.
- `backend/src/asterisk/configGenerator.ts` and `deploy.ts` — generated config.
- `backend/src/model/store.ts` — single-file topology persistence.
- `frontend/src/App.tsx` and `frontend/src/views/` — editor flows.
- `docker-compose.yml` — services, ports, and volumes.

## Validation

- `npm test`: passed, 52/52 tests.
- `npm run typecheck`: passed.
- `npm run build`: passed, including the Vite production bundle.
- `docker compose config --quiet`: passed.
- `npm audit`: reported one high and one moderate Vite/esbuild advisory.

These commands ran with Node 24.10.0; CI declares Node 20. Compose images and a
live Asterisk call flow were not rebuilt or rerun for this documentation-only
change.

## Last handoff

2026-08-13: Replaced the generic root `TODO.md` with the persistent `.agent/`
workflow. No real task was removed; the established roadmap remains canonical.
