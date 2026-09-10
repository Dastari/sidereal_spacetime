# shipyard.hull.shoulder-construction-interface

**Replacement model direction:** author Blender meshes and materials; TypeScript voxel-solid art is being phased out. Preserve authored visual surfaces and keep required gameplay proxies separate. Read [the migration contract](../../../../docs/blender_asset_migration.md) and [workflow](../../WORKFLOW.md).

Stable asset UUID: `15e14396-cbc2-5fb7-891c-e2f8ecf0b106`

Current design revision: **r000**. State: **in-progress**. Owner final sign-off for current revision: **NO**.

Native R006 polymer shoulder +r004 roof collar derivation: reserve an internal structural corner pocket, preserving exact outer surfaces, materials, source frames and originals.

[Canonical machine-readable ledger](design.json) · [Agent workflow](../../WORKFLOW.md)

## Revision history

### r000 — in-progress

Native pocket and separate reserved-volume operand in exact published Blender-derived surfaces; original editable masters retained in new source. Three attempts preserve tessellation diagnosis and final source-preserving derivation.

Hypothesis: Reserve structural outside-corner volume without per-placement compensation or changing outward armor details.

Review: No completed review.

- [runtime-candidate](revisions/r000/a001/baseline-collar.glb) — beb7fde687637ff8c033ab231b2f67eed67feff6a6da6179325e3bf6f29832b5; a003passes16native checks with exact raw surfaces outside pocket; a001/a002 preserve failed tessellation comparisons. No installed-game, whole-hull or final art approval claim.
- [runtime-candidate](revisions/r000/a001/baseline-shoulder.glb) — fd3e6688069957b69f8bfbe430111410469cdebab88952124f20e477081cad81; a003passes16native checks with exact raw surfaces outside pocket; a001/a002 preserve failed tessellation comparisons. No installed-game, whole-hull or final art approval claim.
- [editable-blender](revisions/r000/a001/blender-source.blend) — 42a2de95a3e301bce2a0f7f77826aed397c3bbf1df541447404964297d174073; a003passes16native checks with exact raw surfaces outside pocket; a001/a002 preserve failed tessellation comparisons. No installed-game, whole-hull or final art approval claim.
- [runtime-candidate](revisions/r000/a001/collar.glb) — 1c9f27314d976c6ec836280795501544b03870bdfd83cc1316955115f129efdc; a003passes16native checks with exact raw surfaces outside pocket; a001/a002 preserve failed tessellation comparisons. No installed-game, whole-hull or final art approval claim.
- [validation](revisions/r000/a001/delivery-manifest.json) — 0c12222259ded4c5a8da846d4828c241d93c91131fd7d9963d153ddf3abb0ada; a003passes16native checks with exact raw surfaces outside pocket; a001/a002 preserve failed tessellation comparisons. No installed-game, whole-hull or final art approval claim.
- [validation](revisions/r000/a001/qualification-a001.json) — e6056f352352854dcbba50ae01e0907c8db7edc48b4673dc77fb9f56422f4c40; a003passes16native checks with exact raw surfaces outside pocket; a001/a002 preserve failed tessellation comparisons. No installed-game, whole-hull or final art approval claim.
- [validation](revisions/r000/a001/qualification-a002.json) — 956cd9ea1e57a1338d87b2e9a7267a907750c57c4890665bd4e9d8e14f33d20a; a003passes16native checks with exact raw surfaces outside pocket; a001/a002 preserve failed tessellation comparisons. No installed-game, whole-hull or final art approval claim.
- [validation](revisions/r000/a001/qualification-a003.json) — 8f4d0f8b5e5e640b67b7da31c77799a073bbb85aee5189fb77c1dd0cc1c61230; a003passes16native checks with exact raw surfaces outside pocket; a001/a002 preserve failed tessellation comparisons. No installed-game, whole-hull or final art approval claim.
- [validation](revisions/r000/a001/qualification-a003.raw.txt) — c7c5cbf0cebd79d87907fdbefea9f890a9e4249c6bdd98cbcb933ff00c02f2b7; a003passes16native checks with exact raw surfaces outside pocket; a001/a002 preserve failed tessellation comparisons. No installed-game, whole-hull or final art approval claim.
- [validation](revisions/r000/a001/qualification-a004.json) — 3653a0c2b3d4ff25cb29bb592dca6cbe09a50e4ae7157e27dc5add2226c8e242; a003passes16native checks with exact raw surfaces outside pocket; a001/a002 preserve failed tessellation comparisons. No installed-game, whole-hull or final art approval claim.
- [validation](revisions/r000/a001/separate-pocket-proxy.json) — 2a90513406e07dd4afac9fc40719a1d1ae6cdb3ba903006246ea31cbbe847a3b; a003passes16native checks with exact raw surfaces outside pocket; a001/a002 preserve failed tessellation comparisons. No installed-game, whole-hull or final art approval claim.
- [runtime-candidate](revisions/r000/a001/shoulder.glb) — 2fdc309ecee5a7c4c8f32558dc29b583a54c30f5c8fed3193ac1215874e14b57; a003passes16native checks with exact raw surfaces outside pocket; a001/a002 preserve failed tessellation comparisons. No installed-game, whole-hull or final art approval claim.
- [runtime-candidate](revisions/r000/a002/baseline-collar.glb) — beb7fde687637ff8c033ab231b2f67eed67feff6a6da6179325e3bf6f29832b5; a003passes16native checks with exact raw surfaces outside pocket; a001/a002 preserve failed tessellation comparisons. No installed-game, whole-hull or final art approval claim.
- [runtime-candidate](revisions/r000/a002/baseline-shoulder.glb) — e3ffccfeac1b5bc1ae72e2e61aff538d5c46d6616075b0d7e924d0f993dd7696; a003passes16native checks with exact raw surfaces outside pocket; a001/a002 preserve failed tessellation comparisons. No installed-game, whole-hull or final art approval claim.
- [editable-blender](revisions/r000/a002/blender-source.blend) — 31a365882d73f74c77a47a845c7f33116d1f376788e09855b028a63fd7d84461; a003passes16native checks with exact raw surfaces outside pocket; a001/a002 preserve failed tessellation comparisons. No installed-game, whole-hull or final art approval claim.
- [runtime-candidate](revisions/r000/a002/collar.glb) — 1c9f27314d976c6ec836280795501544b03870bdfd83cc1316955115f129efdc; a003passes16native checks with exact raw surfaces outside pocket; a001/a002 preserve failed tessellation comparisons. No installed-game, whole-hull or final art approval claim.
- [validation](revisions/r000/a002/delivery-manifest.json) — 56805542baa9be293e39893bffe773d9504599a473bdaacf193f35dbcbde6e9e; a003passes16native checks with exact raw surfaces outside pocket; a001/a002 preserve failed tessellation comparisons. No installed-game, whole-hull or final art approval claim.
- [validation](revisions/r000/a002/qualification-a001.json) — 030bb8a197011122b753f03694fbe9826a1f83914676f5820c965b156526a4ac; a003passes16native checks with exact raw surfaces outside pocket; a001/a002 preserve failed tessellation comparisons. No installed-game, whole-hull or final art approval claim.
- [validation](revisions/r000/a002/separate-pocket-proxy.json) — 2a90513406e07dd4afac9fc40719a1d1ae6cdb3ba903006246ea31cbbe847a3b; a003passes16native checks with exact raw surfaces outside pocket; a001/a002 preserve failed tessellation comparisons. No installed-game, whole-hull or final art approval claim.
- [runtime-candidate](revisions/r000/a002/shoulder.glb) — d0d458055ea98157fa3c33f57e622243d0d0ca3e27c49a51f64bd60881618f4c; a003passes16native checks with exact raw surfaces outside pocket; a001/a002 preserve failed tessellation comparisons. No installed-game, whole-hull or final art approval claim.
- [runtime-candidate](revisions/r000/a003/baseline-collar.glb) — 7e7cf9c4a4e3903bebb5af78395b47d0a2119963735d1f2b4a5065a172514901; a003passes16native checks with exact raw surfaces outside pocket; a001/a002 preserve failed tessellation comparisons. No installed-game, whole-hull or final art approval claim.
- [runtime-candidate](revisions/r000/a003/baseline-shoulder.glb) — 3ce322c5a6dfad1755fd8a643ec66450ba93fef720260f6f315f66b94bcdcbc6; a003passes16native checks with exact raw surfaces outside pocket; a001/a002 preserve failed tessellation comparisons. No installed-game, whole-hull or final art approval claim.
- [editable-blender](revisions/r000/a003/blender-source.blend) — c4dd32b6bca8f5c5f9c63824663dfd7e764f7f743f74477c9fb6e1128da0d2f3; a003passes16native checks with exact raw surfaces outside pocket; a001/a002 preserve failed tessellation comparisons. No installed-game, whole-hull or final art approval claim.
- [runtime-candidate](revisions/r000/a003/collar.glb) — 023fed1f045d2d26cb9f16346d95929ef83bd03a070aeeedac7be4a82ab68e3f; a003passes16native checks with exact raw surfaces outside pocket; a001/a002 preserve failed tessellation comparisons. No installed-game, whole-hull or final art approval claim.
- [validation](revisions/r000/a003/delivery-manifest.json) — 088cbadbb239a502335d81016939ce2a7b75503965b659ad208c687fbfa8f3af; a003passes16native checks with exact raw surfaces outside pocket; a001/a002 preserve failed tessellation comparisons. No installed-game, whole-hull or final art approval claim.
- [validation](revisions/r000/a003/qualification-a001.json) — 34e607a2884bad74adbc714cfd439b59142f80e2db95eb316ad4a6dace860a0c; a003passes16native checks with exact raw surfaces outside pocket; a001/a002 preserve failed tessellation comparisons. No installed-game, whole-hull or final art approval claim.
- [validation](revisions/r000/a003/separate-pocket-proxy.json) — 2a90513406e07dd4afac9fc40719a1d1ae6cdb3ba903006246ea31cbbe847a3b; a003passes16native checks with exact raw surfaces outside pocket; a001/a002 preserve failed tessellation comparisons. No installed-game, whole-hull or final art approval claim.
- [runtime-candidate](revisions/r000/a003/shoulder.glb) — 32983b595bb4376344feb8f2da5a51aa071a4143978aa727b0459cb2e12aa86a; a003passes16native checks with exact raw surfaces outside pocket; a001/a002 preserve failed tessellation comparisons. No installed-game, whole-hull or final art approval claim.

## Feedback and approvals

```json
{
  "feedback": [
    {
      "source": "Parent implementation authorization",
      "recorded_at": "2026-09-10T02:25:46.508779+00:00",
      "notes": "Owner construction-authoring requirements authorize new shoulder armor/interface revision. Preserve original R006 sources and stable IDs. Technical implementation approval is separate from owner artistic sign-off."
    }
  ],
  "approvals": [],
  "owner_final_signoff": null
}
```

## Source appearances and candidate variants

Keep every crop. Similar function does not prove identical geometry; split this family into separate designs when needed. Each approval must state exactly which reference IDs/variants it covers. Historical/baseline appearances can remain comparison-only and do not need reproduction as current target art.

| Reference | Kind | Brief |
| --- | --- | --- |
