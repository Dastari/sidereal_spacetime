# ui.character-status-and-equipment

**Replacement model direction:** author Blender meshes and materials; TypeScript voxel-solid art is being phased out. Preserve authored visual surfaces and keep required gameplay proxies separate. Read [the migration contract](../../../../docs/blender_asset_migration.md) and [workflow](../../WORKFLOW.md).

Stable asset UUID: `2d1cc8d3-7dbc-5d48-b3dc-8e7bfa65cff1`

Current design revision: **r005**. State: **awaiting-owner**. Owner final sign-off for current revision: **NO**.

Explicit canonical target selected from a production family. Owner requests a coherent live character, stats, equipment frame and action-bar redesign using ui-elements-5 and ui-elements-3. This dedicated native UI design retains these four canonical vital references; broader frame/paper-doll/action references are supplemental source coverage recorded in its specification.

[Canonical machine-readable ledger](design.json) · [Agent workflow](../../WORKFLOW.md)

## Revision history

### r000 — reference-only

Owner requests a coherent live character, stats, equipment frame and action-bar redesign using ui-elements-5 and ui-elements-3. This dedicated native UI design retains these four canonical vital references; broader frame/paper-doll/action references are supplemental source coverage recorded in its specification.

Hypothesis: No reconstruction yet.

Review: No completed review.

No reconstruction, Blender or runtime evidence saved for this revision.

### r001 — changes-requested

Reference-led Canvas2D character sheet, rarity frames, eight-position action bar, two quick slots and native character hologram preview

Hypothesis: A three-column character/equipment/stats layout, thin projected cyan rings and distinct double-inset rarity frames reproduce the references while preserving existing authoritative inventory operations.

Review: {"outcome": "fail", "notes": "Initial integrated pass needs four visual refinements and real whole-client inventory/compact/rotation validation. Preserve initial image with shared cargo loading error.", "recorded_at": "2026-09-08T13:23:20.858038+00:00"}

- [native-source](revisions/r001/native-source.zip) — dc3da38eb64f085db2f865420f48fabb8ce9fe6157184a64ced6f6c5dd363759; Initial native UI and effect code checkpoint; final screenshot uses earlier loaded module before rarity accessibility text additions.
- [ui-desktop](revisions/r001/ui-desktop.png) — dd6f1ecfe7e9b9abea3b2b39a9928b7dd66270ca2e7b37687ef363b95cea59cc;

### r002 — changes-requested

Correct footer clipping, align stat values, clarify action states and improve equipment silhouettes; fix cargo vertex-channel batching blocker

Hypothesis: These targeted refinements improve reference scanability and polish while restoring the actual game scene for independent acceptance.

Review: {"outcome": "fail", "notes": "Desktop matches; full check231tests/docs and buildpass; compactportrait and stale detail need responsive lifecycle refinement.", "recorded_at": "2026-09-08T13:35:49.305976+00:00"}

- [native-source](revisions/r002/native-source.zip) — 4503ddb87ee5d751a04c680b5e16e570bfb071e67fea6df3e9311688077b3c2b;
- [ui-desktop](revisions/r002/ui-desktop.png) — 363d960ad2d0fbdcd43798394046514e49101cdeeac1c302587f981dcaf417a2;
- [ui-small](revisions/r002/ui-small.png) — be0fd4d16b0515313f1163bb19444e9c869d10c997b016e5ca020eb71018be62;
- [build-log](revisions/r002/build-log.log) — ae42c1bdd985da7a391094c726b852fd248f4745abbeebe5c5ca111d1fe7d76f;

### r003 — awaiting-owner

Fit portrait/disc/rotation controls to short viewports and allow item detail dismissal; clear selection when all inventory windows close

Hypothesis: Fullbody and projected rings remain visible on a compact screen, and old item detail no longer obscures later character inspection.

Review: {"outcome": "pass", "notes": "Suitable reference match accepted independently after three recorded iterations. Final desktop/compact, real inventory and hotbar/quick-slot actions, motion/rotation and hidden lifecycle checks pass. npm run check236tests/docs, npm run build and npm run art:check pass. Live UI integration explicitly owner-authorized and implemented; exact owner final art sign-off remains unset.", "recorded_at": "2026-09-08T13:47:26.841488+00:00"}

- [native-source](revisions/r003/native-source.zip) — 37d59b94bbc9c31cf3b4d28fe001717fb6aaf48b16105e986d46c4b6432f485d; Editable native Canvas2D and effect modules plus independent review/handoff
- [ui-desktop](revisions/r003/ui-desktop.png) — bf39ee03994a2294e99f6246f51c1cc72ca228f285c4b8f287671c06e64e8c55; 1920x1080; character/equipment/stats and bottom action/quick bars
- [ui-small](revisions/r003/ui-small.png) — 9c1b3e6dd48f0ccce3d801e09eb0a6063662328229dbf9ee3eb73884e1079693; 700x580; full portrait/disc and rotation controls; sections scroll
- [runtime-context](revisions/r003/runtime-context.png) — eaf3fa5b22dd225c1dcd8e11a3abf1f75a9708b582f0af7adcbb0071d037f160; 1920x1080; loaded actual ship, actual owned items, Rare textual detail and dismiss
- [comparison](revisions/r003/comparison.png) — 7e8d1c10ae99c93e4c177688237431509551c4c85ef6a098bf0d8cc935c5dc4d; Actual production components/published thumbnails; four rarities and all selected/focus/disabled/empty states; explicitly presentation examples, not live ownership
- [capture-record](revisions/r003/capture-record.zip) — be996ffe79ad1329b7ae05a49a5420a508f96427cfdc23c91cec9d3dd77f5f3d; Every meaningful r001-r003 capture, earlier hologram/frame attempts, browser/validation logs and previous source bundles; failed/incomplete loading captures retain their original names
- [recipe](revisions/r003/recipe.zip) — c9c15d4045c59f17362c0eecb0a126901d30878156135250f739ea154e8e7897; Reproducible browser capture recipes; review-only hooks never modify production state
- [specification](revisions/r003/specification.json) — 09afba619330ecedb62c84188355547b5c7e79530aa6b297b905e1687af3e22e; Refined native UI, shader, dimensions, units and proposed/implemented authority boundaries
- [validation](revisions/r003/validation.json) — c15004f5abdbf17a8384e311f53397377b217550eff42b595dcf47cc55c41711; 236 tests/docs, full build, art validation, actual inventory/rotation/reduced-motion/hidden lifecycle checks and independent acceptance
- [build-log](revisions/r003/build-log.log) — 182a8df2a921f9ae3b86cab34c7b01f883ec9839580f9b54205c40474f63e1c6; Final whole-repository build; independent client and dashboard outputs; no database publication

### r004 — awaiting-owner

Inventory interaction and visual quality-of-life pass: icon-only items, hover cards, quick transfers, context actions, ground loot and separate character tabs.

Hypothesis: Consistent independent windows and a cursor-held item model remove accidental inspectors and make transfers predictable; richer hover cards carry the detail instead of tiny item captions.

Review: {"outcome": "pass", "notes": "Independent Astra reviewer character_art_review assessed the final connected/public screenshots against the owner references and judged this suitable for the live QoL iteration. Full check (548 tests), build, art validation, isolated authority smoke and connected interactions passed. Minor narrow label/hint polish and scope limitations remain in docs/handoffs/inventory_qol.md. Publication is owner-authorized; exact-revision artistic sign-off remains unset.", "recorded_at": "2026-09-09T08:26:28.518625+00:00"}

- [native-source](revisions/r004/native-source.zip) — 5b040eb0816d6aaa1971da5cf652b56b0b2435194fc3919e38d7c88d8034c0bb; Inventory QoL iteration; see handoff, validation and independent review. Covers only explicitly listed reference appearances.
- [validation](revisions/r004/validation.json) — b4b8c7d21bff2f8623b8c8555a79fc727188d4cc8e7476ab2e3bf9b53f7d05fc; Inventory QoL iteration; see handoff, validation and independent review. Covers only explicitly listed reference appearances.
- [ui-desktop](revisions/r004/ui-desktop.png) — 7c948a7cc187c080764ef09477b9d9b65aeaa576472fda1c913764afe5141022; Inventory QoL iteration; see handoff, validation and independent review. Covers only explicitly listed reference appearances.
- [ui-small](revisions/r004/ui-small.png) — 920ce5116caa5958a6df315bb5e4ce5f9654d35dfc667902c6ca7bfbecfc0350; Inventory QoL iteration; see handoff, validation and independent review. Covers only explicitly listed reference appearances.
- [comparison](revisions/r004/comparison.png) — 325c48e8c3a9e9c1df9825487280202091620bc12d4217a1fb4c8b197372665c; Inventory QoL iteration; see handoff, validation and independent review. Covers only explicitly listed reference appearances.
- [runtime-context](revisions/r004/runtime-context.png) — 3400ae9036e353921a3209a49ca9cd7872e14c9a0ad0e5601e3877cfe8d1c73d; Inventory QoL iteration; see handoff, validation and independent review. Covers only explicitly listed reference appearances.
- [capture-record](revisions/r004/capture-record.zip) — c719f2e1568db30c2b4f628ad880f044428784c66114a9d739f7ee2ad7449cf3; Inventory QoL iteration; see handoff, validation and independent review. Covers only explicitly listed reference appearances.
- [build-log](revisions/r004/build-log.zip) — 1e51656b2b3fb8b2f47d1d9fa2ac277c8ef7bb4f72b6bd5bada44265dc0af7d8; Inventory QoL iteration; see handoff, validation and independent review. Covers only explicitly listed reference appearances.

### r005 — awaiting-owner

Keep cosmetics in Escape Crew, add hair and skin swatches there, and improve equipment window fit.

Hypothesis: Removing duplicate cosmetic controls and their footer gives equipment more room; persistent color swatches reuse supported skin/hair material roles.

Review: {"outcome": "pass", "notes": "Implemented owner-requested fixed-cell inventory/header polish, validated Store all and character cosmetics. Full check passes 635 tests; build and isolated authority smoke pass. Connected browser persisted colors and transferred five items, then restored all 71 placements and the original appearance. Independent Astra reviewer found no blocking desktop layout issues; root also checked compact behavior and the exact public bundle. Future belt/trouser storage remains dependent on authored capacity and normal authority provisioning. See docs/handoffs/inventory_tetris_and_polish.md. Ready for owner review, without final artistic sign-off.", "recorded_at": "2026-09-09T10:15:46.049521+00:00"}

- [native-source](revisions/r005/native-source.zip) — 28f0974bd23070d22b5065a0a4c1a226546c6adff7a5ba878c3ba92cadfd4a91; Owner-requested inventory/character polish; implementation and limits in docs/handoffs/inventory_tetris_and_polish.md. Exact coverage only; final sign-off unset.
- [validation](revisions/r005/validation.json) — 1712ef25cd545194714e1e9ccfe2227449b5efa52317b4b116a1e0e558dc1c67; Owner-requested inventory/character polish; implementation and limits in docs/handoffs/inventory_tetris_and_polish.md. Exact coverage only; final sign-off unset.
- [capture-record](revisions/r005/capture-record.zip) — d5ff367cc0a01e20915b86e57fb5b0ac8d948d63d75c2d79be9ae8f411c60afa; Owner-requested inventory/character polish; implementation and limits in docs/handoffs/inventory_tetris_and_polish.md. Exact coverage only; final sign-off unset.
- [build-log](revisions/r005/build-log.zip) — c5df78bb5bbf61cc9ca81d4461090c4fe9a23ed6d5df1cc158074549ee03303d; Owner-requested inventory/character polish; implementation and limits in docs/handoffs/inventory_tetris_and_polish.md. Exact coverage only; final sign-off unset.
- [ui-desktop](revisions/r005/ui-desktop.png) — d3c4cc0d7fd95c63c893083529f9ee28f98277f5c0ca2b9bf1fb9ac85cf69a45; Owner-requested inventory/character polish; implementation and limits in docs/handoffs/inventory_tetris_and_polish.md. Exact coverage only; final sign-off unset.
- [ui-small](revisions/r005/ui-small.png) — f55e592fbe04164d8fdf2b6d94a562f7ef9d8ecb8d7c17f5dd0bc4a04fb57f54; Owner-requested inventory/character polish; implementation and limits in docs/handoffs/inventory_tetris_and_polish.md. Exact coverage only; final sign-off unset.
- [comparison](revisions/r005/comparison.png) — 8c639dff03ab0c1d7762cb0bd5aa2efdb6aff89e1ef181aabb6a1e85d66d1427; Owner-requested inventory/character polish; implementation and limits in docs/handoffs/inventory_tetris_and_polish.md. Exact coverage only; final sign-off unset.

## Feedback and approvals

```json
{
  "feedback": [
    {
      "revision": 1,
      "author": "agent",
      "text": "Independent reviewer: suitable broad reference language, but footer clips; put desktop stat values on same line; increase empty action glyph legibility while accurately unassigned; replace generic appearance blocks with recognizable silhouettes; resolve shared cargo loader exception. See docs/handoffs/ui_reference_review.md.",
      "message_reference": null,
      "recorded_at": "2026-09-08T13:23:20.584518+00:00",
      "resolved_by_revision": 2
    },
    {
      "revision": 2,
      "author": "agent",
      "text": "Desktop reference refinements accepted independently. Actual700x580 compact review exposes fixed portrait height clipping boots/disc and stale selected-item detail covering bottomofcharacter/stats after inventoryclosed. Reducedmotion PNG is stable and requestedturn works. Next fit portrait to short viewport and make selection detail dismissible/clear on finalwindowclose.",
      "message_reference": null,
      "recorded_at": "2026-09-08T13:35:49.021647+00:00",
      "resolved_by_revision": 3
    },
    {
      "revision": 3,
      "author": "owner",
      "text": "Once done feel free to implement the UI live in the game without any authority required from me. This is to be a compeltely autonomous process between you and the sub agents.",
      "message_reference": "User message in this conversation, 2026-09-08: UI/character/hotbar/stats/paper doll reference redesign request",
      "recorded_at": "2026-09-08T13:40:32.408570+00:00",
      "resolved_by_revision": null
    },
    {
      "revision": 3,
      "author": "agent",
      "text": "Independent ui_reference_review: r003 is a suitable reference match; no further blocking UI refinements. Desktop and compact layouts, actual item rarity/details, four-rarity gallery, full-body projected disc/rotation, reduced-motion and item-detail dismissal/clearing accepted. This is implementation acceptance, not owner final art sign-off.",
      "message_reference": null,
      "recorded_at": "2026-09-08T13:47:26.575829+00:00",
      "resolved_by_revision": 3
    },
    {
      "revision": 4,
      "author": "agent",
      "text": "Equipment and Stats & details are separate tabs, occupied equipment uses icon-only rarity frames, and independent window sizing preserves storage layout. Existing r008 character preview and r002 equipment remain installed. Independent Astra review passes the live QoL iteration; minor narrow rarity label and instruction wrapping remain. See docs/handoffs/inventory_qol.md and inventory_qol_review.md. Coverage is limited to the revision-listed status/equipment references.",
      "message_reference": null,
      "recorded_at": "2026-09-09T08:26:28.244740+00:00",
      "resolved_by_revision": null
    },
    {
      "revision": 5,
      "author": "owner",
      "text": "Also get rid of \"Body & Hair ...soiemthing\" message at the3 bottom after the inventory screen..  Get rid of the \"Body\" and \"Hair\" choice from the equipment menu (leave it back in the crew \"escape\" menu)\n\nAdd different color hair picker, as well as skin tone picker (not sure if thats posisble)\nAlso make thje charcter window JUST slightly higher so it always doesnt feel like it needs to scroll on the default size.\n\nInventory is \"ghost\" like icons when I drag it (is this a non-server acceptance of the inventory transition?)\nGet rid of the \"Click to pickup\" Message a the bottom of the inventory grids. Optimize the storage header. Get rid of the \"14 ittems 14 x 14 slots\" description on inventory grids. Retain the capacity but make it a progress bar exactly like it is in the player inventory.\n\nI basically just want the take all button on the left of the storage header, and the weight/capapcity progress bar on the right (this is the bar just above the inventory grid)\n\nThe players inventory should have a \"STORE ALL\" if a transferable inventory is open. Again get rid of the players \"4 items 8x8 slots\"\n\nGet rid of the \"Pilot backpack storage\" button as well. that seems redundant as we have \"Backpack\" at the top. Eventually we should show each inventory of each armor piece on this grid.. As belt/trousers might also offer some small storage on certain armor (this should be a stat that is on the tooltip)",
      "message_reference": "Owner message in inventory QoL conversation, 2026-09-09, headers/Store all/crew colors with two attached inventory screenshots",
      "recorded_at": "2026-09-09T10:08:37.758670+00:00",
      "resolved_by_revision": 5
    },
    {
      "revision": 5,
      "author": "agent",
      "text": "Implemented owner-requested fixed-cell inventory/header polish, validated Store all and character cosmetics. Full check passes 635 tests; build and isolated authority smoke pass. Connected browser persisted colors and transferred five items, then restored all 71 placements and the original appearance. Independent Astra reviewer found no blocking desktop layout issues; root also checked compact behavior and the exact public bundle. Future belt/trouser storage remains dependent on authored capacity and normal authority provisioning. See docs/handoffs/inventory_tetris_and_polish.md. Ready for owner review, without final artistic sign-off.",
      "message_reference": null,
      "recorded_at": "2026-09-09T10:15:45.735602+00:00",
      "resolved_by_revision": null
    }
  ],
  "approvals": [
    {
      "revision": 3,
      "scope": "runtime UI integration after suitable independent review; not final art sign-off",
      "owner_quote": "Once done feel free to implement the UI live in the game without any authority required from me. This is to be a compeltely autonomous process between you and the sub agents.",
      "message_reference": "User message in this conversation, 2026-09-08: UI/character/hotbar/stats/paper doll reference redesign request",
      "recorded_at": "2026-09-08T13:47:26.761405+00:00",
      "condition_satisfied": "Independent ui_reference_review accepted r003; actual browser interactions and final checks passed",
      "implementation": "Client source integrated and client application built; no normal database reset/migration",
      "evidence_hashes": {
        "designs/ui.character-status-and-equipment/revisions/r003/native-source.zip": "37d59b94bbc9c31cf3b4d28fe001717fb6aaf48b16105e986d46c4b6432f485d",
        "designs/ui.character-status-and-equipment/revisions/r003/ui-desktop.png": "bf39ee03994a2294e99f6246f51c1cc72ca228f285c4b8f287671c06e64e8c55",
        "designs/ui.character-status-and-equipment/revisions/r003/ui-small.png": "9c1b3e6dd48f0ccce3d801e09eb0a6063662328229dbf9ee3eb73884e1079693",
        "designs/ui.character-status-and-equipment/revisions/r003/runtime-context.png": "eaf3fa5b22dd225c1dcd8e11a3abf1f75a9708b582f0af7adcbb0071d037f160",
        "designs/ui.character-status-and-equipment/revisions/r003/comparison.png": "7e8d1c10ae99c93e4c177688237431509551c4c85ef6a098bf0d8cc935c5dc4d",
        "designs/ui.character-status-and-equipment/revisions/r003/capture-record.zip": "be996ffe79ad1329b7ae05a49a5420a508f96427cfdc23c91cec9d3dd77f5f3d",
        "designs/ui.character-status-and-equipment/revisions/r003/recipe.zip": "c9c15d4045c59f17362c0eecb0a126901d30878156135250f739ea154e8e7897",
        "designs/ui.character-status-and-equipment/revisions/r003/specification.json": "09afba619330ecedb62c84188355547b5c7e79530aa6b297b905e1687af3e22e",
        "designs/ui.character-status-and-equipment/revisions/r003/validation.json": "c15004f5abdbf17a8384e311f53397377b217550eff42b595dcf47cc55c41711",
        "designs/ui.character-status-and-equipment/revisions/r003/build-log.log": "182a8df2a921f9ae3b86cab34c7b01f883ec9839580f9b54205c40474f63e1c6"
      }
    }
  ],
  "owner_final_signoff": null
}
```

## Source appearances and candidate variants

Keep every crop. Similar function does not prove identical geometry; split this family into separate designs when needed. Each approval must state exactly which reference IDs/variants it covers. Historical/baseline appearances can remain comparison-only and do not need reproduction as current target art.

| Reference | Kind | Brief |
| --- | --- | --- |
| [Health core status](../../assets/ui-elements-5--health-core-status/revisions/r000/reference.png) | object | [Scale, stats, recreation](../../assets/ui-elements-5--health-core-status/BRIEF.md) |
| [Shield core status](../../assets/ui-elements-5--shield-core-status/revisions/r000/reference.png) | object | [Scale, stats, recreation](../../assets/ui-elements-5--shield-core-status/BRIEF.md) |
| [Energy core status](../../assets/ui-elements-5--energy-core-status/revisions/r000/reference.png) | object | [Scale, stats, recreation](../../assets/ui-elements-5--energy-core-status/BRIEF.md) |
| [Stamina core status](../../assets/ui-elements-5--stamina-core-status/revisions/r000/reference.png) | object | [Scale, stats, recreation](../../assets/ui-elements-5--stamina-core-status/BRIEF.md) |
