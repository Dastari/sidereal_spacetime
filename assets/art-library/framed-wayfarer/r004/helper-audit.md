# Armor review helper audit — 2026-09-14

Scope: read-only source review of `prepare_armor_cassette_review.py`, `build_armor_cassette_review.mjs`, `armor_cassette_browser.mjs`, `pack_armor_cassette.py`, and reused `pack_framed_glb.py`. Compared the frozen candidate loader and saved proof-05 provenance. No Blender, browser, build, service, fixture, native-art, or Git mutations were performed. This audit does not grant art approval, gameplay acceptance, or publication permission.

## Findings

1. **Required family coverage can report complete while variants are missing.** In `prepare_armor_cassette_review.py:52–59`, a missing requested pair falls back to the old slug's replacement, and a missing port variant silently retains the unmirrored texture model. Line 93 counts only a missing resolved model. Saved proof-05 demonstrates the distinction: the service placement at y=-8 resolves to `armor-vent-w200-h300`, and identity at y=2 resolves to `armor-red-service-w200-h300`, both with non-null `candidateSlug`. Partial proof coverage is legitimate, but `fallbackHullEntries == 0` cannot certify the required final family. Record required and resolved slugs separately, count missing required pair/port coverage, and fail final staging when required coverage is incomplete.

2. **Inspection clones omit native material registration.** `armor_cassette_browser.mjs:75–81` clones AssetContainer meshes without the candidate's `registerReferencedSceneMaterial` step (`construction-authored-assembly.ts:246`). The candidate helper and its regression tests document why registration is needed: scene lighting/graphics changes otherwise miss those material shader definitions. Initial fixed lighting can still render correctly; this finding does not invalidate the whole-view proof. Apply the same registration to direct armor/exploded clones to preserve inspection parity.

3. **Packing cannot read a native directory outside the helper checkout.** `pack_framed_glb.py:395` calls `item['path'].relative_to(ROOT)`, although the armor wrapper accepts an explicit arbitrary native directory. A path under `/root/wayfarer-armor-pr` passed to the shared-tree wrapper raises `ValueError` after parity work. Keep relative paths for local sources and retain an explicit absolute path or declared source root for external candidate inputs.

## Verified boundaries

- Proof-05's two bundle manifests each contain 116 package inputs under `/root/wayfarer-framed-r001-candidate` and the shared review entry. No evolving shared-tree game package input appears. This frozen candidate remains an explicit dependency; the audit does not claim upstream main contains those runtime modules.
- Staging deep-copies visual bindings and copies the fixture bytes. It does not alter physical placement, qualification, catalog source pins, or authority state.
- Inspection placement uses the candidate loader's XY-to-X/-Z conversion, yaw, X reflection, and source-world-matrix decomposition. Exact native group matching uses the same helper. Exploded offsets are rigid presentation offsets.
- The packer verifies source hashes and serialized output parity for accessor bytes, node transforms, material/texture semantics, and selectors. No material approximation or geometry conversion was found in the reviewed packing path.
- Saved proof-05 honestly records 17 new native placements and eight previous hull binding entries. The final family and browser modes were still pending when audited. Baseline validation failures remain owned by the root task's existing validation report.

## Focused fix verification — 2026-09-14

All three findings above are resolved in the coordinator's revised helpers within this audit's scope.

- **Coverage:** `--final` rejects preserved partial proof-05 with exit 1 and `Final family requires exact model: armor-identity-pair-right-w200-h300-port`. Ordinary partial staging succeeds and records 19 missing required models separately from eight previous-binding fallbacks. Its copied fixture remains byte-identical to the qualified input. Source review also confirms final mode rejects mixed handedness within a side binding.
- **Materials:** Direct inspection clones now import and call the frozen candidate's `registerReferencedSceneMaterial` immediately after cloning. No browser was rerun for this source-level follow-up.
- **External packaging:** Copied native proof-05 to `/tmp/armor-helper-external-source-n_up8vig/proof-05` and ran the armor packer into a fresh private test directory. All six models passed native validation and serialized parity; every source-map path points explicitly into that external source directory. The resulting GLB is byte-identical to preserved packed proof-05: SHA-256 `b8e0b1baadcfc9b0aca3a85745c3080c3de616c0e989b14c3f1cc78e679a9b45`.

Commands, exit statuses and outcomes are retained in `.runtime/shipyard-completion/armor-geometry-pass-20260914/helper-audit-followup-b1ok1y6y/results.json`, with separate stdout/stderr records and fresh staged outputs. Only temporary copies/outputs and this report were written during verification. Final-family staging and browser evidence remain the coordinator's next gates; this follow-up does not approve the art or public activation.
