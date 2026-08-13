# TODO

## Now

- [ ] Add a live assertion that a newly uploaded custom WAV is group-readable
  by Asterisk and actually traversed by a synthetic IVR call. Unit/API file-mode
  and reference-protection tests exist, but this exact runtime proof has not
  been added.
- [ ] Run the final complete regression after the latest hardening changes:
  `npm ci`, audit, typecheck, 95 tests, build, both Compose validations, all
  image builds, Playwright, full Asterisk/SIPp, and live backup/empty restore.
- [ ] In particular, re-run Playwright after the latest undo/save/reload and
  WebSocket-session changes, and re-run the Docker suites after legacy-source
  cleanup, sound GID handling, and stricter AMI environment validation.
- [ ] Review the final diff for secrets, generated artifacts, inconsistent
  branding, stale claims, and unintended package/repository renames.
- [ ] After the requested direct merge/push, inspect the `master` GitHub checks
  and address concrete failures. No new draft PR is required for this snapshot.

## Blocked

- Rights and licensing status of the existing code.
- Responsibility and revenue allocation among involved people.
- Real SIP trunk.
- Real DID routing.
- Real endpoints/handsets and softphones.
- Emergency-call concept and legal obligations.
- Carrier acceptance.
- Audio quality in a real telephone network.
- Customer firewall/NAT validation.
- Production operation and support.

Trunk/DID remain disabled because no fully synthetic provider contract was in
scope. These external blockers do not prevent local security and quality work.

No real carrier, DID, trunk, emergency call, physical endpoint, real-network
audio, customer NAT/firewall, or production acceptance has been performed.

## Deferred

See `docs/NICE_TO_HAVE.md`. No implementation scaffolding was created.
