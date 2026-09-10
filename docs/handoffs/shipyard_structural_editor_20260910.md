# Structural Shipyard tools and recovery integration

Status: working source integrated with the new pure construction contracts; parent is performing combined actual-browser acceptance. No world schema, live refit or construction-art approval is implied.

The Structure palette now includes an editable hull-size catalogue. Its initial neutral Wayfarer reference dimensions come from the shared content preset. Users can create/edit a size, save the catalogue definition, adjust its origin, and explicitly apply its versioned snapshot to a draft. Applying a hull uses `setHullEnvelope`, which clones, compiles and rejects overflow without moving/deleting any tile or object. Catalogue edits do not retroactively rewrite existing draft hull snapshots. Local catalogue saves use compare-and-swap; imports preserve the previous raw catalogue separately before replacing it. The palette's new-size action derives dimensions from current floor bounds and every deck ceiling instead of inventing class balance.

Rooms now exposes internal wall, door type/grid-span and structural subdivision controls. Parent's gesture wiring calls `placeStructuralOpening`, which selects the nearest actual shared-core `wallOpeningSlots` result and passes the proposal through `proposeWallOpening`. An arbitrary pointer position never becomes authoritative aperture geometry. The inspector's width/type/clearance changes use `changeStructuralOpening` and preserve opening UUID/slot while validating corner/junction/setback and sweep clearance. Exterior and interior openings both work. Diagonal door grid span and actual clear width are labelled separately. Removing an opening remains one undoable local edit.

`selectedWallKey` is optional in `LayoutPanelContext`; the inspector accepts compiled wall IDs, anchors or base wall keys. Generated exterior walls display their floor-derived status and cannot be individually deleted by these controls. Both faces have independent finish controls. Floor finishes and model overrides retain the floor identity/footprint. The model selector lists only `floorModelOptions(tile,deck.elevation)` and stores its exact native asset+revision, not a visual hash guessed from a general catalog. Unavailable saved revisions remain explicit choices until the user deliberately replaces or removes them.

`ViewState.structuralTools` is optional for old checkpoints; new saved preferences contain door grid span/type and wall-side/finish defaults. Missing `layers.exteriorHull` normalizes to true; malformed saved flags reject. Existing history/import/quarantine and local draft CAS remain intact. Pure helper tests cover saved old views, preference roundtrip, negative-coordinate/multi-deck hull fitting, competing catalogue writes, interior/exterior slots, corner rejection, stable UUID resize/undo/redo/recovery, undersized hull rejection, independent wall finishes and exact native floor style preservation.

Parent owns mode/view defaults, floor/partition gesture admission, perimeter selection, global Creator theme, object silhouette and Systems rendering. The shared core reports stale authored surface anchors explicitly after floor changes; these UI controls do not silently discard their metadata. Native wall junction/panel/door adapters and live pressure/damage qualification remain separate from design topology.

Focused gate:

```sh
npx vitest run apps/dashboard/src/shipyard/layout/structural-edits.test.ts apps/dashboard/src/shipyard/layout/structural-tools.test.ts apps/dashboard/src/shipyard/layout/hull-catalogue.test.ts apps/dashboard/src/shipyard/layout/state.test.ts
npx tsc --noEmit
```

Eleven focused tests passed before the combined browser gate. The new helper files pass the package-boundary lint rule. The narrow `@sidereal/ui/editor-controls` export preserves the existing root UI export.

## Compact workspace follow-up

The extracted `LayoutPalette` and `LayoutInspector` now prioritize active-deck selection and drawing. Hull limits have a compact current-name/dimensions summary with an explicit **Edit sizes** disclosure after the tools. Rooms exposes internal-wall drawing, selection, deletion and room-label deletion; the room-type list is a compact selector. The equipment library appears in Objects only. Selection UUIDs, door settings, wall rules, dimensions, deck properties and technical validation details no longer occupy the inspector/palette continuously. Parent owns the matching CSS and viewport redesign.

`panel-deletion.ts` resolves actual partition identity from compiled wall keys/anchors rather than parsing string prefixes. Internal-wall removal deletes its dependent openings, room-boundary references and wall-face metadata in one undoable edit, preserving floors, objects and unrelated metadata. Room-label removal changes only the room-label collection. Generated perimeter deletion rejects and directs the author to change the floor plan. Three new tests cover these behaviors with actual compiled geometry, immutable input and undo restoration; the related six-test gate, full TypeScript check and changed-file lint passed. Browser review and aggregate build/check are coordinated by the parent alongside the shell changes; this panel checkpoint alone is not their completion claim.
