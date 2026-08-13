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

- Do not infer production safety from the working proof of concept. Authentication,
  secret storage, public-network hardening, locking, and history are absent.
- Treat every topology request as untrusted and preserve backend validation.
- Asterisk configuration loading cleanly is not sufficient validation; use the
  focused runtime checks in `docs/operations.md` when behavior changes.
- Do not read all frontend or Asterisk files unless the task crosses those areas.
- Never place credentials, `.env` contents, recordings, or backups in agent docs.

Useful commands:

```sh
npm test
npm run typecheck
npm run build
docker compose config
```

Before finishing substantial work, validate and update `.agent/STATE.md` and
`.agent/TODO.md`. Update decisions or architecture only when they changed.
Assume the next Claude session cannot recover this conversation.
