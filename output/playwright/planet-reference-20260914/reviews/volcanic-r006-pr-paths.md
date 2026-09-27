# Volcanic r006 PR paths

Native material authoring and preview added by the Volcanic subtask:

- scripts/art_library/build_volcanic_moon2_shoulders_r006.py
- scripts/art_library/preview_volcanic_moon2_shoulders_r006.py
- scripts/art_library/volcanic_moon2_shoulders_r006.test.ts
- scripts/art_library/volcanic_moon2_shoulders_r006.vitest.config.ts

r005 predecessor scripts are also substantive preserved history if not already included:

- scripts/art_library/build_volcanic_moon2_shoulders_r005.py
- scripts/art_library/volcanic_moon2_shoulders_r005.test.ts
- scripts/art_library/volcanic_moon2_shoulders_r005.vitest.config.ts

Runtime uses the existing composer unchanged by this subtask; root owns worker integration:

- scripts/art_library/volcanic_moon_reference_composition_r004.ts
- scripts/art_library/planet_reference_worker.ts
- scripts/art_library/planet_reference_worker_lifetime.ts
- scripts/art_library/planet_reference_worker_lifetime.test.ts

Canonical native source, exports, actual-runtime captures and evidence:

- assets/art-library/designs/environment.planet.volcanic/design.json
- assets/art-library/designs/environment.planet.volcanic/DESIGN.md
- assets/art-library/designs/environment.planet.volcanic/revisions/r026/

Exact file list: volcanic-r006-checkpoint-files.txt. Manifest hashes: volcanic-r006-checkpoint-hashes.json. The checkpoint contains the exact native authoring script, preview script, tests/config and compositor snapshot alongside the Blender source, all12GLBs and texture maps. Previous checkpoint25 remains preserved.

Validation: all12native GLB position/material/split-normal/UV audits pass;2focused tests pass. Root and independent Astra agree on the bounded seed38/two-angle/47px working visual PASS. Final owner, all-seed/LOD, real hardware Flight/Map and publication gates remain open.
