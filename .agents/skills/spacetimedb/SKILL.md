---
name: spacetimedb
description: Use for Sidereal SpacetimeDB schema, reducers, filtered views, generated TypeScript bindings, subscriptions, migrations, and MMO replication reviews. Includes the official Clockwork Labs TypeScript and core references, adapted to the project operating contract.
---

# SpacetimeDB for Sidereal

Read the applicable official reference before changing SpacetimeDB integration:

- [Concepts](references/concepts.md): transactions, identity, schema decomposition and subscription lifetime.
- [TypeScript server](references/typescript-server.md): tables, indexes, reducers, views and schedules.
- [TypeScript client](references/typescript-client.md): generated bindings, callbacks and subscription queries.
- [CLI](references/cli.md): command syntax; use Sidereal's managed scripts to execute lifecycle operations.

These are upstream skills, preserved byte-for-byte under `references/`. `upstream.json` records their source revision and SHA-256 hashes. They are API references, not Sidereal design contracts. Read the wiki contract governing the code through the `sidereal-wiki` skill. Project rules and the user's authorization take precedence over upstream examples.

For this repository:

1. Check the exact CLI and SDK pins in `dev.toml`, `packages/world/package.json` and `packages/net/package.json`. Verify version-sensitive APIs against the installed SDK and official documentation; upstream skill metadata is not a promise of compatibility with every pinned release.
2. Keep authoritative tables private. Export explicit row and column allowlists through actor-scoped views. Client subscription predicates only narrow delivery; they never authorize it. Keep authorisation, perception and presentation separate as specified by the wiki's Visibility and Interest Management contract.
3. Authenticate from the reducer context and the project's session proof. Accounts and characters have separate identities. Recheck occupied control stations, power, current grants and input leases when commands are consumed. Clients send intent and expected revisions, never transforms, energy or inventory balances.
4. Use reducer transactions for atomic identity-preserving changes, with operation IDs and replay checks where the domain contract requires them. A thrown reducer error rolls back the transaction. JSON definition documents are intentional versioned domain envelopes; do not replace them merely because an upstream example prefers typed arguments.
5. Use indexes for access by owner, ship, deck, cell and expiry. Separate frequent motion from cold descriptions and bulk layout documents. Measure actor-view dependency fan-out, rows, bytes and time before choosing derived interest sets or different scheduling cadences. Any work budget needs an explicit defer/recovery policy; it must not silently drop authorized, perceived players.
6. Retain subscription handles and listeners, wait for `onApplied`, and release them on context change or disposal. Respect the existing bounded old/new cell overlap and aggregate SDK row ownership during handover. Feed scopes from accepted server state, including the current EVA observer, rather than camera or predicted transforms.
7. Start, build, generate, smoke and publish only through `python3 scripts/dev.py` or npm scripts. Upstream `spacetime start`, `dev`, Maincloud publish and delete/reset examples are not this project's workflow. Never clear an existing database to resolve a schema conflict. Review migrations and publish plans; use isolated test databases for authority validation.
8. Keep bulk art on HTTP asset delivery, separate from SpacetimeDB state. Public catalogue bytes never grant private live-state access. Use the immutable-asset ADR and current implementation contracts for asset publication and loading.

Follow AGENTS.md for Agent Mail, PR delivery and verification. Record findings, implementation status and changed contracts in the wiki; skill resources are the repository's allowed Markdown exception.
