# Decisions

The detailed, authoritative rationale is in the **Bewusste Entscheidungen**
section of [`../docs/roadmap.md`](../docs/roadmap.md). This file is a concise
index of the implemented choices future agents must not casually undo.

## Browser-side audio conversion

**Decision:** Convert recorded and uploaded prompts to 8 kHz mono WAV in the
browser.

**Reason:** Recording and upload share one Web Audio path without adding ffmpeg
to the backend image.

**Alternatives considered:** Server-side conversion with ffmpeg.

**Consequences:** Microphone capture requires a secure browser context; the
backend must still validate WAV headers and sizes.

## Generated files plus AMI reload

**Decision:** Generate readable Asterisk config files into a shared volume and
reload them through AMI.

**Reason:** File generation keeps the PoC dialplan inspectable; AMI cannot write
the files, and files do not become active without a reload.

**Alternatives considered:** Asterisk Realtime backed by a database.

**Consequences:** Preserve static/generated config separation, validate before
writing, and test actual call behavior rather than only successful loading.

## One shared validator

**Decision:** Keep the topology model and validator in `shared/` for both
frontend and backend.

**Reason:** The editor needs immediate feedback while the backend must not trust
client-side validation; one implementation prevents rule drift.

**Alternatives considered:** Separate browser and server validators.

**Consequences:** Domain changes must remain compatible with both build paths,
and the backend must still validate every untrusted request.

## Ephemeral runtime status

**Decision:** Keep endpoint/call/queue status separate from the persisted
topology and push it over WebSocket.

**Reason:** Status is a momentary observation of Asterisk, not call-flow design.

**Alternatives considered:** Storing status fields in `topology.json`.

**Consequences:** Asterisk outages produce `unknown` status without corrupting
the topology; reconnecting clients must obtain fresh state.

## Single-file proof-of-concept persistence

**Decision:** Store the call-flow source of truth as one `topology.json` file;
generated Asterisk files are disposable derivatives.

**Reason:** The current scope assumes a single trusted editor and does not need
a database or collaboration model.

**Alternatives considered:** Database persistence with locking and history.

**Consequences:** Concurrent saves can overwrite each other. Do not claim
multi-user safety, and back up the topology and prompt volume, not generated config.
