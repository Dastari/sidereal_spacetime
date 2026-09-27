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

Review: {"outcome": "partial", "notes": "a003 passes55 checks, preserves8native groups/60placements/18supports/17continuous step envelopes.15 unsafe tread-center stops rejected. Actual Blender review complete; gameplay and owner artistic acceptance pending.", "recorded_at": "2026-09-09T10:32:05.603188+00:00"}

- [specification](revisions/r000/specification.json) — 5762af44798afd195af6fe70528d6f2a3d55ac1ffa2d554576d039fce2b35520; Proposed dimensional/interface fit plan only; no native geometry qualification or runtime change.
- [validation](revisions/r000/dimension-check.json) — 79fbf9852bb405af29ddaa34a3673129a0999b28cd8b0f4686a6a645b7ca5845; Proposed dimensional/interface fit plan only; no native geometry qualification or runtime change.
- [review-notes](revisions/r000/fit-plan.md) — ea6f8095430fdf3f2411e46704d1b6877024bf4d7003af2c4d28e42dc267facb; Proposed dimensional/interface fit plan only; no native geometry qualification or runtime change.
- [generator](revisions/r000/headroom-a001/author.py) — 398346393aab2b0e57c1ce56fec5b6791ae5f4dbff28e1b7778bfe68e0c96a7a; Scoped native entrance headroom study; no full-kit/gait qualification or runtime export.
- [blender-source](revisions/r000/headroom-a001/blender-source.blend) — 8e908d75568049825d77486f5a05120b1656319c713a50f817f30cf7bf12b7e1; Scoped native entrance headroom study; no full-kit/gait qualification or runtime export.
- [validation](revisions/r000/headroom-a001/headroom.json) — 14fade2ad30c7fd0dd61e883e4113a6183e3c03c73a218425d12099183857bda; Scoped native entrance headroom study; no full-kit/gait qualification or runtime export.
- [blender-close](revisions/r000/headroom-a001/roof-edge-capsule.png) — 2a0e3ef9ad0cb2bc76ed793421ea025b418a9ecb30ab2821a4f38795f6160436; Scoped native entrance headroom study; no full-kit/gait qualification or runtime export.
- [capture-context](revisions/r000/headroom-a001/capture.json) — f21d9fce14c9d7c008f0357fb31b6ac35c90e323cd5a389fa6f14e60dbfc1f37; Scoped native entrance headroom study; no full-kit/gait qualification or runtime export.
- [review-notes](revisions/r000/headroom-a001/review.md) — 847e44e6137a36a73ed5d7fc7f406dbb6cae346b45891e3eb17e993dc38fcfe0; Scoped native entrance headroom study; no full-kit/gait qualification or runtime export.
- [generator](revisions/r000/a001/author.py) — e3aad8c489c31b4e9d33faa34ce8d054a689fe95934c89be9e9389900efded59; Preserved failed/cleanup iteration. No runtime publication or final owner art approval.
- [validation-script](revisions/r000/a001/validate.py) — c92c5631008384d07f68079a5add19128ae927638d598b34c2f2be0457e4514f; Preserved failed/cleanup iteration. No runtime publication or final owner art approval.
- [blender-source](revisions/r000/a001/blender-source.blend) — 509d55a3e2e46e64c18eecb6886864eb6b676a4d073e8bb065c7dcfac0f0cc25; Preserved failed/cleanup iteration. No runtime publication or final owner art approval.
- [native-glb](revisions/r000/a001/kit.glb) — 7073cc9b366e56a3f67f4ea8f296063bdfe0df38fb5c02794b92a8e2272a4034; Preserved failed/cleanup iteration. No runtime publication or final owner art approval.
- [native-triangle-proof](revisions/r000/a001/authored-triangles.json.gz) — 0592a0b37d8b764cc86a82830e063575b3d8719c51048d18d663c07077c2c50f; Preserved failed/cleanup iteration. No runtime publication or final owner art approval.
- [collision-evidence](revisions/r000/a001/native-collision-triangles.json.gz) — 90a07d3def4837401b0da5dbe95df39983880e2bca91457524f4814b4f1a0e2e; Preserved failed/cleanup iteration. No runtime publication or final owner art approval.
- [measurements](revisions/r000/a001/native-measurements.json) — 508f890275f4c23136c04d06fd073fd955ada01a279be699ba487c9c3a1d0c8c; Preserved failed/cleanup iteration. No runtime publication or final owner art approval.
- [validation](revisions/r000/a001/validation.json) — 2d0383bb41bd8aa109652281d6cd1a0a3d3a5003625e054aa4f822ac761c84f6; Preserved failed/cleanup iteration. No runtime publication or final owner art approval.
- [interface-audit](revisions/r000/a001/stair-audit.json) — d2a9607ab9509c76771d05fa51b1de6c4f10936b5b6ebf5d2a20c53446d88c43; Preserved failed/cleanup iteration. No runtime publication or final owner art approval.
- [delivery](revisions/r000/a001/delivery.json) — 788a01f4bc371d3d66d49eb9d80cacd6a3e215073e5124bac4ecb60f70c99567; Preserved failed/cleanup iteration. No runtime publication or final owner art approval.
- [negative-evidence](revisions/r000/a001/rejected-center-stops.json) — 7c02cd20adf4bafc1ce0994dc6fa30fcb05c04c177602706b85220408e52e60f; Preserved failed/cleanup iteration. No runtime publication or final owner art approval.
- [capture-context](revisions/r000/a001/capture.json) — fe050ad4017e40973dc1c2bf7e6a12fb187d007ee8990d77e2d875e807bd7251; Preserved failed/cleanup iteration. No runtime publication or final owner art approval.
- [cutout](revisions/r000/a001/cutout.png) — b06f1a7f22577decdcf6d06e23b4d33b08f87e735da0967947fc74dff371c740; Preserved failed/cleanup iteration. No runtime publication or final owner art approval.
- [blender-context](revisions/r000/a001/blender-lower.png) — 2f13cfe1ef2a23cad4ca02944752636f6042e57235ac9d253a6c85b809a2f4e7; Preserved failed/cleanup iteration. No runtime publication or final owner art approval.
- [blender-context](revisions/r000/a001/blender-context.png) — 6bccba9f93d480d6e4989d852ee6d10dc9af6f2bb92128ce8eda9aa6c2df371e; Preserved failed/cleanup iteration. No runtime publication or final owner art approval.
- [blender-top](revisions/r000/a001/blender-top.png) — 1a29c1b8f0f8fd7114014503a664fa2ba3748891b48f1a0d7301ee484ad4489b; Preserved failed/cleanup iteration. No runtime publication or final owner art approval.
- [review-notes](revisions/r000/a001/review.md) — 953eb13e7de698da874b03b6ea04d7cd18018e34eae35b15df4a446313433a6b; Preserved failed/cleanup iteration. No runtime publication or final owner art approval.
- [generator](revisions/r000/a002/author.py) — c15a4dd90ee93ba08d134d9a8660d85c22a4f2b06eb02fb9891898def632d199; Preserved failed/cleanup iteration. No runtime publication or final owner art approval.
- [validation-script](revisions/r000/a002/validate.py) — c92c5631008384d07f68079a5add19128ae927638d598b34c2f2be0457e4514f; Preserved failed/cleanup iteration. No runtime publication or final owner art approval.
- [blender-source](revisions/r000/a002/blender-source.blend) — 57a3174e95938f94cebf01a0da3ca19d1d86478e377ffee2d632caaf661621bc; Preserved failed/cleanup iteration. No runtime publication or final owner art approval.
- [native-glb](revisions/r000/a002/kit.glb) — 845ab13f1a1e7a6a4332e00f9ea9fd443b1c29d1b8d941102168fe9a7415db15; Preserved failed/cleanup iteration. No runtime publication or final owner art approval.
- [native-triangle-proof](revisions/r000/a002/authored-triangles.json.gz) — 56f5b67e55000321622e869083c91602df351f6a42c299ae146679d65d6d8ffc; Preserved failed/cleanup iteration. No runtime publication or final owner art approval.
- [collision-evidence](revisions/r000/a002/native-collision-triangles.json.gz) — 8e0c40c6279cf9946be781cf2d865bca1c116527ef50487144ce402677a8d39f; Preserved failed/cleanup iteration. No runtime publication or final owner art approval.
- [measurements](revisions/r000/a002/native-measurements.json) — f0e17ae3b3e8366cb64f878f6d0123db3fc9eaef3a2a7cc96e7c8e31a393f644; Preserved failed/cleanup iteration. No runtime publication or final owner art approval.
- [validation](revisions/r000/a002/validation.json) — 0aed6b56e9483adb4ce6014134e26bd3a7d393804a5d6f4772c79a47d883b331; Preserved failed/cleanup iteration. No runtime publication or final owner art approval.
- [interface-audit](revisions/r000/a002/stair-audit.json) — b788e50724cdf16c7146ede8cf2783d6cebfefa1eb6ce73d73841e8788d73c23; Preserved failed/cleanup iteration. No runtime publication or final owner art approval.
- [delivery](revisions/r000/a002/delivery.json) — 5bba8235fb68e386e0565ff62f8cb9401e5297aeb5a446a5ec0eaf1c70af2494; Preserved failed/cleanup iteration. No runtime publication or final owner art approval.
- [negative-evidence](revisions/r000/a002/rejected-center-stops.json) — 1cc5c2d07497a4dd328aaa71f972935b7f8aac708d23e668b40e4795c8d61c69; Preserved failed/cleanup iteration. No runtime publication or final owner art approval.
- [capture-context](revisions/r000/a002/capture.json) — c4e4b2a7b7719deff635ab79392cd28e52ed1240e74b4bf98fb8329a5c9ec7c7; Preserved failed/cleanup iteration. No runtime publication or final owner art approval.
- [cutout](revisions/r000/a002/cutout.png) — ff18010d42853c7b994ca953db59b975b3d102abc116f8b9fae6598be982f7a1; Preserved failed/cleanup iteration. No runtime publication or final owner art approval.
- [blender-context](revisions/r000/a002/blender-lower.png) — ee9d670c1290e84aec5ea38c43f4ad09c8a52549117e7d0d188b1060e6c8ff70; Preserved failed/cleanup iteration. No runtime publication or final owner art approval.
- [blender-context](revisions/r000/a002/blender-context.png) — cb7884c03c80ce1c5bf585f17408b87020e80f6f54fe711b47bb9e6d585d673d; Preserved failed/cleanup iteration. No runtime publication or final owner art approval.
- [blender-top](revisions/r000/a002/blender-top.png) — 41dd74b8c560a5920ab0513cea3851d286b1fbef8740c2dbf9699cf221c70a82; Preserved failed/cleanup iteration. No runtime publication or final owner art approval.
- [review-notes](revisions/r000/a002/review.md) — a4d05d59d241e28c061727d2c52447e25c6f36ea2f267f56c083348afc032c64; Preserved failed/cleanup iteration. No runtime publication or final owner art approval.
- [generator](revisions/r000/a003/author.py) — bcae49eb5e14958fe5e8f99d05614ff3ede08c20983b9a53478e40d06d057514; Qualified bounded native geometry. No runtime publication or final owner art approval.
- [validation-script](revisions/r000/a003/validate.py) — c92c5631008384d07f68079a5add19128ae927638d598b34c2f2be0457e4514f; Qualified bounded native geometry. No runtime publication or final owner art approval.
- [blender-source](revisions/r000/a003/blender-source.blend) — 2d02ff1e8e38dca22627739c7a3321593e0b8f22ce66ae4cb98b5fccbcecbec6; Qualified bounded native geometry. No runtime publication or final owner art approval.
- [native-glb](revisions/r000/a003/kit.glb) — 8d2f8359f6221a43245fdd9b10671892cbe5d05f5ba8569ff04f1f8e54f728a7; Qualified bounded native geometry. No runtime publication or final owner art approval.
- [native-triangle-proof](revisions/r000/a003/authored-triangles.json.gz) — 4b45f6f3fd93abab70221d3f5da93d5ac6bdc90d054e56fbd501f87d2f8fae0b; Qualified bounded native geometry. No runtime publication or final owner art approval.
- [collision-evidence](revisions/r000/a003/native-collision-triangles.json.gz) — b3b80c48bcbafef462384ec43dc23e6aaf9e3cfbe5eb2be83b38dfb76a0c1106; Qualified bounded native geometry. No runtime publication or final owner art approval.
- [measurements](revisions/r000/a003/native-measurements.json) — 0e3c40fd905be56becbeb8a9302136e3e518f4a10cf157ae0d19da016cc1fc9f; Qualified bounded native geometry. No runtime publication or final owner art approval.
- [validation](revisions/r000/a003/validation.json) — d11ddbd002089fc2a3b81ea17d045585924629480fd781d4a2b5995cf520da88; Qualified bounded native geometry. No runtime publication or final owner art approval.
- [interface-audit](revisions/r000/a003/stair-audit.json) — 8df56649474fa8379af3a2c678716fc1f80406e9f9457e85498598f6a0be9831; Qualified bounded native geometry. No runtime publication or final owner art approval.
- [delivery](revisions/r000/a003/delivery.json) — 600ffd7da0ae53bde02aed5d6652f51515f251ae8608305d9eab92bdfaf59d27; Qualified bounded native geometry. No runtime publication or final owner art approval.
- [negative-evidence](revisions/r000/a003/rejected-center-stops.json) — 354d3bfcec26db30cfe4952f2c3dcdacd2c031ca3d8e73919b09e563f88a1852; Qualified bounded native geometry. No runtime publication or final owner art approval.
- [capture-context](revisions/r000/a003/capture.json) — 459b290dff8d798b0e32b8a1b58298ffbb2437f0c819a78cb3244f0abb4eb055; Qualified bounded native geometry. No runtime publication or final owner art approval.
- [cutout](revisions/r000/a003/cutout.png) — ee33af503f6ca4447876be81859492b5becff16beb88b834ebb64f792149317c; Qualified bounded native geometry. No runtime publication or final owner art approval.
- [blender-context](revisions/r000/a003/blender-lower.png) — a260078c76b4634836773e35c8374224157b9f1e3617924d5316872633e6a90f; Qualified bounded native geometry. No runtime publication or final owner art approval.
- [blender-context](revisions/r000/a003/blender-context.png) — a78a1b99521818fa1fd93fc050c9e7a546175f43886f224b2daf590ff84fd16e; Qualified bounded native geometry. No runtime publication or final owner art approval.
- [blender-top](revisions/r000/a003/blender-top.png) — 1865e4ace8e41501336b464106ed346d9a8031204421c43290cd0044cda289bd; Qualified bounded native geometry. No runtime publication or final owner art approval.
- [review-notes](revisions/r000/a003/review.md) — 0003969d799b16e981191eb96321f0361afaf056a152764cf572121e7557e73d; Qualified bounded native geometry. No runtime publication or final owner art approval.
- [review-script](revisions/r000/a003/review_body.py) — 7ed529778372204887ab9911c9c9c62d8684b4b2e73dce5c854b5dafe4049f5d; Actual Blender full-size capsule review poses; independent placements, not simultaneous authority occupancy.
- [blender-review-source](revisions/r000/a003/capsule-fit.blend) — 03ed9d82937227fe63cc1ba318255f04125c93fc861048976bf5def84059b1fd; Actual Blender full-size capsule review poses; independent placements, not simultaneous authority occupancy.
- [blender-fit](revisions/r000/a003/capsule-fit.png) — 951356a64130543f1c5d40f5653449920ec709148455993d35719085d19eab76; Actual Blender full-size capsule review poses; independent placements, not simultaneous authority occupancy.
- [capture-context](revisions/r000/a003/capsule-fit.json) — ff336eba4b2d9b6addcfe6a1a4150100ac21b842c21194ce378735c51461c83d; Actual Blender full-size capsule review poses; independent placements, not simultaneous authority occupancy.
- [source-inventory](revisions/r000/a003/source-inventory.json) — 25add2bff0caa9644131da590f754eaa134a3f749fcbb991ff625499d49156fa; Exact final source/export/audit/evidence hashes.

## Feedback and approvals

```json
{
  "feedback": [
    {
      "recorded_at": "2026-09-09T10:32:05.603188+00:00",
      "source": "native author review",
      "notes": "a001 final riser intrusion corrected; a002 duplicate joint faces corrected. a003 uses actual destination pan/floor edges and qualifies rear-edge stance strips without shrinking the standing capsule."
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
