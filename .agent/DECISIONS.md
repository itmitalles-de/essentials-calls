# Durable Decisions

This file records non-obvious decisions that future work must preserve unless a
new explicit decision supersedes them.

## Product identity and positioning

### Essentials+ Calls is the product; Visual PBX is historical

The customer-facing name is **Essentials+ Calls**, the short UI name is
**Calls**, and the technical/repository slug is **`calls`**. Visual PBX may be
used only for the historical prototype or temporary legacy identifiers.

Reason: the old name describes one UI mechanism and incorrectly frames the
product as a generic PBX. Calls belongs to the modular Essentials+ product
family and must be understandable without telephony jargon.

### The visual editor is a tool, not the market position

Do not position the product as unique merely because it has a graph editor.
Prioritize business templates, guided setup, safe publish, diff, rollback,
health, and integration with real workflows.

Reason: mature telephony products already provide visual routing and broad
feature sets. Calls must differentiate through clarity, modularity, integration,
provider independence, and managed operation.

### Managed service before public self-service

The first real installations are productized, managed deployments for two to
three suitable customers from the existing network. Public self-service and
broad provider/device matrices are deferred until onboarding and support are
repeatable.

Reason: telephony failures are operationally expensive. Managed pilots generate
real evidence while limiting combinations and blast radius.

### Calls is not a carrier or general UC suite

The SIP provider remains a separate specialist provider, preferably contracted
directly by the customer. Chat, meetings, video, own softphones, AI reception,
and enterprise contact-center scope are not core pilot requirements.

Reason: this avoids regulatory and operational scope expansion and prevents a
feature-by-feature competition with mature suites.

## Essentials+ modularity

### Central identity and entitlements, Calls-owned telephony domain

The Essentials+ control plane owns organizations, users, roles, module
entitlements, common navigation, and shared lifecycle concepts. Calls owns
numbers, endpoints, call flows, provider profiles, runtime deployment, and
telephony status.

UI visibility is not authorization. Every protected Calls action must validate
role and module entitlement server-side.

### Only active modules in daily navigation

Customers see enabled modules in normal navigation. A separate compatible module
catalog may show extensions available to that tenant for intentional activation.
Unsupported or incompatible modules are not presented as usable controls.

Reason: modularity should reduce cognitive load rather than create a showroom of
disabled switches.

## Runtime and tenancy

### Isolated runtime per early customer/site

Initial pilots use a dedicated Calls/Asterisk runtime per customer or site. A
shared multi-tenant media plane is explicitly deferred.

Reason: isolation reduces security, privacy, abuse, upgrade, and incident blast
radius while product behavior is still changing.

### Control-plane outage must not stop active calls

The future Essentials+/Calls control plane distributes configuration and manages
lifecycle, but the local runtime continues using the last known-good deployment
when the control plane is unavailable.

Reason: administrative convenience must not become a new real-time dependency
for basic phone calls.

### Keep generated config plus explicit deploy for now

Continue generating readable Asterisk configuration and using an explicit
validated deploy/reload path. Do not replace it with realtime database or ARI
orchestration without measured requirements.

Reason: the current approach is auditable, testable, and understandable. The
missing controls are revisioning, atomicity, health checks, and rollback, not a
more fashionable configuration mechanism.

### Supported Asterisk LTS before pilot

The Asterisk 18 PoC baseline must move to Asterisk 22 LTS or the then current
supported LTS before external pilot use.

Reason: new production work must not be built on an end-of-life telephony core.

## Data and deployment

### One topology is the desired-state source of truth

The editor views manipulate one shared topology. Generated Asterisk files are
derived artifacts. Runtime status, CDRs, audit events, and secrets are separate
concerns and must not be embedded into desired-state topology.

### Same validation in browser and backend

Shared validation remains a deliberate boundary. Frontend validation is fast
feedback; backend validation is authoritative and mandatory before save or
publish.

### Draft and active state are separate

Saving an edit must never implicitly change live telephone behavior. Publishing
creates an immutable revision, validates it, applies it atomically, checks
health, and records the result. A last known-good revision must be restorable.

### Legacy names are migrated separately

Product naming, GitHub repository naming, npm package scopes, container names,
and persistent data paths are separate migrations. Do not rename packages,
volumes, or stored paths casually inside product work.

Reason: a cosmetic rebrand must not create avoidable lockfile churn or data loss.

## Status and events

### Status is ephemeral operational data

Live endpoint, queue, and call status is not persisted in topology. The current
polling implementation may later become AMI event subscriptions, but the domain
separation remains.

### Browser performs prompt conversion

Keep browser-side resampling/encoding to 8 kHz mono WAV unless a verified reason
requires server-side media processing. The backend still validates the final
file before storage.

## Security and compliance

### Secrets are not topology fields in the target product

Provider and endpoint secrets must be stored through a separate protected
secret layer, masked in APIs, excluded from exports/logs, and rotatable without
returning old values.

### Recording/transcription is opt-in and compliance-gated

No default call recording. Any future recording or transcription module needs
explicit purpose, permissions, notice/consent handling where required,
retention, deletion, encryption, and audit controls before activation.

### Public outbound calling requires an emergency/location decision

No customer cutover with public outbound calling until provider responsibility,
caller-ID behavior, location data, and 110/112 routing are explicitly defined
and tested for the deployment.
