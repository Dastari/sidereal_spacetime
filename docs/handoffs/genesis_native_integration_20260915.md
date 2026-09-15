# Genesis native planet integration — 2026-09-15

Owner-authorized activation is live at http://sidereal.tail7a58a6.ts.net:5174/planets in the source dashboard preview. The default Reviewed planets mode supplies all28 accepted native revisions; Procedural editor retains old recipe editing/import/export/gallery. Nothing assigns new identities to authoritative moons or modifies world/sim/content.

Implementation and decisions: [specification](../genesis_native_planets_spec.md), [ADR](../adr/ADR-genesis-reviewed-native.md), [packaging](genesis_native_packaging_20260915.md). Staged bundles are tracked under dashboard public/reviewed-planets with LFS payloads/textures and per-revision provenance. They survive the active source prepare_app asset rebuild. Required render/dashboard package dependency: @noble/hashes2.4.0 for HTTP-safe worker hashing.

Source activation copied only the scoped renderer/editor files and immutable packages, including already-merged modern schema dependencies absent from the older running checkout. Restarted dashboard through scripts/dev.py only; no database or public game deployment occurred. Unrelated Shipyard source changes were preserved.

Validation: all28 packaged worker registrations/builds passed sequentially (1GiB heap per process, peak350.6MiB).13 focused test files pass31tests;2 optional archived-source comparisons skipped in final fast run but passed at packaging. Preview TypeScript passes. Required full check/build and direct dashboard build were run and blocked by documented preexisting renderer import gaps / missing isolated Spacetime CLI. See saved logs. No claim of green whole-project CI.

Saved actual Genesis Ice26 on GT730 and SwiftShader. Independent Astra confirms one-view rendering parity with accepted Ice26; owner says it looks good. Hardware currently differs from RTX4080 baseline; hidden-preview stalls prevent a trustworthy timing claim. Normal Flight/Map/F3 acceptance remains outstanding. Further UI browser results are recorded in the evidence manifest. Do not resume visual polishing on already agreed planets.

Branch: feat/genesis-reviewed-planets, based on origin/main9e3c40e2. Deliver through a new PR; merge is not authorized for this new PR. Do not stage unrelated dirty source files or the node_modules worktree symlink.

PR: https://github.com/Dastari/sidereal_spacetime/pull/6. Code commit563a1c2e. Evidence manifest includes actual Ice/Gas/Temperate/Volcanic captures and Volcanic ready0→2→retained0 UI zoom. Software60s capture timeouts are retained; no timing inference.
