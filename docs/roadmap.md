# Essentials+ Calls roadmap

Stand: 2026-08-13  
Authority: execution status and ordered backlog  
Product direction: [product-strategy.md](product-strategy.md)

## 1. Current reality

The repository contains a functional visual Asterisk call-flow proof of
concept. It is not yet a customer-ready Calls installation.

### Verified in the existing PoC

The following behavior was documented as runtime-tested against Asterisk 18 on
2026-08-06:

- SIP registration for internal extensions
- repeated registration without stale contacts
- generated call-flow execution into an IVR
- custom prompt playback and missing-file behavior
- voicemail module operation
- malformed topology request handling
- graph editor creation, deletion, edges, and deploy blocking on validation
- dark-mode behavior
- 52 validator, generator, and sound tests

The latest documentation migration did not independently rerun the live
Asterisk checks. Unit tests, type checks, builds, and Compose validation passed
at that handoff.

### Current blocking limitations

#### Product and access

- No authentication, authorization, tenant, or role model
- No Essentials+ module entitlement integration
- No audit log or revision history
- Concurrent saves can overwrite each other

#### Telephony

- No trunk or DID
- No real inbound or outbound public calling
- No opening hours, holidays, temporary exceptions, or external forwarding
- Queue strategies are limited and reporting is absent
- No provider abstraction or provisioning workflow
- No defined emergency-calling and location policy

#### Security and operation

- SIP passwords are plaintext in topology storage and API responses
- UI and SIP/RTP are exposed for a trusted network, not hardened internet use
- No tested automated backup and restore workflow
- No atomic versioned deployment or automatic rollback
- Status uses repeated AMI polling instead of event subscriptions
- Prompt references can become dangling after file deletion
- Asterisk 18 is the implemented baseline and has reached end of support

## 2. Product decisions now in force

- Product name: **Essentials+ Calls**
- Short name: **Calls**
- Repository target name: **`calls`**
- Visual PBX is only the historical prototype name
- Calls begins as a managed service for small businesses, not public self-service
- The SIP provider remains a separate specialist provider
- Each first customer/site gets an isolated Calls runtime
- Visual editing remains important, but safe publishing and business templates
  have higher product priority than adding more node types
- Recording, transcription, AI reception, and multi-site are not core pilot scope
- No external customer pilot may bypass the gates below

## 3. Ordered execution plan

### Phase 0: Rebrand and scope lock

Status: **in progress**

- [x] Define Essentials+ Calls product strategy
- [x] Replace customer-facing Visual PBX naming in primary UI and documentation
- [x] Define `calls` as technical slug and repository target name
- [ ] Rename GitHub repository from `visual-pbx` to `calls`
- [ ] Update repository links, local remotes, integrations, and badges after rename
- [ ] Migrate internal `@visual-pbx/*` npm names in a separate mechanical PR

**Gate:** The product strategy is linked from the README and future feature work
can be mapped to a pilot requirement or explicitly deferred module.

### Phase 1: Supported runtime and deployment safety

Priority: **highest**

- [ ] Upgrade the Asterisk image and test fixtures to Asterisk 22 LTS or the then
  current supported LTS series
- [ ] Re-run real SIP registration, internal calling, IVR, queue, prompt, and
  voicemail checks against the new baseline
- [ ] Introduce immutable topology revisions
- [ ] Add atomic generated-config replacement
- [ ] Store deploy metadata: revision, timestamp, actor, checksum, result
- [ ] Add pre-deploy config validation and post-deploy health checks
- [ ] Add one-step rollback to the last known-good revision
- [ ] Validate prompt references before publish
- [ ] Add export/import with schema versioning

**Gate:** A deliberately broken deployment cannot destroy the last working
configuration and can be rolled back without editing files manually.

### Phase 2: Access, secrets, and audit

Priority: **highest, may run parallel with Phase 1 where independent**

- [ ] Add authentication
- [ ] Add administrator and editor roles
- [ ] Enforce authorization in backend routes and WebSocket access
- [ ] Move provider and endpoint secrets out of topology documents
- [ ] Encrypt or seal stored secrets and mask them in every read API
- [ ] Add secret rotation without returning the old secret
- [ ] Add append-only audit events for login, save, publish, rollback, secret,
  and provider changes
- [ ] Add HTTPS deployment guidance, rate limits, secure headers, and origin rules
- [ ] Review logs and error payloads for credential leakage

**Gate:** A user without permission cannot read or change telephony state, and
no normal API response exposes reusable credentials.

### Phase 3: First real provider path

Priority: **after the Phase 1/2 minimum gates**

- [ ] Define a provider-neutral trunk model
- [ ] Implement one preferred German SIP-provider profile
- [ ] Support DID mapping and inbound routes
- [ ] Support outbound dial rules and permitted caller IDs
- [ ] Model emergency location and provider responsibility explicitly
- [ ] Add trunk registration/reachability status and actionable diagnostics
- [ ] Test inbound, outbound, number presentation, busy, timeout, failover, and
  provider outage behavior
- [ ] Document porting and rollback procedure for customer numbers

**Gate:** A test number can call in and out reliably, with known caller-ID and
emergency behavior, and a provider outage produces a clear diagnosis rather
than silent failure.

### Phase 4: Small-business call handling

- [ ] Opening hours by weekday and timezone
- [ ] Public holidays and customer-defined exceptions
- [ ] Temporary closure, vacation, and representation override
- [ ] External forwarding with validation and cost warning
- [ ] Ring groups and queue behavior suitable for the first pilot templates
- [ ] Voicemail-to-email or another explicit notification path
- [ ] Business templates: office, trade/workshop, service hotline, after-hours
- [ ] Guided setup that generates the same topology used by visual/advanced views
- [ ] Draft versus active version clearly visible in the UI
- [ ] Flow simulation for time, caller input, timeout, no-answer, and unavailable
  endpoints

**Gate:** A non-telephony expert can describe normal hours, no-answer, holiday,
and representation behavior and verify the resulting route before publishing.

### Phase 5: Operability and pilot package

- [ ] Health dashboard for provider, runtime, endpoints, queues, and last deploy
- [ ] Event-driven AMI status instead of broad three-second polling
- [ ] Call detail records with retention controls
- [ ] Automated encrypted backup of topology revisions, prompts, and required
  runtime metadata
- [ ] Scripted restore into a fresh isolated instance
- [ ] Update, restart, incident, provider-outage, and restore runbooks
- [ ] Monitoring and alerts with customer-safe and operator-level detail
- [ ] Standardized deployment parameters and per-customer inventory
- [ ] Acceptance-test checklist and signed-off pilot handover

**Gate:** Restore is proven on a clean instance, and routine incidents can be
handled from documented procedures without archaeology in the container shell.

### Phase 6: Two to three managed pilots

- [ ] Select low-risk pilot customers from the existing network
- [ ] Restrict initial combinations to one preferred provider and a small tested
  device set
- [ ] Document the old and new call behavior before migration
- [ ] Run acceptance tests before number cutover
- [ ] Categorize every support interaction and customer-requested exception
- [ ] Measure onboarding time, missed calls, deploy failures, support minutes,
  and customer self-service changes
- [ ] Review pilot results after several weeks before setting public prices or
  broadening provider support

**Gate:** Multiple real installations operate stably, onboarding is repeatable,
and the majority of requested behavior fits the shared product model.

### Phase 7: Essentials+ control-plane integration

- [ ] Shared Essentials+ login, organizations, and roles
- [ ] Server-side Calls entitlements
- [ ] Shared navigation that shows active modules only
- [ ] Compatible module catalog for intentional activation
- [ ] Reproducible provisioning of an isolated Calls runtime
- [ ] Signed deployment bundles and runtime identity
- [ ] Central operational overview without making the control plane necessary for
  ongoing calls
- [ ] Tenant disable/deprovision workflow with export and retention handling

**Gate:** Calls can be activated, provisioned, restricted, monitored, exported,
and deactivated for one Essentials+ tenant through a documented lifecycle.

## 4. Deferred modules

These are not part of the pilot critical path:

- advanced queue analytics
- CRM/order/appointment integrations
- click-to-call
- multi-site routing and failover
- recording and transcription
- AI summaries or AI reception
- SMS, WhatsApp, fax, chat, meetings, and video
- own softphone clients

A deferred item enters the roadmap only when pilot evidence shows a recurring
need, a clear owner, and an acceptable operational/compliance cost.

## 5. Explicit non-goals

- Becoming a carrier or pretending provider obligations do not exist
- Sharing one unisolated Asterisk runtime across early customers
- Building a generic UC competitor feature by feature
- Persisting runtime status inside the desired call-flow topology
- Replacing readable generated config with a more complex realtime architecture
  before the current model becomes a measured bottleneck
- Renaming persistent volumes or data paths without a migration plan
- Treating successful config loading as proof of successful calling

## 6. Definition of a pilot-ready release

A release is pilot-ready only if all of the following are true:

- supported Asterisk LTS baseline
- authenticated and authorized administration
- protected and masked secrets
- real provider profile with tested inbound and outbound calls
- documented emergency/location behavior
- opening hours, holidays, no-answer, external forwarding, and voicemail
- revision history, diff, atomic deploy, health check, and rollback
- audit log
- automated backup and proven restore
- monitoring and incident runbook
- customer acceptance scenarios completed

Partial completion is useful development progress, but must not be marketed as a
production telephone system.

## 7. Next recommended implementation slice

The next coherent slice is:

1. upgrade to Asterisk 22 LTS,
2. preserve all existing runtime tests on the new baseline,
3. add revision IDs and atomic deployment with rollback,
4. then implement authentication and secret separation before trunk work.

This sequence removes an obsolete runtime foundation and makes every later
provider experiment safer. It is intentionally less glamorous than an AI
receptionist and dramatically more valuable.
