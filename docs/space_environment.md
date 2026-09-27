# Spatial environment and physical flight lab

Status: Private laboratory implementation; shared-world discovery remains M1
Last updated: 2026-09-08
Owners: Sidereal simulation and rendering

## Implemented on 2026-09-08

The single SpacetimeDB authority owns private `space_body` rows. Each lab receives four physical asteroids and three known celestial landmarks with stable IDs, f64 world XY and persistent motion. Seeding is idempotent. `own_space_bodies` admits only the caller's lab; physical rocks additionally require server-derived distance within 400 m of its ship. Base table subscription is forbidden. Celestials are deliberately known landmarks in this fixture. This is not a claim of shared-universe AOI or contact intelligence.

The physics adapter applies three 1/60 s substeps per 20 Hz world tick. Pure capsule/circle contact math uses swept conservative advancement, angular contact velocity, mass/inertia and normal impulses. A conservative capsule represents the whole ship; circles represent rocks. Free drift has one owner in the contact solver. Contact/raycast work is bounded; exhaustion freezes remaining drift and emits a diagnostic rather than tunneling silently. Bodies continue coasting without a seated pilot. Ship-to-ship, exact voxel hull collisions, projectile damage and fragment physics are not implemented.

Tests exercise high-speed impact, off-center torque, moving/rotating contact, momentum/energy bounds, input guards and private subscriptions. A real two-identity smoke drives one ship into its approach rock, verifies server-owned motion transfer and verifies the other lab remains unchanged. Durable body state participates in the restart smoke.

## A planar game inside a 3D scene

World XY maps to render X/-Z, with render Y carrying visual height. The renderer subtracts the smoothed ship origin before GPU conversion. Rocks lie on the flight plane. Planets and stars retain their authored XY but sit deeper below that plane; they are actual merged voxel globe/ring geometry (stars retain a smooth luminous sphere). Orbiting the camera changes their projection and scale naturally. Flying changes the ship's XY relative to those landmarks. Gravitational orbits, planet collision/landing and six-axis flight remain separate gameplay decisions.

Both modes use a long-lens perspective camera. On foot, elevation is fixed at 35.264 degrees and right-drag changes azimuth; station interaction blends overhead. The camera and nearby bodies use the same presentation smoothing rate. Simulation never reads those smoothed transforms. Prediction/replay and timestamped shared-crew interpolation remain M1.

A world-direction sky sphere is centered on the camera only to model infinite distance. A localized original galaxy plate blends into procedural 3D directional nebula/star fields. Nearby voxel dust uses bounded thin instances in a world-anchored volume; it has no collision or gameplay identity. Region selectors change sky art, not server positions. Planet/rock anchoring must never be replaced by camera-relative decoration to improve a screenshot.

## Remaining gates

Shared world views must derive exterior discovery and crew admission from authority, redact private interiors/cargo and revoke access immediately. Add spatial indices and named budgets before increasing populations. Ship collision shapes must compile from installed structure, with mass and voxel damage committed atomically. Measure contact workload, render upload/mesh cost, depth precision and crowded fleets on named hardware; software-WebGL browser screenshots are visual evidence only.

## 2026-09-08 procedural voxel celestial study

Known celestial rows now drive seeded, genuinely three-dimensional stepped globes. The renderer samples a bounded 52³ lattice and emits only exposed opaque voxel faces into one mesh/material per globe. Ocean coastlines, raised land shelves and polar ice, gas bands, and cratered rock/moon surfaces are geometry/palette variants; ice, volcanic and toxic variants are available in the renderer. Appearance IDs containing `moon` and `companion` select the cratered moon treatment. This does not spawn additional bodies or invent undiscovered moons. The existing private three-landmark server fixture is unchanged.

Ocean, ice and toxic weather uses a separate 40³ sampled shell of merged cloud blocks. It rotates in the body's local frame with at most 10 Hz phase changes; reduced motion freezes its phase. Geometry is generated once on admission and released on removal, with no per-frame voxel uploads, per-voxel scene nodes, colliders or physics. Thin atmosphere glow remains a restrained presentation shell, not volumetric scattering or a cloud-shadow simulation. Stars retain their earlier corona shader, and physical asteroid GLB clones retain their server contact mapping.

Deterministic tests cover seed replay/variation, bounded resolution, topology arrays and cloud-shell placement. For seeds 17, 38 and 68 across six tested styles, terrain stays below 16,000 quads and weather below 6,000 quads each. Ocean seed 17 has 9,636 terrain quads and 2,170 cloud quads: two opaque batches, plus the atmosphere shell. These are geometry budgets, not hardware frame-rate measurements. Surface variants are art studies inspired by `reference/art/planets.png`; detailed trees, settlements, true volumetric fog, dynamic cloud shadows and astronomical LOD remain open.

2026-09-08 contact review correction: the conservative advancement iteration limit now returns an explicitly unconfirmed safe time. The solver advances only to that time, freezes the remaining substep and reports exhaustion without applying an impulse. A regression covers a fast grazing near-miss with a 1 mm separation; a separate clear pass must consume its full step without exhaustion. Iteration-budget exhaustion is not proof of a physical collision.


## 2026-09-08 authoritative sprint intent

The canonical input reducer accepts a boolean `sprint` intent, never a client-selected speed. The fixed 60 Hz walking step chooses 2.5 m/s walking or the provisional 4.5 m/s sprint speed, normalizes diagonal input, and runs the same cabin boundaries and partition collision checks. Piloting and ship thrust are unaffected. The private persisted character row owns `sprinting`; the existing owner-filtered character view replicates it for animation only after actual server-processed displacement. Seated characters cannot sprint. Zero movement, collision-blocked motion, the 300 ms input timeout, station interaction and disconnect clear the state.

`input.sprint` and `character.sprinting` are canonical additive boolean columns with explicit false defaults. No new side table, public input view or account state is introduced. Applying the schema to an existing laboratory requires inspection of the database's additive migration plan; this change does not authorize a normal database reset. Pure tests cover fixed speeds, diagonal normalization and sprint collision. The isolated smoke includes sprint activation, zero-motion/timeout/station reset and seated rejection; its runtime execution remains part of the final integration gate.

## Parameterized planet authoring extension

The seven-style study above is superseded by version-1 planet recipes covering all nine reference families plus moon. Genesis in the independent dashboard (`/planets`) exposes seeds, bounded detail, surface relief, mountains/spires, sea level, moving block weather, palette, rings and deposit radiance, with local JSON import/export. Surface data remain presentation only. Runtime appearance changes rebuild the existing body mesh without changing its authoritative position or identity. The layered cube-face generator uses projected-size LOD and explicit face budgets with deterministic detail fallback; the earlier six-entry cache applies only to its legacy mesher. Composable vegetation, volcanic, crystal, smoke and atmosphere controls combine independently of family. Luminous deposits use actual emissive meshes with restricted bloom and at most two short-range celestial lights per environment. See [planet generator iteration](planet_generator_iteration.md) for source mapping, measured geometry budgets, limitations and browser acceptance status.
