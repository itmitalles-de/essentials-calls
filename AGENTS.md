# Repository Agent Guide

Visual PBX is a proof-of-concept visual call-flow editor backed by Asterisk 18.
Treat the repository as persistent project memory and the current chat or agent
session as temporary working memory.

## Startup

1. Inspect `git status` and preserve existing worktree changes.
2. Read `.agent/STATE.md`.
3. Read `.agent/TODO.md` when continuing existing work.
4. Read `.agent/DECISIONS.md` and `.agent/ARCHITECTURE.md` only when relevant.
5. Inspect the specific implementation area required by the task.
6. Check recent relevant commits when continuation context is needed.

`docs/roadmap.md` is the authoritative project status and candidate-work list.
`.agent/TODO.md` records only the selected continuation task and points there;
do not maintain a duplicate backlog. A user-specified task takes precedence.

## Documentation map

- `README.md`: concise product status, startup, and developer commands.
- `docs/README.md`: documentation index and proof-of-concept boundary.
- `docs/architecture.md`: authoritative component and data-flow description.
- `docs/domain-model.md`: topology types and validation rules.
- `docs/asterisk-mapping.md`: generated configuration and dialplan mapping.
- `docs/asterisk-notes.md`: runtime-verified Asterisk and React Flow pitfalls.
- `docs/api.md`: REST and WebSocket contract.
- `docs/operations.md`: ports, security, backup, testing, and troubleshooting.
- `docs/roadmap.md`: verified behavior, limitations, decisions, and possible work.

Anyone changing Asterisk generation must read the relevant mapping and pitfalls
sections first. A configuration that loads without errors is not proof that a
call flow works.

## Implementation map

- `shared/`: topology model, structural/rule validation, and shared fixtures.
- `backend/`: Express API, topology store, config generation, AMI, and sounds.
- `frontend/`: React/React Flow editor, API client, audio conversion, and theme.
- `asterisk/`: Asterisk 18 image, entrypoint, and static config templates.
- `docker-compose.yml`: runtime topology, ports, and persistent volumes.
- `scripts/sip-register-test.py`: real SIP REGISTER diagnostic.

The frontend imports `shared/src` through a Vite alias; the backend consumes the
compiled workspace package. Preserve this intentional build boundary.

## Safety and proof-of-concept boundaries

- This is not production-ready: there is no UI/API authentication or role model.
- SIP passwords are stored in plaintext topology data and returned by the API.
- The UI and SIP/RTP ports are network-exposed by Compose. Do not expose the
  stack to the public internet or describe it as hardened.
- Backend and AMI host ports stay loopback-bound; AMI provides full PBX control.
- Never commit `.env`, real AMI/SIP credentials, recordings, or topology backups.
- Validate untrusted topology shape before rule validation or field access.
- Validation errors must block deploy in both browser and backend.
- `pbx-data/topology.json` is the call-flow source of truth. Generated Asterisk
  configuration is derived and may be regenerated.
- Preserve tested PJSIP names, queue mappings, module selection, and IVR jump
  behavior documented in `docs/asterisk-notes.md`.

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

## Handoff

Before ending substantial work:

1. Validate the changed behavior at an appropriate scope.
2. Update `.agent/STATE.md` with verified current reality.
3. Update `.agent/TODO.md` with the selected task state; keep the roadmap canonical.
4. Record only durable, non-obvious decisions in `.agent/DECISIONS.md`.
5. Update `.agent/ARCHITECTURE.md` only when architecture actually changed.

Assume the next session has no useful memory of the current conversation.
