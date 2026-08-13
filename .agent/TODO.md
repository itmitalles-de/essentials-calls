# TODO

## Now

- [ ] Diagnose the fresh Playwright failure at `tests/e2e/app.spec.ts:145`.
  After saving a topology containing `E2E Extension`, one Undo leaves the node
  visible although the new assertion expects it to disappear. Decide the
  intended save/history boundary, then fix either the implementation or the
  assertion without weakening semantic coverage.
- [ ] Re-run all 8 Playwright tests after that fix. The 2026-08-13 run stopped
  after test 1 failed, so tests 2-8 were not executed on the final snapshot.
- [ ] Run `npm run test:backup-restore`. This live empty-restore suite was not
  run in the latest continuation and still predates the recent hardening and
  custom-WAV acceptance changes.
- [ ] Re-run any checks affected by the browser fix, then perform the final
  secret/generated-artifact/branding/package-name diff review.
- [ ] Push the local `master` commit only after the remaining regression is
  green, then inspect the `master` GitHub checks and address concrete failures.
  No new draft PR is required; existing draft PR #2 is unrelated.

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
