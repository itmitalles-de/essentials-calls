# TODO

`docs/roadmap.md` is the authoritative project status and ordered backlog.
`docs/product-strategy.md` is authoritative for product scope and positioning.
This file records only the selected continuation task and immediate blockers.

## Now

- [ ] Implement the first Phase 1 slice: upgrade the runtime and tests from
  Asterisk 18 to Asterisk 22 LTS, then rerun the documented SIP registration and
  call-flow checks.
- [ ] Design the smallest compatible revision/deploy model for immutable
  revisions, atomic publish, health verification, and rollback.

## Next

- [ ] Add authentication, administrator/editor roles, protected WebSocket access,
  secret separation, masking, and audit events before real trunk work.
- [ ] Implement one provider-neutral trunk model and one preferred German
  provider profile only after the access/secret minimum gate is met.

## Later

See `docs/roadmap.md`. Do not pull deferred AI, recording, broad integrations,
multi-site, or own-softphone work into the pilot critical path without an
explicit product decision backed by customer evidence.

## Blocked / external actions

- [ ] Rename the GitHub repository from `itmitalles-de/visual-pbx` to
  `itmitalles-de/calls` in repository settings.
- [ ] After the repository rename, update remotes, links, CI/deploy integrations,
  and registry references.
- [ ] Migrate `@visual-pbx/*` npm names separately with imports and lockfile; do
  not combine this with telephony behavior changes.

## Recently completed

- [x] Defined Essentials+ Calls as the product name and `calls` as the technical
  slug/repository target.
- [x] Added the product strategy, modular model, pilot gates, target architecture,
  and go-to-market plan.
- [x] Replaced the primary product naming in the README, documentation index,
  agent guide, and visible UI title.
- [x] Reworked the roadmap from a feature list into ordered production and pilot
  gates.
