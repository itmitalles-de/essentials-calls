# Current State

## Product identity

- Customer-facing product: **Essentials+ Calls**
- Short UI name: **Calls**
- Technical slug and target repository name: **`calls`**
- Historical prototype name: **Visual PBX**
- Current GitHub repository remains `itmitalles-de/visual-pbx` until the
  repository setting is renamed to `itmitalles-de/calls`.
- Existing `@visual-pbx/*` npm package names remain temporary legacy identifiers
  and are intentionally not renamed in the product-strategy change.

## Project goal

Essentials+ Calls is the modular business-telephony component of Essentials+ for
small German businesses. It should translate business rules such as opening
hours, representation, no-answer, groups, and escalation into safe, testable
call routing without requiring PBX expertise.

The product starts as a managed service with an isolated runtime per
customer/site. It is not intended to become a carrier, a full unified
communications suite, or an early shared multi-tenant Asterisk platform.

The implemented proof of concept stores one topology, validates it in browser
and backend, generates Asterisk configuration, reloads Asterisk through AMI,
and shows live endpoint/queue status.

## Current status

- Default branch: `master`.
- Product strategy: `docs/product-strategy.md`.
- Authoritative execution plan: `docs/roadmap.md`.
- The implementation remains a functional proof of concept, not a production
  telephone system.
- Runtime verification in existing documentation was performed against Asterisk
  18 on 2026-08-06. Asterisk 18 has since reached end of support and must be
  replaced before a customer pilot.
- The primary UI and repository documentation now use Essentials+ Calls naming.
- The GitHub repository rename to `calls` is an external repository-setting
  action and is still outstanding.

## Working in the current PoC

- React/React Flow offers graph and advanced table views over one shared
  topology.
- The shared package performs structural and semantic validation in browser and
  backend; deploy is blocked on validation errors.
- The backend stores `topology.json`, generates PJSIP/dialplan/queue/voicemail
  files, and requests reloads over AMI.
- Browser recording/upload converts prompts to 8 kHz mono WAV; the backend
  validates uploads and stores them in the shared sounds volume.
- WebSocket status reflects periodic AMI polling and is not persisted.
- Docker Compose runs frontend/nginx, backend/Express, and Asterisk 18, with
  named volumes for topology data, generated config, and sounds.
- Existing documentation reports verified SIP registration, call-flow
  execution, prompt playback, voicemail, malformed-request handling, editor
  behavior, and 52 validator/generator/sound tests.

## Active direction

The next implementation sequence is intentionally operational rather than
feature-heavy:

1. upgrade to a supported Asterisk LTS baseline,
2. preserve and rerun real SIP/call-path tests,
3. add immutable revisions, atomic deploy, health checks, and rollback,
4. add authentication, roles, secret separation, and audit,
5. only then add a real provider profile, DID, and outbound calling.

No customer pilot is approved before the gates in `docs/roadmap.md` are met.

## Known issues

- No authentication or authorization protects the UI/API.
- SIP passwords are plaintext in `topology.json` and API responses.
- There is no trunk/DID or public telephone network integration.
- There are no opening hours, holidays, temporary exceptions, or external
  forwarding.
- One JSON file has no locking or history; concurrent saves overwrite each
  other.
- There is no deploy revision, audit trail, rollback, or proven restore.
- UI and SIP/RTP bind to all interfaces; this stack is for a trusted network,
  not direct internet exposure.
- Status polls AMI every three seconds rather than subscribing to events.
- A sound may be deleted while an IVR still references it.
- `trunk` and `external` exist only as reserved, disabled model types.
- Microphone recording requires localhost or HTTPS; plain LAN HTTP allows upload
  but browsers generally block microphone capture.
- `npm audit` previously reported one high and one moderate Vite/esbuild
  development-tooling advisory; dependency state must be rechecked when work
  resumes.

## Next recommended task

Implement the first coherent Phase 1 slice from `docs/roadmap.md`:

- move the runtime and tests to Asterisk 22 LTS,
- verify existing registration and call-flow behavior,
- add revision identifiers and atomic deployment with rollback.

Authentication and secret separation are the next parallel/high-priority slice.
Do not begin trunk work on the unauthenticated plaintext-secret PoC.

## Relevant files

- `docs/product-strategy.md` — product position, modules, target architecture,
  market entry, and hypotheses.
- `docs/roadmap.md` — ordered phases, gates, and authoritative backlog.
- `docs/architecture.md` — implemented component and data-flow architecture.
- `docs/asterisk-notes.md` — runtime-verified generator constraints.
- `shared/src/types.ts` and `shared/src/validator.ts` — model and invariants.
- `backend/src/api/routes/topology.ts` — validation/save/deploy API flow.
- `backend/src/asterisk/configGenerator.ts` and `deploy.ts` — generated config.
- `backend/src/model/store.ts` — single-file topology persistence.
- `frontend/src/App.tsx` and `frontend/src/views/` — editor flows.
- `docker-compose.yml` — services, ports, and volumes.

## Validation baseline

At the previous documentation handoff:

- `npm test`: passed, 52/52 tests.
- `npm run typecheck`: passed.
- `npm run build`: passed.
- `docker compose config --quiet`: passed.
- live Compose/Asterisk behavior was not rerun for that documentation-only
  change.

The Essentials+ Calls strategy/rebrand changes touch documentation and visible
product strings only. They do not establish a new runtime validation baseline.

## Last handoff

2026-08-13: Reframed the project as Essentials+ Calls, added the product
strategy and gated roadmap, changed primary UI/documentation branding, and
recorded the outstanding GitHub repository rename to `calls`. No telephony
runtime behavior was changed.
