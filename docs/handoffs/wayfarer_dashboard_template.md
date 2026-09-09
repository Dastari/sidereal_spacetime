# Wayfarer: new editable Shipyard draft

2026-09-10 · implemented in source; dashboard browser acceptance pending.

The Shipyard **New → Wayfarer template · current native layout** action forks the pinned semantic Wayfarer into a new local document. It does not publish a blueprint, spawn an instance or refit a live ship.

Source: `wayfarer-semantic-candidate-r001`, canonical construction SHA-256 `362f37217f63a44a470676f104c8368bd0973ca03f5e29eab190bc4d6df71340`. The vendored document is `apps/dashboard/src/shipyard/layout/templates/wayfarer-r001.json`. The adapter validates the construction document and exact canonical hash before using it. Its 51 semantic floor records plus 211 authored assembly placements retain all 262 placed IDs, native revision references and transforms. The one existing deck retains its 73 native roof pieces; the semantic generated-roof flag remains false to avoid duplicating them.

Each fork receives a fresh local draft UUID. It has no live source binding. A `template-origin:wayfarer-semantic-candidate-r001` dependency records the source hash; this provenance is not a collision/gameplay qualification for edited output. Floor changes, extra decks, moved objects and any later publication still require their appropriate validators and runtime integration.

Before adoption, the current in-memory history and camera/layers are saved to the current account/document recovery key using the existing compare-and-swap check. Recovery/conflict state, concurrent writes, storage failure and identity collision prevent the switch. Other saved drafts stay in storage. The new draft then uses the existing undo/redo/autosave/export machinery.

## Current authoring boundaries

- Structure supports up to eight authored deck records, selecting a deck, editing ceiling height, floor shapes and generated boundaries. Arbitrary authored decks do not automatically become qualified playable traversal spaces.
- The template includes the current native cockpit, floors, roof and equipment placements. It is an editable copy of the qualified source, not a new live qualification.
- Objects/Rooms expose equipment and cargo catalog visual references. Bounds are draft footprints; placement alone does not install powered systems or inventory capacity.
- Hull/exterior and layer controls remain the existing editor paths. The template action adds no live reducer calls and no publish/refit shortcut.

## Validation and browser checklist

Focused tests cover exact pin/placement preservation, independent copies, tamper rejection, saving an unsaved proposal, conflict/recovery refusal and quota failure. Focused template/state tests passed (8 tests in 2 files), full typecheck passed, and the independent dashboard build passed. New adapter/tests pass ESLint. Final combined release validation and real browser acceptance remain pending.

For the actual dashboard browser review:

1. Open `/shipyard`, make a recognizable unsaved edit, then New → Wayfarer template.
2. Verify a new local draft identity, current cockpit outline and 262 source placements; inspect native 3D preview with roof on/off.
3. Reopen the prior saved draft and verify the unsaved edit was checkpointed. Return to the Wayfarer fork and verify its independent identity.
4. Add/select another authored deck, place a floor and interior visual object, then undo and reload. Verify the original source and prior draft remain unchanged.
5. Confirm no publication, spawn or live-refit request occurred. Record the exact browser artifact; passing pure tests is not visual acceptance.
