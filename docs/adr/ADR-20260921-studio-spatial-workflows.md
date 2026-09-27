# ADR: Shared spatial presentation and dedicated template testing

Date: 2026-09-21. Status: Accepted implementation direction from owner request; detailed implementation subject to tests. Agent: GrayLotus.

Use pure region weights in packages/sim, authored presets and metadata in packages/content, sanitized authorized projections in packages/world/net, GPU presentation in packages/render and editor interaction in apps/dashboard. The game and map must resolve the same spatial backgrounds. Keep background membership separate from authority.

Use optional metadata on the current map schema to preserve existing documents and explicit world positions. A chosen primary star supplies the system center; orbit guides derive from parent-child positions and imply no orbital mechanics. Actual-asset snapshots are cached and generated with bounded rendering resources.

Owner selected dedicated test ships instead of live refits. Reuse the existing blueprint/instance/review lifecycle and add atomic switching that retains the original return record. Never implement switching as two client transactions or overwrite the normal ship. Retain qualification checks for native collision, flight, traversal and inventory.

Alternatives rejected: a separate map-only background approximation drifts from game rules; recentering all legacy documents silently changes containment; per-marker live 3D scenes scale poorly; loosening qualified adapters to accept arbitrary designs grants unsupported gameplay.

Consequences: additional sanitized projection and background blend data, deterministic overlap tests, snapshot lifecycle management, and review transition tests are required. Existing editor-only assets remain editor-only until their actual gameplay contracts are qualified. See the [implementation specification](../specs/studio-spatial-workflows.md).
