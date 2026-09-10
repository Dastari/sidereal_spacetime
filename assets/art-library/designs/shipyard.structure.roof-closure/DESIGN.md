# shipyard.structure.roof-closure

**Replacement model direction:** author Blender meshes and materials; TypeScript voxel-solid art is being phased out. Preserve authored visual surfaces and keep required gameplay proxies separate. Read [the migration contract](../../../../docs/blender_asset_migration.md) and [workflow](../../WORKFLOW.md).

Stable asset UUID: `d3cb641d-8410-5b69-a6e6-0ca17ee44674`

Current design revision: **r000**. State: **in-progress**. Owner final sign-off for current revision: **NO**.

New exact-interface roof seam and junction companions; reference is theme inspiration, not an exact reconstruction. Original roof art and reference ownership preserved.

[Canonical machine-readable ledger](design.json) · [Agent workflow](../../WORKFLOW.md)

## Revision history

### r000 — in-progress

Preserved a001 roof companions, a002 wall seam and a003 shoulder native attempts, editable source/materials and separate contact proxies. Local qualified geometry only; whole-hull closure and corrected authoring datums remain unfinished.

Hypothesis: An additive structural seam kit closes measured roof interfaces while preserving visible roof/cockpit sources and2m module compatibility.

Review: No completed review.

- [editable-blender](revisions/r000/a001/blender-source.blend) — 08297653312f9d2876abf92302c12503d052e1da1162805840d8f9cd47b092bb; Isolated native candidate; source qualification is not owner artistic approval or installed-game proof.
- [validation](revisions/r000/a001/capture-context.json) — 7ad6701285092240c4c2944459582214f159e860bd754e6bc85cfcdb7ea21329; Isolated native candidate; source qualification is not owner artistic approval or installed-game proof.
- [validation](revisions/r000/a001/closure-paths-a001.json) — 11a47e2d3f57b30f6fbf3b54d5d64fb5b81315081d1c8efe64581b25f2c519be; Isolated native candidate; source qualification is not owner artistic approval or installed-game proof.
- [validation](revisions/r000/a001/contact-proxies.json) — 27f4d8c6b95f58208d6580d0eb6df73935c2b3891f5ad3245adf95542fddc96d; Isolated native candidate; source qualification is not owner artistic approval or installed-game proof.
- [validation](revisions/r000/a001/delivery-manifest.json) — 43ea166655c8457383239072ac3f9aed9432a1f990f82d9d0e1137a0104d3ef5; Isolated native candidate; source qualification is not owner artistic approval or installed-game proof.
- [blender-render](revisions/r000/a001/joint-original.png) — 6786eabeccb8722431da7a1e9464abf2a6095a37d9672f5ae315f355a1f6c453; Isolated native candidate; source qualification is not owner artistic approval or installed-game proof.
- [blender-render](revisions/r000/a001/joint-with-native-plug.png) — df7d4bf782c7a6ad6914c7e95301c9848bf209a7a481fbc220a65654acd8d153; Isolated native candidate; source qualification is not owner artistic approval or installed-game proof.
- [runtime-candidate](revisions/r000/a001/junction-square.glb) — 688895af2916b81fdeb49a1ea0b62e619f4e3669fcc8f1e0628fbebcb3420515; Isolated native candidate; source qualification is not owner artistic approval or installed-game proof.
- [blender-render](revisions/r000/a001/native-kit.png) — bd3ef72e08ea3b6884a1f03a02aa6635c5d0545a34c212620934cda808827fa8; Isolated native candidate; source qualification is not owner artistic approval or installed-game proof.
- [validation](revisions/r000/a001/native-qualification.json) — 7bb98c70ee6b0d16f3d38dda6c9539db211fb3f3827ad440d046a80d23024ea6; Isolated native candidate; source qualification is not owner artistic approval or installed-game proof.
- [runtime-candidate](revisions/r000/a001/rail-2m.glb) — c9b9827f4870407c0f8c7879668c5c7ae09a3a471bbecb0eb53d9fbb5f171494; Isolated native candidate; source qualification is not owner artistic approval or installed-game proof.
- [runtime-candidate](revisions/r000/a001/step-rail-2m.glb) — 85b341ed5737b2b6a864130237637e382c99a438fa3dce3b7f089862a3c37326; Isolated native candidate; source qualification is not owner artistic approval or installed-game proof.
- [validation](revisions/r000/a001/whole-ship-enclosure-inspection-a001.json) — dd4f90977b4737b82748f6559763a4c608a6f246ff3b7f7f8287858bfa1fd1c6; Isolated native candidate; source qualification is not owner artistic approval or installed-game proof.
- [validation](revisions/r000/a001/whole-ship-enclosure-inspection-a002.json) — 0a8ad151452a96d9b91024309df98072ff69c7c2a64a3a600e57b0ee2053a4d7; Isolated native candidate; source qualification is not owner artistic approval or installed-game proof.
- [validation](revisions/r000/a001/canopy-sections-a001.json) — 4523a61f6db283ec90d5149a92db45efc1566d483e46ee81c04891dd995dc680; Preserved native attempt or diagnostic evidence; no whole-hull qualification, runtime installation or final art sign-off.
- [validation](revisions/r000/a001/canopy-sections-a002.json) — 7e780d1fb12e45c05e3a9304fce0724f536d79fcd9f71bfc2b6cbe3ca5892961; Preserved native attempt or diagnostic evidence; no whole-hull qualification, runtime installation or final art sign-off.
- [validation](revisions/r000/a001/closure-regions-a001.json) — c2a5c3b9b626276448ac96aa25ed1bf04b27036cf10726e2678be1a7d3cd0a1f; Preserved native attempt or diagnostic evidence; no whole-hull qualification, runtime installation or final art sign-off.
- [validation](revisions/r000/a001/closure-regions-a002.json) — a6efa0aa924811d2ece04186fd97a76143fe83cefce5d66c4115179e6d1b8719; Preserved native attempt or diagnostic evidence; no whole-hull qualification, runtime installation or final art sign-off.
- [validation](revisions/r000/a001/closure-regions-a003.json) — c6ba827430c9b1c03b76cbb1151e3109313b0a46b8a5de86ac20e35afd477f41; Preserved native attempt or diagnostic evidence; no whole-hull qualification, runtime installation or final art sign-off.
- [validation](revisions/r000/a001/closure-regions-a004.json) — 46db3d3c4e007285aafa96063bbf903fef66b4b9b03da0f10d5d2efb8535377a; Preserved native attempt or diagnostic evidence; no whole-hull qualification, runtime installation or final art sign-off.
- [validation](revisions/r000/a001/closure-regions-a005.json) — 46db3d3c4e007285aafa96063bbf903fef66b4b9b03da0f10d5d2efb8535377a; Preserved native attempt or diagnostic evidence; no whole-hull qualification, runtime installation or final art sign-off.
- [validation](revisions/r000/a001/closure-regions-a006.json) — a96d45f000a4bbdd53eae29c1b4640ab095f530cb9daf4c12c4668a05ac7d887; Preserved native attempt or diagnostic evidence; no whole-hull qualification, runtime installation or final art sign-off.
- [validation](revisions/r000/a001/closure-regions-a007.json) — 4f4f6fc8bb2859313dad9c3088eef12802d4f95bc470d30b7e4b504595c0c1d1; Preserved native attempt or diagnostic evidence; no whole-hull qualification, runtime installation or final art sign-off.
- [validation](revisions/r000/a001/closure-regions-a008.json) — 46db3d3c4e007285aafa96063bbf903fef66b4b9b03da0f10d5d2efb8535377a; Preserved native attempt or diagnostic evidence; no whole-hull qualification, runtime installation or final art sign-off.
- [validation](revisions/r000/a001/closure-regions-a009.json) — 46db3d3c4e007285aafa96063bbf903fef66b4b9b03da0f10d5d2efb8535377a; Preserved native attempt or diagnostic evidence; no whole-hull qualification, runtime installation or final art sign-off.
- [validation](revisions/r000/a001/closure-regions-a010.json) — 46db3d3c4e007285aafa96063bbf903fef66b4b9b03da0f10d5d2efb8535377a; Preserved native attempt or diagnostic evidence; no whole-hull qualification, runtime installation or final art sign-off.
- [validation](revisions/r000/a001/closure-sections-a001.json) — 7b1cba558544bced805d5d0976808d3c970e089989051ecf77cd61eff6d7c488; Preserved native attempt or diagnostic evidence; no whole-hull qualification, runtime installation or final art sign-off.
- [validation](revisions/r000/a001/closure-sections-a002.json) — da9ce9ae14594afbb4f95672d37ff52d065217861adce5a3751cafb088536447; Preserved native attempt or diagnostic evidence; no whole-hull qualification, runtime installation or final art sign-off.
- [validation](revisions/r000/a001/closure-surface-path-a001.json) — 8621f2426b31ad06e24f7dd8dde0f3e329bd274f5c4bd33efbea346ad899e935; Preserved native attempt or diagnostic evidence; no whole-hull qualification, runtime installation or final art sign-off.
- [validation](revisions/r000/a001/closure-surface-path-a002.json) — 8621f2426b31ad06e24f7dd8dde0f3e329bd274f5c4bd33efbea346ad899e935; Preserved native attempt or diagnostic evidence; no whole-hull qualification, runtime installation or final art sign-off.
- [validation](revisions/r000/a001/closure-surface-path-a003.json) — 8621f2426b31ad06e24f7dd8dde0f3e329bd274f5c4bd33efbea346ad899e935; Preserved native attempt or diagnostic evidence; no whole-hull qualification, runtime installation or final art sign-off.
- [validation](revisions/r000/a001/closure-surface-path-a004.json) — a806574d445056ae610ff0259c550f760340144123d575258ddb2295f5ca9050; Preserved native attempt or diagnostic evidence; no whole-hull qualification, runtime installation or final art sign-off.
- [validation](revisions/r000/a001/closure-surface-path-a005.json) — 78a9b9bad8e59909a12605cff28931c65077da36d70e730aca266c4d2da7da4c; Preserved native attempt or diagnostic evidence; no whole-hull qualification, runtime installation or final art sign-off.
- [validation](revisions/r000/a001/closure-surface-path-a006.json) — 6bea0e6b79f3b6d4fce0477487bc2f2b59e4f6784d09ec2a285c7721e0cdc27b; Preserved native attempt or diagnostic evidence; no whole-hull qualification, runtime installation or final art sign-off.
- [validation](revisions/r000/a001/closure-surface-path-a007.json) — 70a3c9481d73559a9fb722594d657798ce62ecb7e95bbd2edf7d0fc8aff3a50d; Preserved native attempt or diagnostic evidence; no whole-hull qualification, runtime installation or final art sign-off.
- [validation](revisions/r000/a001/closure-surface-path-a008.json) — 043aebfd70b0cdd25857ffb2b8f78365ad226aeca3b0eef65dedc36b95d04f0d; Preserved native attempt or diagnostic evidence; no whole-hull qualification, runtime installation or final art sign-off.
- [validation](revisions/r000/a001/closure-surface-path-a009.json) — a167ee8b4ca0eed7cedcafe32944b39bced97578ae7aef9a6fa9f452dce9ab8f; Preserved native attempt or diagnostic evidence; no whole-hull qualification, runtime installation or final art sign-off.
- [validation](revisions/r000/a001/closure-surface-path-a010.json) — d7282c37a3c7618333f8b0b3d141c62f15b1900fbaa078ad80ec1b5c18bd0ee9; Preserved native attempt or diagnostic evidence; no whole-hull qualification, runtime installation or final art sign-off.
- [validation](revisions/r000/a001/closure-surface-path-a011.json) — 4c4d4a7e5da07df6b5a635df0235b435da46cb7c7cf77c1bd9afd7322b433fee; Preserved native attempt or diagnostic evidence; no whole-hull qualification, runtime installation or final art sign-off.
- [validation](revisions/r000/a001/closure-surface-path-a012.json) — 74ed6e105280e214214737eb7038ae211264ac0d65c92439e51f328b18ef9685; Preserved native attempt or diagnostic evidence; no whole-hull qualification, runtime installation or final art sign-off.
- [validation](revisions/r000/a001/whole-ship-enclosure-inspection-a003.json) — b7a89536e9c672713005f4978c9b5bbfcd3699d1c9abb4d7851867321121b33d; Preserved native attempt or diagnostic evidence; no whole-hull qualification, runtime installation or final art sign-off.
- [validation](revisions/r000/a001/whole-ship-enclosure-inspection-a004.json) — a208799024183e58365024fa59dc465c343dec7424a849750c17566aa9ccc3e0; Preserved native attempt or diagnostic evidence; no whole-hull qualification, runtime installation or final art sign-off.
- [validation](revisions/r000/a001/whole-ship-enclosure-inspection-a005.json) — d8e95d109334a5a3f2679b9af0274a629d2c3551f9be496cb3edc1777c73d961; Preserved native attempt or diagnostic evidence; no whole-hull qualification, runtime installation or final art sign-off.
- [validation](revisions/r000/a001/whole-ship-enclosure-inspection-a006.json) — 9e77b97fd09d3e56ca3bc7cc9b7a40219f936a32452170e8377712bb866b8eb8; Preserved native attempt or diagnostic evidence; no whole-hull qualification, runtime installation or final art sign-off.
- [validation](revisions/r000/a001/whole-ship-enclosure-inspection-a007.json) — a61360b05ca9a0272aa12d804c0c72996c6ac0a572f163a19199cc88441d9ab1; Preserved native attempt or diagnostic evidence; no whole-hull qualification, runtime installation or final art sign-off.
- [validation](revisions/r000/a001/whole-ship-enclosure-inspection-a008.json) — 26c3e16f9ac541a222f302406cc5a4db2c268a10252bd379603cb6933706124c; Preserved native attempt or diagnostic evidence; no whole-hull qualification, runtime installation or final art sign-off.
- [validation](revisions/r000/a001/whole-ship-enclosure-inspection-a009.json) — 3831b7d596fb21b71ac4321e90ee19e2bb01e9e7eb85aa8c35ce538ecd87a01c; Preserved native attempt or diagnostic evidence; no whole-hull qualification, runtime installation or final art sign-off.
- [validation](revisions/r000/a001/whole-ship-enclosure-inspection-a010.json) — 2d7032f9a37347b9e3244a95a1c565a5580e72e1bbd20a186d8b68044d39e83c; Preserved native attempt or diagnostic evidence; no whole-hull qualification, runtime installation or final art sign-off.
- [editable-blender](revisions/r000/a002/blender-source.blend) — 2ac9c322b2ec4717d1abd1b6681903850c3c5b13402377293dee859bb7aa496f; Preserved native attempt or diagnostic evidence; no whole-hull qualification, runtime installation or final art sign-off.
- [validation](revisions/r000/a002/capture-context.json) — 6db7b0ffbc503a90f7499b9df91067e025e6b00aa7285505c2dabcf2c07ef6b3; Preserved native attempt or diagnostic evidence; no whole-hull qualification, runtime installation or final art sign-off.
- [validation](revisions/r000/a002/contact-proxies.json) — 2af731a32dac825bbd488a40c4d38da37059028b182adf2eded2d71202c525d1; Preserved native attempt or diagnostic evidence; no whole-hull qualification, runtime installation or final art sign-off.
- [validation](revisions/r000/a002/delivery-manifest.json) — 6e54d21cfe2442c6c067aa21caf6884d5a4993b8dce1d9aad1365b3ffa211724; Preserved native attempt or diagnostic evidence; no whole-hull qualification, runtime installation or final art sign-off.
- [blender-render](revisions/r000/a002/joint-original.png) — 0de9855918f92c492ba35c6f3cfeb89eefe5fef88b07ff1bbedf62826ce1e527; Preserved native attempt or diagnostic evidence; no whole-hull qualification, runtime installation or final art sign-off.
- [blender-render](revisions/r000/a002/joint-with-native-plug.png) — 227802df16c21c72c27a18ea1f677a8b37c8dfa0123556a393c7ca04d253f371; Preserved native attempt or diagnostic evidence; no whole-hull qualification, runtime installation or final art sign-off.
- [runtime-candidate](revisions/r000/a002/junction-square.glb) — 688895af2916b81fdeb49a1ea0b62e619f4e3669fcc8f1e0628fbebcb3420515; Preserved native attempt or diagnostic evidence; no whole-hull qualification, runtime installation or final art sign-off.
- [blender-render](revisions/r000/a002/native-kit-framed.png) — 5622ba15ad84c3bcea39e5a6d9596163d7dce620d96b04646f5fd627817f9401; Preserved native attempt or diagnostic evidence; no whole-hull qualification, runtime installation or final art sign-off.
- [blender-render](revisions/r000/a002/native-kit.png) — 0ab1c6b2f602572072f713f05d02088aed5a8d7e463d28655ead363388b2517b; Preserved initial contact sheet with incomplete framing of tall parts; not final visual acceptance.
- [runtime-candidate](revisions/r000/a002/rail-2m.glb) — c9b9827f4870407c0f8c7879668c5c7ae09a3a471bbecb0eb53d9fbb5f171494; Preserved native attempt or diagnostic evidence; no whole-hull qualification, runtime installation or final art sign-off.
- [blender-render](revisions/r000/a002/rear-seam-original.png) — 8abe3bea18d03f62a79a80da6e1318d84d8fb1f8ef349c3d24f32f385464fe94; Preserved native attempt or diagnostic evidence; no whole-hull qualification, runtime installation or final art sign-off.
- [blender-render](revisions/r000/a002/rear-seam-with-native-closure.png) — ae317ae68c7956d4610bd19b96cf06631ea677997e5c4859d531bc5fff6d876d; Preserved native attempt or diagnostic evidence; no whole-hull qualification, runtime installation or final art sign-off.
- [runtime-candidate](revisions/r000/a002/step-rail-2m.glb) — 85b341ed5737b2b6a864130237637e382c99a438fa3dce3b7f089862a3c37326; Preserved native attempt or diagnostic evidence; no whole-hull qualification, runtime installation or final art sign-off.
- [validation](revisions/r000/a002/wall-capture-context.json) — 000796d695959dc6e8b11dee6c39fa65b6dd0a5e1ca80da38a7e8b0cbc46cea1; Preserved native attempt or diagnostic evidence; no whole-hull qualification, runtime installation or final art sign-off.
- [runtime-candidate](revisions/r000/a002/wall-seam-2p5m.glb) — da12929941b5704ca01b4ba51971af5f9b77e4fc17aede95eb779176734f759c; Preserved native attempt or diagnostic evidence; no whole-hull qualification, runtime installation or final art sign-off.
- [editable-blender](revisions/r000/a003/blender-source.blend) — 81f12b77de6d76e13bbc80725c36ca499ecbf34dd1d5257b335a4c294a1f78c4; Preserved native attempt or diagnostic evidence; no whole-hull qualification, runtime installation or final art sign-off.
- [validation](revisions/r000/a003/capture-context.json) — 6db7b0ffbc503a90f7499b9df91067e025e6b00aa7285505c2dabcf2c07ef6b3; Preserved native attempt or diagnostic evidence; no whole-hull qualification, runtime installation or final art sign-off.
- [validation](revisions/r000/a003/contact-proxies.json) — 224726d6739f3606cbccf1a32b5fb8c7c420a9d3a0a0759d584688947896d062; Preserved native attempt or diagnostic evidence; no whole-hull qualification, runtime installation or final art sign-off.
- [validation](revisions/r000/a003/delivery-manifest.json) — 80da216800531ae1d62d9df0d58ec7661a8fd723872e741ea80f87fbed9a7885; Preserved native attempt or diagnostic evidence; no whole-hull qualification, runtime installation or final art sign-off.
- [blender-render](revisions/r000/a003/joint-original.png) — 38596d48a48e2f12d6ebd667080ecca23052c93637816d6d632f95b669f7eae5; Preserved native attempt or diagnostic evidence; no whole-hull qualification, runtime installation or final art sign-off.
- [blender-render](revisions/r000/a003/joint-with-native-plug.png) — a05a7afd9a1a64bea3c8cbfd7057ea1017352b23c2f44e24cf78f05e57675a94; Preserved native attempt or diagnostic evidence; no whole-hull qualification, runtime installation or final art sign-off.
- [runtime-candidate](revisions/r000/a003/junction-square.glb) — 688895af2916b81fdeb49a1ea0b62e619f4e3669fcc8f1e0628fbebcb3420515; Preserved native attempt or diagnostic evidence; no whole-hull qualification, runtime installation or final art sign-off.
- [blender-render](revisions/r000/a003/native-kit.png) — d4bc7fcab2954e25089a49ac827600172fa912c1125d395d1f0f1cf95a2bf4b4; Preserved initial contact sheet with incomplete framing of tall parts; not final visual acceptance.
- [runtime-candidate](revisions/r000/a003/rail-2m.glb) — c9b9827f4870407c0f8c7879668c5c7ae09a3a471bbecb0eb53d9fbb5f171494; Preserved native attempt or diagnostic evidence; no whole-hull qualification, runtime installation or final art sign-off.
- [runtime-candidate](revisions/r000/a003/shoulder-panel-0p5m.glb) — 56c6ecdca5a1fa3b592df5cf77f41817a5ca58238306a901b828cf2150b4aa4f; Preserved native attempt or diagnostic evidence; no whole-hull qualification, runtime installation or final art sign-off.
- [runtime-candidate](revisions/r000/a003/step-rail-2m.glb) — 85b341ed5737b2b6a864130237637e382c99a438fa3dce3b7f089862a3c37326; Preserved native attempt or diagnostic evidence; no whole-hull qualification, runtime installation or final art sign-off.
- [validation](revisions/r000/a003/wall-qualification-a001.json) — f12cebde115c0902adc7fb7cfd3887b5ce5c704ccf81b8dedd70e8df8aeb5cea; Preserved failed negative control: original rear mid-wall coupon already sealed; corrected experiment in a002.
- [validation](revisions/r000/a003/wall-qualification-a002.json) — 2ffbc23917afa6a9587316d1f6800ab51f55ace9d91660408aec3858f1353089; Preserved native attempt or diagnostic evidence; no whole-hull qualification, runtime installation or final art sign-off.
- [runtime-candidate](revisions/r000/a003/wall-seam-2p5m.glb) — da12929941b5704ca01b4ba51971af5f9b77e4fc17aede95eb779176734f759c; Preserved native attempt or diagnostic evidence; no whole-hull qualification, runtime installation or final art sign-off.

## Feedback and approvals

```json
{
  "feedback": [
    {
      "source": "actual native qualification",
      "recorded_at": "2026-09-09T22:09:57.693846+00:00",
      "notes": "Four old roof panels have a positive-area12mm corner leak. Native junction closes the local connected path and contacts all four unmodified panels.14gates pass. Whole-ship CSG preserves a closed20.59810499m3 airlock chamber but has not qualified the main interior."
    },
    {
      "source": "parent native image review and exact native qualification",
      "recorded_at": "2026-09-10T00:40:17.599961+00:00",
      "notes": "Parent reviewed actual roof joint and rear seam renders and authorized technical continuation only. a002 adds a native wall seam; a003 adds two matching shoulder instances preserving the central doorway. Ten wall/shoulder local gates pass. Earlier rear mid-wall negative-control choice was wrong: that midsection already seals, and its failed report is preserved. Full main hull still has an open result; bounded airlock chamber remains approximately20.5981m3. Zero-area-only normalization does not close positive gaps or certify the hull."
    },
    {
      "source": "owner authoring-envelope correction",
      "recorded_at": "2026-09-10T00:40:17.599961+00:00",
      "notes": "Every full export must fit its reserved polygon and height. Existing r002 floors pass, while legacy boundary wall groups intrude usable floor and six lockers intersect. Correct new native wall/interface revisions instead of compensating placements. Closure companions must be requalified with the final corrected structural family; current original262source identities remain unchanged."
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
