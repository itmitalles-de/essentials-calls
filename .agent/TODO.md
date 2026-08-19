# TODO

## Now

- [ ] Review the stabilization draft PR and require every GitHub Actions job to
  pass before considering merge. Do not treat CI as production approval.
- [ ] Review the documented residual supply-chain gates: repository-enforced
  SHA policy, dependency alerts, container CVE scanning, and mutable Ubuntu apt
  resolution for Asterisk/SIPp.
- [ ] Keep the isolated test-DID pilot blocked until every external gate in
  `docs/PILOT_TEST_DID.md` has a named owner, evidence, one positively
  allowlisted ordinary test number, and an approved maintenance window.

## External blockers

- Code ownership and licence rights.
- Responsibility, liability, and revenue allocation.
- Provider contract, dedicated test SIP access, and test DID.
- Privacy, emergency, support, monitoring, backup, and incident ownership.
- Real handset/softphone, caller-ID, codec, NAT/firewall, and two-way audio
  acceptance.
- Upstream-supported Asterisk strategy and complete requalification.
- Real carrier, DID, telephone-network, legal, and explicit production
  acceptance.

No real trunk/DID, emergency route, recording, transcription, AI, public
exposure, customer operation, or Asterisk major upgrade is selected. Deferred
ideas remain documentation-only in `docs/NICE_TO_HAVE.md`.
