# Claude Code Guide

Read `AGENTS.md` before working in this repository. It defines the repository
workflow, documentation authority, proof-of-concept boundaries, validation, and
handoff requirements.

For continuation work:

1. Inspect `git status`.
2. Read `.agent/STATE.md`.
3. Read `.agent/TODO.md`.
4. Inspect recent relevant commits.
5. Continue the selected unfinished task unless the user specifies another.

Demand-load only when relevant:

- `.agent/DECISIONS.md` for durable constraints.
- `.agent/ARCHITECTURE.md` for the documentation and component map.
- `docs/roadmap.md` for the authoritative status and candidate backlog.
- `docs/asterisk-notes.md` before Asterisk generation or runtime changes.
- `docs/domain-model.md` before topology or validation changes.

## Claude-specific notes

- Do not infer production safety from the working proof of concept. Local
  authentication, encrypted SIP secrets, optimistic concurrency, and revision
  history exist; carrier, DID, emergency, public-network, legal, and operational
  acceptance do not.
- Treat every topology request as untrusted and preserve backend validation.
- Asterisk configuration loading cleanly is not sufficient validation; use the
  focused runtime checks in `docs/operations.md` when behavior changes.
- Do not read all frontend or Asterisk files unless the task crosses those areas.
- Never place credentials, `.env` contents, recordings, or backups in agent docs.
- Preserve the compatibility identifiers listed in
  `docs/COMPATIBILITY_IDENTIFIERS.md`; public repository references use
  `itmitalles-de/simple-calls`.
- Do not enable trunk/external routing or emergency behavior. A future pilot
  requires the positive allowlist and external gates in `docs/PILOT_TEST_DID.md`.

Useful commands:

```sh
npm test
npm run typecheck
npm run build
docker compose config
npm run test:full-stack
npm run test:e2e
npm run test:backup-restore
npm run scan:secrets
```

Before finishing substantial work, validate and update `.agent/STATE.md` and
`.agent/TODO.md`. Update decisions or architecture only when they changed.
Assume the next Claude session cannot recover this conversation.
