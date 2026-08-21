# Follow-up Codex prompt

Work autonomously in `itmitalles-de/simple-calls`. Preserve the product
name **Simple Calls**, the compatibility identifiers documented in
`docs/COMPATIBILITY_IDENTIFIERS.md`, default branch `master`, and the
checksum-pinned Asterisk 22.10.1 LTS source runtime.

First read `AGENTS.md`, `.agent/STATE.md`, `.agent/TODO.md`, the decisions
and architecture handoff, and `docs/VERIFICATION_MATRIX.md`. Preserve all
worktree changes and use only synthetic data. Never read a real `.env` or real
SIP/AMI/provider credentials.

Treat the current local hardening as implemented only where the matrix records
passing evidence. Re-run the complete static, Compose, image, browser,
backup/restore, Asterisk, SIPp, AMI, and CDR regression before modifying a
runtime boundary. Do not update beyond Asterisk major 22 or perform broad
dependency major upgrades.

Priority for a follow-up:

1. inspect the draft pull request and CI results, addressing only concrete
   failures or review findings;
2. retain the AES-GCM/HA1 secret boundary, atomic deploy protocol, SQLite
   revision model, and local-session authorization model;
3. improve local deterministic coverage only where a specific uncovered
   failure mode is identified;
4. keep diagnostics failure-only and redacted;
5. keep all public ports loopback-bound in test defaults.

Do **not** implement trunk/DID functionality unless a separate task supplies a
fully synthetic local provider and an explicit contract covering registration,
inbound DID, outbound calls, auth failure, reconnect, codec negotiation,
provider outage, and routing. Never represent simulation as proof of emergency
calls, legal compliance, carrier compatibility, real-network audio, customer
NAT/firewall behavior, or production readiness.

Keep the external/legal items under `Blocked` until evidence or authority is
provided. Nice-to-have items in `docs/NICE_TO_HAVE.md` remain
documentation-only unless separately commissioned.
