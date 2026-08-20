# TODO

## Now

- [ ] Keep stabilization PR #3 in draft until every GitHub Actions job passes on
  the final follow-up head and a human reviews the complete diff. Do not treat
  CI as production approval.
- [ ] Choose and fund the remaining supply-chain controls: repository-enforced
  SHA policy, dependency/secret/code alerts, container CVE scanning, and a
  reproducible package source for the remaining Ubuntu runtime/build and SIPp
  apt dependencies.
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
- Controlled Asterisk/PJProject/Jansson update ownership and requalification.
- Real carrier, DID, telephone-network, legal, and explicit production
  acceptance.

No real trunk/DID, emergency route, recording, transcription, AI, public
exposure, customer operation, or further Asterisk major upgrade beyond 22 is
selected. Deferred ideas remain documentation-only in `docs/NICE_TO_HAVE.md`.
