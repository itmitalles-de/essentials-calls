# Repository Agent Guide

**Essentials+ Calls** is the modular business-telephony product being developed
from the former Visual PBX proof of concept. The customer-facing product name is
Essentials+ Calls, the short name is Calls, and the technical/repository slug is
`calls`.

Treat the repository as persistent project memory and the current chat or agent
session as temporary working memory. Never confuse the target product strategy
with features already implemented in the proof of concept.

## Startup

1. Inspect `git status` and preserve existing worktree changes.
2. Read `.agent/STATE.md`.
3. Read `.agent/TODO.md` when continuing existing work.
4. Read `.agent/DECISIONS.md` and `.agent/ARCHITECTURE.md` when relevant.
5. Read `docs/product-strategy.md` before changing product scope or positioning.
6. Inspect the specific implementation area required by the task.
7. Check recent relevant commits when continuation context is needed.

`docs/roadmap.md` is the authoritative execution status and backlog.
`docs/product-strategy.md` is authoritative for product positioning, module
boundaries, target customers, pilot gates, and explicit non-goals.
`.agent/TODO.md` records only the selected continuation task and must not become
a duplicate backlog. A user-specified task takes precedence unless it would
silently violate a safety or production-readiness boundary.

## Naming rules

- Use **Essentials+ Calls** in customer-facing and product-strategy contexts.
- Use **Calls** where the surrounding Essentials+ context is already clear.
- Use **`calls`** for new repository, service, URL, and deployment slugs.
- Use **Visual PBX** only when referring to the historical prototype or a legacy
  implementation identifier that has not yet been migrated.
- Do not mix product rebranding with risky data, volume, or package migrations.
  Existing `@visual-pbx/*` package names remain legacy identifiers until a
  dedicated mechanical migration updates imports and the lockfile together.

## Documentation map

- `README.md`: concise product identity, current PoC status, startup, commands.
- `docs/README.md`: documentation index and implemented-versus-target boundary.
- `docs/product-strategy.md`: positioning, module model, pilot scope, target
  architecture, go-to-market, and product hypotheses.
- `docs/roadmap.md`: verified behavior, limitations, ordered phases, gates, and
  candidate work.
- `docs/architecture.md`: authoritative implemented component and data flow.
- `docs/domain-model.md`: current topology types and validation rules.
- `docs/asterisk-mapping.md`: generated configuration and dialplan mapping.
- `docs/asterisk-notes.md`: runtime-verified Asterisk and React Flow pitfalls.
- `docs/api.md`: current REST and WebSocket contract.
- `docs/operations.md`: current ports, security, backup, testing, and
  troubleshooting.

Anyone changing Asterisk generation must read the relevant mapping and pitfalls
sections first. A configuration that loads without errors is not proof that a
call flow works.

## Implementation map

- `shared/`: topology model, structural/rule validation, and shared fixtures.
- `backend/`: Express API, topology store, config generation, AMI, and sounds.
- `frontend/`: React/React Flow editor, API client, audio conversion, and theme.
- `asterisk/`: Asterisk image, entrypoint, and static config templates.
- `docker-compose.yml`: runtime topology, ports, and persistent volumes.
- `scripts/sip-register-test.py`: real SIP REGISTER diagnostic.

The frontend imports `shared/src` through a Vite alias; the backend consumes the
compiled workspace package. Preserve this intentional build boundary.

## Product and architecture boundaries

- Calls is not a carrier, a full unified-communications suite, or an enterprise
  contact center.
- Initial customer runtimes are isolated per customer/site. Do not introduce a
  shared multi-tenant media plane without an explicit later architecture
  decision and operational evidence.
- The visual editor is a tool, not the whole product. Prioritize authentication,
  secrets, supported Asterisk LTS, trunks, hours, revision history, rollback,
  restore, and operability before speculative node types or AI features.
- The Essentials+ control plane may manage identity, tenants, roles, and
  entitlements, but an outage of that control plane must not stop already
  deployed calls.
- Module visibility in the UI never replaces server-side entitlement and role
  checks.

## Safety and proof-of-concept boundaries

- This is not production-ready: there is no UI/API authentication or role model.
- SIP passwords are stored in plaintext topology data and returned by the API.
- There is no trunk/DID or public telephone network integration.
- Asterisk 18 is the current implementation baseline and has reached end of
  support; production work targets a supported LTS release.
- The UI and SIP/RTP ports are network-exposed by Compose. Do not expose the
  stack to the public internet or describe it as hardened.
- Backend and AMI host ports stay loopback-bound; AMI provides full PBX control.
- Never commit `.env`, real AMI/SIP credentials, recordings, or topology backups.
- Validate untrusted topology shape before rule validation or field access.
- Validation errors must block deploy in both browser and backend.
- `pbx-data/topology.json` is the current call-flow source of truth. Generated
  Asterisk configuration is derived and may be regenerated.
- Preserve tested PJSIP names, queue mappings, module selection, and IVR jump
  behavior documented in `docs/asterisk-notes.md`.
- Recording/transcription is disabled by default and requires an explicit
  compliance design before implementation or activation.
- Public outbound calling requires an explicit provider, emergency-location,
  and caller-ID policy before any pilot cutover.

## Context hygiene

- Use targeted `rg`, narrow file reads, scoped diffs, and focused test output.
- Avoid giant log dumps, whole-repository ingestion, and unnecessary rereads.
- Run shared validator or backend generator tests before broad validation.
- Use isolated or subagent investigations, where supported, only for large,
  independent explorations and return concise findings.
- Summarize durable verified findings in `.agent/` instead of relying on chat.

When visible context usage reaches roughly 50-70%, prefer reaching a coherent
stopping point, validating, updating the handoff, and continuing in a fresh
session. Do not interrupt an atomic change merely to satisfy that range.

## Validation

- Tests: `npm test`
- Type checks: `npm run typecheck`
- Production bundles: `npm run build`
- Compose configuration: `docker compose config`
- Images, when Docker/runtime work changes: `docker compose build`
- Runtime checks: follow `docs/operations.md`; do not claim them from unit tests.

CI uses Node 20, runs tests/typechecks/builds, and builds all Compose images.
Asterisk runtime changes require real SIP/call-path verification in addition to
unit tests.

## Handoff

Before ending substantial work:

1. Validate the changed behavior at an appropriate scope.
2. Update `.agent/STATE.md` with verified current reality.
3. Update `.agent/TODO.md` with the selected task state; keep the roadmap
   canonical.
4. Record only durable, non-obvious decisions in `.agent/DECISIONS.md`.
5. Update `.agent/ARCHITECTURE.md` only when implemented architecture actually
   changed.
6. Update `docs/product-strategy.md` only for an explicit product decision, not
   as a dumping ground for feature ideas.

Assume the next session has no useful memory of the current conversation.
