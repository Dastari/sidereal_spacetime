# Shipyard editor integration — 2026-09-10

Status: implemented local authoring candidate; not a live ship refit or complete native construction release.

The owner approved an editable hull-size catalogue. Structure now provides create/edit/save/import/export controls with width, length and total height in metres. Catalogue entries are stored locally per editor identity with conflict detection; an applied size is a revision-pinned snapshot in the document. Existing drafts remain supported. The initial Wayfarer reference is 10 m wide × 22 m long × 3 m total envelope height, preserving its actual floor fit rather than inventing combat classes. Applying an undersized envelope is rejected atomically; floor/deck edits also enforce the selected envelope. No tile or inventory identity is removed to make a size fit.

The combined candidate also connects generated-wall selection, independent face finishes, exact native floor choices, and validated interior/exterior opening reservations. Floors, walls and roofs are protected from the ordinary object palette and placement mutations. Structural tools and Structure/Rooms/Systems mode entry choose Top and suitable default layers. Ordinary edits preserve manual visibility choices. Explicit Top is north-up; orbit/projection remains shared with the native preview. Systems draws actual placed equipment/cargo/engine footprints and names; native equipment solids are suppressed. It does not invent service ports, operational stats or binding authority. Selected native objects use the editor union silhouette mask instead of bounding boxes or triangle wireframes.

Creator routes now share a navy/cyan palette, header, controls and typography. Route-specific header overrides and the legacy assembly light palette were removed. Source provenance remains available in a collapsible panel. No mockup-only navigation or gameplay statistics were added.

## Integration checkpoints

- 3d6a1680 and a91b4ed0: semantic construction rules and exact native floor qualification.
- 877751db: editable catalogue, inspector controls and recovery compatibility.
- f22fee8b and bcbb45b2: preview layer policy, native silhouettes, north-up Top and revision guard.
- b75d412b: separate native wall batching evidence, not installed by this editor release.
- Parent integration: mode policy, shared theme, working canvas, hull/tool guards and Systems footprint projection; see this document's commit.

## Validation and evidence

- Combined npm run check: 1,451 tests in 239 files plus 77 document checks passed.
- npm run build: independent client and dashboard builds passed; existing large-bundle warnings remain.
- npm run art:check passed, including installed r009 characters and r003 handheld provenance. No art revision was approved by these tests.
- npm run smoke -- --smoke-name shipyard-structure --fresh-smoke passed on isolated sidereal-spacetime-dev-shipyard-structure-r0001-smoke; no production database reset or refit.
- Real browser: custom catalogue size saved/reloaded; a 2 m wide envelope rejected against all 51 Wayfarer floor tiles; reference size applied; external generated wall accepted a 1 m reserved opening; manual layer overrides survived a document edit and reload; stable normal mode transitions returned WebGL error 0. Header background/text/height matched across Workspaces, Components, Genesis, Shipyard and legacy assembly.
- Evidence under output/playwright/shipyard-owner-rules: hull-size-rejected.png, exterior-opening.png, objects-ready.png, systems-final.png, theme-workspace.png, theme-components.png, theme-planets.png and theme-assembly-ready.png. These are actual browser captures, not final concept-match approval.

## Remaining construction work

Generated native junctions and two-sided wall panels, actual door models/operation, opening-aware native wall assembly, complete subgrid pressure volumes, structural armor mounting qualifications, and bound equipment service ports/routes still require integration. A drawn opening does not cut the retained legacy visual assembly or make it a working airlock. Room labels still use whole-tile grouping; the structural compiler reports the limitation. Native floor material overrides cannot fabricate new PBR variants from a name. A source catalogue edit does not reconfigure an already applied snapshot automatically.

The browser catalogue is local authoring persistence, not a shared account-synchronised administrative catalogue. Export/import supports transfer. Publishing blueprints and live refitting remain separate server operations and are not enabled by this change. The existing canonical 362f Wayfarer and Dastari's live items/ship remain unchanged.

Hot replacement of a renderer while its old engine is asynchronously disposing may produce deleted-program warnings on the same canvas. A full reload and normal mode navigation passed with zero invalid operations. See shipyard_preview_layers_silhouette.md; do not describe that as an unresolved production repro or claim it was fixed.

Review: managed dashboard at http://sidereal.tail7a58a6.ts.net:5174/shipyard or its existing HTTPS 8445 origin. This working-source dashboard is distinct from the immutable public game client 20b3025f; no new public game release is claimed.

One repeat aggregate run timed out in the unrelated planet-terrain stress test while the software-GPU browser review was active (21.2 s against its 20 s timeout); this does not alter planet code. The final aggregate gate passed all 1,451 tests with the browser closed.

Dashboard build index SHA-256: `d283cb445e3d9e35bf593b499e5113967fedcfb71233b9bd140b1e56321f385b`. This identifies the built candidate, not a public game activation.
