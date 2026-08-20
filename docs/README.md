# Essentials+ Calls documentation

This documentation describes the isolated technical proof of concept as of
2026-08-20. The canonical repository is
`itmitalles-de/essentials-calls`. The synthetic runtime uses checksum-pinned
Asterisk 22.10.1 LTS; historical npm/data identifiers remain only for
compatibility.

Start with:

- [architecture.md](architecture.md) for system boundaries and data flow;
- [domain-model.md](domain-model.md) for call-flow and revision invariants;
- [asterisk-mapping.md](asterisk-mapping.md) and
  [asterisk-notes.md](asterisk-notes.md) before changing generation;
- [api.md](api.md) for the authenticated API contract;
- [security.md](security.md) for sessions, authorization, and SIP secrets;
- [operations.md](operations.md) for local operation and automated acceptance;
- [backup-restore.md](backup-restore.md) for recovery and key handling;
- [operations/MASTER_KEY_RECOVERY.md](operations/MASTER_KEY_RECOVERY.md) for
  wrong-key, rotation, and interrupted-rotation recovery;
- [COMPATIBILITY_IDENTIFIERS.md](COMPATIBILITY_IDENTIFIERS.md) for retained
  internal identifiers after the repository rename;
- [PILOT_TEST_DID.md](PILOT_TEST_DID.md) for future isolated pilot gates, not a rollout;
- [VERIFICATION_MATRIX.md](VERIFICATION_MATRIX.md) for evidence boundaries;
- [roadmap.md](roadmap.md) for blocked production work; and
- [NICE_TO_HAVE.md](NICE_TO_HAVE.md) for explicitly deferred ideas.

All verified telephony in this repository is local and synthetic. No document
may turn those results into a claim of provider, DID, emergency-call, carrier,
real-device, or production readiness.
