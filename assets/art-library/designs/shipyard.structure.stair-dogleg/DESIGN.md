# shipyard.structure.stair-dogleg

**Replacement model direction:** author Blender meshes and materials; TypeScript voxel-solid art is being phased out. Preserve authored visual surfaces and keep required gameplay proxies separate. Read [the migration contract](../../../../docs/blender_asset_migration.md) and [workflow](../../WORKFLOW.md).

Stable asset UUID: `c6005a76-9319-5265-ac49-8c595fbc4416`

Current design revision: **r000**. State: **in-progress**. Owner final sign-off for current revision: **NO**.

Independent stair family from explicit owner requirement. Native ladder and all source crops retain their existing identities and ownership. Dimensions are proposed, not inferred from a reference image.

[Canonical machine-readable ledger](design.json) · [Agent workflow](../../WORKFLOW.md)

## Revision history

### r000 — in-progress

Propose a measured seventeen-riser dogleg stair with real slab opening and ordinary walking interfaces.

Hypothesis: A 4 by 6m two-flight kit with 1.5m clear flights fits the exact 3.1875m deck pitch while preserving an intermediate turn landing and measurable entrance headroom.

Review: {"outcome": "partial", "notes": "Six dimensional checks and native entrance headroom study pass. Conservative capsule clearance >=0.349639m, rectangular roof gap0.45m. No full stair gait, native GLB, runtime or owner artistic qualification.", "recorded_at": "2026-09-09T10:15:54.580169+00:00"}

- [specification](revisions/r000/specification.json) — 5762af44798afd195af6fe70528d6f2a3d55ac1ffa2d554576d039fce2b35520; Proposed dimensional/interface fit plan only; no native geometry qualification or runtime change.
- [validation](revisions/r000/dimension-check.json) — 79fbf9852bb405af29ddaa34a3673129a0999b28cd8b0f4686a6a645b7ca5845; Proposed dimensional/interface fit plan only; no native geometry qualification or runtime change.
- [review-notes](revisions/r000/fit-plan.md) — ea6f8095430fdf3f2411e46704d1b6877024bf4d7003af2c4d28e42dc267facb; Proposed dimensional/interface fit plan only; no native geometry qualification or runtime change.
- [generator](revisions/r000/headroom-a001/author.py) — 398346393aab2b0e57c1ce56fec5b6791ae5f4dbff28e1b7778bfe68e0c96a7a; Scoped native entrance headroom study; no full-kit/gait qualification or runtime export.
- [blender-source](revisions/r000/headroom-a001/blender-source.blend) — 8e908d75568049825d77486f5a05120b1656319c713a50f817f30cf7bf12b7e1; Scoped native entrance headroom study; no full-kit/gait qualification or runtime export.
- [validation](revisions/r000/headroom-a001/headroom.json) — 14fade2ad30c7fd0dd61e883e4113a6183e3c03c73a218425d12099183857bda; Scoped native entrance headroom study; no full-kit/gait qualification or runtime export.
- [blender-close](revisions/r000/headroom-a001/roof-edge-capsule.png) — 2a0e3ef9ad0cb2bc76ed793421ea025b418a9ecb30ab2821a4f38795f6160436; Scoped native entrance headroom study; no full-kit/gait qualification or runtime export.
- [capture-context](revisions/r000/headroom-a001/capture.json) — f21d9fce14c9d7c008f0357fb31b6ac35c90e323cd5a389fa6f14e60dbfc1f37; Scoped native entrance headroom study; no full-kit/gait qualification or runtime export.
- [review-notes](revisions/r000/headroom-a001/review.md) — 847e44e6137a36a73ed5d7fc7f406dbb6cae346b45891e3eb17e993dc38fcfe0; Scoped native entrance headroom study; no full-kit/gait qualification or runtime export.

## Feedback and approvals

```json
{
  "feedback": [],
  "approvals": [],
  "owner_final_signoff": null
}
```

## Source appearances and candidate variants

Keep every crop. Similar function does not prove identical geometry; split this family into separate designs when needed. Each approval must state exactly which reference IDs/variants it covers. Historical/baseline appearances can remain comparison-only and do not need reproduction as current target art.

| Reference | Kind | Brief |
| --- | --- | --- |
