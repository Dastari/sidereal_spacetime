# Independent Astra visual audit — 2026-09-14

Reviewer: `/root/planet_visual_reviewer`. Read-only review of saved images; no new browser capture or performance measurement. Agent working acceptance is separate from owner approval.

## Evidence inspected

- Full original `reference/art/planets.png`.
- Exact r000 main-world crops under `assets/art-library/assets/planets--{rocky-world,temperate-world,desert-world,ice-world,volcanic-world,ringed-gas-giant,ocean-world,toxic-world,crystal-world}/revisions/r000/reference.png`.
- Historical `output/playwright/planet-family-comparison-final.png`. Its filename is not final owner approval and it predates native ice/volcanic integration.
- `assets/art-library/designs/environment.planet.ice/revisions/r015/{comparison.png,runtime-context.png,capture-record.json}`.
- `assets/art-library/designs/environment.planet.volcanic/revisions/r018/{comparison.png,runtime-context.png,capture-record.json}`.

The ice/volcanic comparison-board left columns are their old renderers; middle columns are r015/r018. Runtime-context images confirm those candidate shapes appeared in the game. The volcanic capture record explicitly used a manual presentation callback and one actual scene render while continuous rendering was paused, so it proves appearance only, not a settled animation or transition. Other families require fresh actual baselines before claiming current-state visual differences conclusively. Exact moon crops have not yet been reviewed and are not covered by this first audit.

## Highest priority differences

| Family | Observed gap against exact main-world crop | Next meaningful visual gate |
| --- | --- | --- |
| Desert | Historical actual is a uniformly noisy tan tile ball. Reference has extensive quiet cream/peach sand surfaces, a few very tall rust-colored mesa groups, canyon walls, dark burgundy depths and a warm directional rim. | Authored 3–5 dominant mesa groups and one readable canyon, with clearly separated sand and vertical rock. At small gameplay size it must read as a desert landscape rather than crust noise. |
| Rocky | Historical actual has shallow uniform plates and a few small holes. Reference is defined by several deep giant dark craters, broken shelves and a sparse connected warm seam crossing cold regolith. | Establish deep crater interiors and broken plate silhouettes at macro scale; keep warm seams sparse enough to avoid a volcanic identity. |
| Ocean | Historical actual has large connected green landmasses, making it hard to distinguish from temperate. Reference shows mostly uninterrupted rich blue ocean, tiny dramatic steep islands, cyan shelves and pale beaches. | Approximately 75–90% water in the reviewed hemisphere, coherent depth/shore hierarchy and clustered steep islands. Clouds must form substantial moisture bands rather than a sparse uniform chain. |
| Temperate | Historical actual has readable land/water but land is broadly flat, tree masses are even, water lacks rich shelf/depth separation, and clouds are small repeated blocks. Reference has tall cliff islands, clustered forest canopies and blue/cyan water with bright coastlines. | Preserve the working baseline while giving continents distinct elevation/cliff hierarchy, grouped canopy silhouettes and stronger coastal water response. |
| Ice | Native r015 has a real white-crust/blue-interior distinction, but the crust reads as overlapping rectangular cards and exposed blue cuts as wide flat radial ramps/fans. Reference has clustered slender glacial columns, deep blue shafts, rounder powder-snow fields and much richer cool optical depth. | Replace fan/ramp readings with coherent grouped faceted towers and deep shafts, with quiet snow plains. Preserve white diffuse snow versus blue glossy interior separation; bloom alone does not establish optical ice. |
| Volcanic | Native r018 improves lava fissure depth and adjacent warm spill. Its plate faces still show dense repeated tile/radial tessellation, the lava channels are broad smooth glowing cuts, and protrusions lack the reference's monumental cliff/vent hierarchy. Smoke is visibly a few voxel puffs. | Broad quiet cobalt/charcoal plateau tops interrupted by vertical vents and connected winding lava rivers with white-yellow core/orange-red edge hierarchy. Retain contact AO and local spill. |
| Toxic | Historical actual is dark green/lime surface tiling with a smooth halo. Reference is dominated by coherent fluorescent low basins below tall nearly black chimney groups, and irregular fog banks breaking the limb. | A few monumental dark formation groups rising above connected chemical basins, localized green bounce, and irregular clustered fog rather than a uniform halo. |
| Crystal | Historical actual has many tiny pink spikes of similar size. Reference uses a few colossal elongated faceted clusters, secondary groups, charcoal geology, brilliant internal cores and magenta local influence. | Clearly tiered crystal scale hierarchy with 1–3 dominant clusters breaking the silhouette. Distinct dark rock and optical crystal surfaces; selective emission should light adjacent rock without flattening every face. |
| Ringed gas giant | Historical actual is small in its comparison framing, with repetitive wavy bands and very thin rings. Reference has large coherent vortices, broken multiscale latitudinal flow, broad layered ring bands/gaps and visible rocky ring debris. | Compare at normalized body size. Produce recognizable vortices and broad physical ring coverage with density variation; verify occlusion and ring/planet lighting without introducing per-rock draws. |

## Recommendation and review standard

Start with **Desert**. Its largest gap is observable authored shape and material hierarchy, so improvement can be demonstrated without a new transparency/fog feature. Build an editable Blender kit with deliberate broad sand surfaces, layered canyon walls and clustered mesas; do not refine the old TypeScript voxel generator as the visual authoring source.

A meaningful working pass must improve macro silhouette and material separation in an actual Babylon render at repeatable framing, then survive another camera angle and gameplay-size view. One improved hero shot is insufficient evidence for all procedural seeds. Preserve each failed iteration and its specific next correction. The reviewed main-world crop does not silently approve linked moon variants.

All nine families have open gaps in the inspected evidence. None receives new agent acceptance from this audit. Existing temperate interim acceptance and historical native working reviews remain historical decisions; none is exact-reference completion or owner sign-off.

## LOD review requirements

Keep authored hero features and material identity recognizable in every retained LOD. Reduce secondary placement density rather than erase the defining mesa, crater, cliff, glacial shaft or crystal group at a threshold. Verify close and small screenshots and record approach, retreat and sudden Map → Observe transitions. Worker composition, pre-threshold preparation, retained visible old nodes, shared compatible materials, precompilation, stale-result rejection and disposal remain mandatory under `docs/planet_lod_authoring.md`.

Still images cannot satisfy the no-missing-planet / no-transition-frame-over-20ms gate. That remains a separate hardware measurement, including F3 build/pending counters and frame JSON.
