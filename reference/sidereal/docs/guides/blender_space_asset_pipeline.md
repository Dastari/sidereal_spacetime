# Blender Space Asset Pipeline

Status: Active
Lifecycle: guide
Category: guide
Last updated: 2026-09-07
Owners: art tooling + content
Scope: Reproduce the local Blender MCP asset prototype and inspect its exports.
Source of truth: yes
Supersedes: n/a
Superseded by: n/a
Primary references:
- docs/plans/active/modular_space_assets_and_interiors_plan_2026-09-06.md
- docs/reports/audits/modular_space_assets_audit_2026-09-06.md
- docs/features/active/asset_delivery_contract.md

## 1. Working setup — 2026-09-06

The machine has Blender 4.3.2, Xvfb and Python 3.13. The setup required installing
the distribution's `python3.13-venv` package; another host needs its matching
Python venv package plus Blender, Xvfb/xauth and DejaVu fonts. The reviewed MCP
revision and skill sources are recorded in `scripts/art/provenance.json`.

```bash
scripts/siderealctl setup-blender
scripts/siderealctl art-build --probe
scripts/siderealctl art-build
scripts/siderealctl art-check
```

`setup-blender` creates `.art-tools/venv`, installs the pinned upstream Blender
MCP source and art dependencies, and records the resolved packages under
`.art-tools/installed-requirements.txt`. It does not upgrade Blender or modify
the game dependency lockfiles. Re-run only when setting up or repairing this art
environment. A build can take several minutes; inspect `logs/blender-art-build.log`
and the output directory's `mcp.log` when diagnosing a failure.

`art-build` starts an isolated Blender GUI under a virtual display, initializes
the actual upstream stdio MCP server, inspects the scene, executes the geometry
and export code through MCP, then packs the rendered frames. It closes the MCP,
Blender and display processes afterward. `--pack-only` reuses saved render files
and `source_manifest.json`; it cannot incorporate geometry or material changes.

## 2. MCP host integration

`.mcp.json` supplies a project MCP entry whose command is
`/root/sidereal/scripts/siderealctl art-mcp`. MCP hosts that consume that format
can load it on their next configuration refresh/session. For another host, add
that same stdio command using its configuration UI. Update the absolute workspace
path if the repository moves. This session verified MCP with the Python MCP
client; it does not claim that newly configured tools hot-loaded into the agent's
existing tool list.

All authoring environment comes from `[service.blender-art]` in `dev.toml`.
Interactive MCP uses loopback port 9876. Build jobs use the inheriting
`blender-art-build` configuration on 9877 so an interactive session and an export
job do not compete for one Blender scene. A second job on an occupied port is
refused. The art services are outside gameplay profiles and do not restart the
game. Use the task commands, rather than adding Blender to a public stack profile.

The upstream add-on executes Python. The project binds it to loopback, disables
telemetry and enables upstream safe mode. It starts from factory settings and
does not install an auto-running add-on into the user's existing Blender profile.
The script uses rendering/saving operators permitted in safe mode. External asset
services and their credentials are not needed or enabled by this pipeline.

## 3. Source and output

| Source | Purpose |
|---|---|
| `scripts/art/space_tiles_scene.py` | Base geometry, named materials, physical units and frame packing |
| `scripts/art/space_tiles_expansion.py` | Angled hull families, multi-cell equipment/freight and airlocks |
| `scripts/art/themes.json` | Six reusable semantic palettes and faction shape directions |
| `scripts/art/space_tiles_render.py` | Orthographic albedo, normal and themed emission export |
| `scripts/art/space_assembly_scene.py` | Lit 3D presentation studies from the same geometry |
| `scripts/art/pack_tiles.py` | PNG frames, atlas extrusion, manifests, animation previews and contact sheets |
| `scripts/art/preview.py`, `preview.html` | Offline catalogue, palette switching and assembly/scale mock-up |

Output defaults to `artifacts/space_tiles` through `SIDEREAL_ART_OUTPUT` in
`dev.toml`. Open `index.html` locally for the self-contained review board.
`industrial_kit.blend` retains editable tile collections; the `*_3d_study.blend`
files retain assembled scenes. `manifest.json` records frame rectangles, pivots,
physical sizes, conservative occupied cells, channel hashes, theme definitions
and animation sequences. The normal atlas is shared across themes. Atlas and
individual PNG exports are presentation candidates, not published game assets.

Each cell is 2 m / 64 px. Multi-cell pivots refer to the bottom-left anchor cell:
image X grows right, image Y grows down; local hull +Y grows up. Floor centres and
wall/door edge anchors are different. Angled art carries polygons and candidate
attachment directions; exact attachment spans and gameplay placement validation
remain part of the construction implementation. Artwork metadata does not grant
permission to place an otherwise invalid gameplay block.

Airlock previews contain eight opening frames and a reversed closing sequence.
They are visual timing data; server-owned door state will decide collision and
access when the gameplay system is implemented. APNG previews are supplied for
inspection, not as a requirement on the game client's animation decoder.

## 4. Iteration and publication

Use the semantic colour keys when extending a theme: structural dark/steel/panel/
edge ramps, faction accent, emissive colour and dark screen glass. Keep the same
palette while adding pieces. Shape directions distinguish naval spines, research
shells, salvage asymmetry, cargo pods and swept advanced hulls; the review board
demonstrates palette variants on shared geometry, not six completed faction fleets.

The base albedo is unlit. Inspect lit renders and normal maps before adding painted
shadows, because directional shadows baked into a rotating ship would rotate with
the texture. Read the pixel-art skill's palette/tile/export sections for cleanup
and the Blender modeling skill for named editable geometry. Library thumbnails
may shrink large parts for comparison; exported assets retain their physical scale.

Promote selected exports through the canonical content asset/package publisher,
then wire them to Shipyard definitions. Do not point the live client at this
artifact directory, write graph state from Blender, or bypass the gateway cache.
No asset publication, world reset or game-client release is performed by these
art tasks. Runtime integration and its acceptance gates are in the linked plan.

## 5. Physical engine pods and runtime import — 2026-09-06

The kit now includes 201 frames across six themes. Rocket pods have separate
pressure chambers, cooling bands, feed pipes and open bells; fusion and ion pods
use field coils. Shaded sprites use 32-sample CPU renders, nearest sampling and a
48-colour export palette. All channels share the canonical binary silhouette.
Each rendering RPC stays within the upstream timeout and safe mode: the next pass
restores plain metadata from the kit scene and uses existing Blender datablocks.

`siderealctl art-starter-content` copies sprites into `data/sprites/tiles/` and
writes editable canonical asset/block/hull packages. This is a source preparation
task, not a live-world writer. Existing assemblies keep their resolved geometry
when definitions change. Re-run intentionally: this regenerates the supplied
Wayfarer source packages. `siderealctl art-exhaust-preview` renders 24 frames of the
actual `runtime_effect.wgsl` through the project's GPU shader preview adapter into
`artifacts/space_tiles/exhaust_animation.png`. It is a review animation; the game
runs the shader continuously at independently commanded physical nozzles.

The initial client uses the shaded sprites, with Lighting V2 colour/intensity
modulation. The baked key follows the hull as it rotates; exported normal/emission
channels are retained for a subsequent normal-mapped material path. Walking,
interactive doors, runtime power/shield systems and ship damage/splitting are
separate gameplay work, not implied by the existence of their artwork.

2026-09-06: `art-starter-content` also writes `starter_layers.png` from the canonical hull packages and shipped sprites, showing the owner cutaway alongside the public roof. Regeneration preserves unchanged package revisions and advances revisions when definitions change.

## Connected exterior kit — 2026-09-06

Run `scripts/siderealctl art-exterior` to build the editable Blender scene and
render eleven larger armour-panel shapes, five decal motifs and 38 uppercase,
numeric and punctuation glyphs through the installed MCP session. Six faction
palettes produce 324 PNG/source packages. Review outputs are under
`artifacts/exterior/`; canonical authored source sprites/packages are under
`data/sprites/exterior/` and `data/content/assets/`. These original assets are
64 pixels per 2 m cell, nearest sampled, palette reduced and alpha masked.

`art-starter-content` records connected finishes and Wayfarer identification
markings in all six starter blueprints. The canonical gateway publisher validates
those sources; the live exterior action uses owner-shard commands and persistence
receipts. Blender never mutates a live world. Runtime plate coverage and text
placement are defined in the ship construction contract, independently of the
physical deck grid.

## Additional kit direction — 2026-09-07

The latest user-supplied top-down reference suggests a separate **Streamline**
working art direction: ivory/silver sculpted armour, long blue canopy insets,
concentric round power housings, copper/orange drive cores and paired narrow
engine nacelles. Treat it as shape inspiration for original modular geometry,
not a source sprite sheet. Keep the current six faction kits intact.

Proposed pieces include tapered rounded bows, curved shoulder transitions,
oval canopy sections, circular hub quadrants, long connected dorsal plates and
small/medium/large nacelles with matching junction collars. Use larger overlapping
visual plates over the physical square construction grid so the silhouette reads
as a continuous hull. The same top-down projection, cell scale, attachment rules,
private interior and public armour separation apply. This direction is recorded
for the next kit; it has not been modelled, exported or published yet.

## Continuous roof export — 2026-09-07

`art-exterior` now produces 100 parts per faction (600 source assets): eleven
opaque flush panels, 46 perimeter join overlays, five separate decal motifs and
38 glyphs. Roof material facets are deterministic emission albedo, so low-sample
path-tracer noise and lighting are not baked into repeated surfaces. Directional
trim shading is authored in the mesh palette; runtime exterior lighting remains
responsible for world illumination. The editable geometry is saved in
`artifacts/exterior/exterior.blend`.

The MCP build requires an explicit completion marker for every render; tool
transport success alone is insufficient. Atlas dimensions must match the current
manifest. All frames are staged and checked before canonical source sprites are
replaced. `art-check` verifies every roof pixel is opaque and every trim mask
matches its exposed edges/inward corners, along with dimensions, binary alpha,
faction silhouettes and canonical package references. This prevents failed
renders from reusing a previous atlas under a new manifest. Publication/reload
and live owner-shard application remain separate from Blender authoring.


2026-09-07 roof guns: `scripts/siderealctl art-turrets` builds original editable
Blender meshes through the isolated MCP build session, then exports separate
base/head/preview images for light, twin and heavy roof turrets in six palettes.
Review sources are in `artifacts/turrets`; source packages are promoted through
the existing gateway publisher. The build stages and validates all 54 transparent
images before writing canonical source assets; it never edits authoritative ships.
