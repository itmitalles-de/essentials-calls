# Essentials+ Calls documentation

This repository contains two deliberately separate layers of documentation:

1. the **implemented proof-of-concept reality**, and
2. the **product direction required to turn it into Essentials+ Calls**.

Do not describe target features as implemented. The runtime baseline was last
verified against Asterisk 18 on 2026-08-06; production work must move to a
supported LTS release before any customer pilot.

| Document | Purpose |
|---|---|
| [product-strategy.md](product-strategy.md) | Product positioning, module model, pilot scope, target architecture, go-to-market |
| [roadmap.md](roadmap.md) | Current status, ordered execution phases, gates, and backlog |
| [architecture.md](architecture.md) | Implemented components and data flow |
| [domain-model.md](domain-model.md) | Current topology model and validation rules |
| [asterisk-mapping.md](asterisk-mapping.md) | Mapping from nodes and edges to generated Asterisk config |
| [api.md](api.md) | Current REST and WebSocket contract |
| [operations.md](operations.md) | Current operation, configuration, testing, and troubleshooting |
| [asterisk-notes.md](asterisk-notes.md) | Runtime-discovered Asterisk and React Flow constraints |

For a quick start, see [../README.md](../README.md).

## Naming

- Customer-facing product: **Essentials+ Calls**
- Short UI name: **Calls**
- Technical slug and target repository name: **`calls`**
- Historical prototype name: **Visual PBX**

The historical name may appear only where a migration or old implementation
identifier is explicitly discussed. It is no longer the product name.

## What the current PoC can do

- Edit call flows as a graph or tables.
- Validate one topology with the same rules in browser and backend.
- Generate Asterisk configuration and reload it through AMI.
- Record or upload IVR prompts.
- Show endpoint, call, and queue status.
- Run as a Docker Compose stack on a trusted network.

## What the current PoC cannot do

It has no trunk/DID, no public telephone network integration, no authentication,
no secure secret model, no multi-user history, no opening-hours model, and no
production hardening. The strategy does not erase these limits. It defines the
ordered work needed to remove them safely.
