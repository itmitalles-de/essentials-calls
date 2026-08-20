# TODO

## Now

- [ ] Keep stabilization PR #3 in draft until every GitHub Actions job passes on
  the final follow-up head and a human reviews the complete diff. Current jobs
  are rejected with zero steps by the external account payment/spending-limit
  gate; resolve that gate and rerun. Do not treat CI as production approval.
- [ ] Before 2026-09-20, refresh the Debian snapshots or otherwise remediate
  the 15 explicitly recorded unfixed CVE IDs, rerun all image/runtime suites,
  and remove or narrowly renew the exception with human security review.
- [ ] Decide whether to fund GitHub Advanced Security or another managed
  secret/code-scanning service. Repository SHA enforcement, Dependabot alerts,
  automated fixes, weekly update configuration, package snapshots, local
  secret scanning, SBOMs, and the container gate are implemented; managed
  secret/code scanning remains unavailable and must not be claimed.
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
- Ongoing package-snapshot/CVE-exception ownership and managed secret/code
  scanning.
- Real carrier, DID, telephone-network, legal, and explicit production
  acceptance.

No real trunk/DID, emergency route, recording, transcription, AI, public
exposure, customer operation, or further Asterisk major upgrade beyond 22 is
selected. Deferred ideas remain documentation-only in `docs/NICE_TO_HAVE.md`.
