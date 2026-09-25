# Character faces r009 authority integration

Status: focused authority tests passed; runtime/art integration and isolated server acceptance are separate gates. No live world publication, database write, backup or service operation was performed for this handoff. The owner's instruction **“Don't backup”** remains in effect and supersedes the backup step in older release notes.

The existing appearance document can persist the new facial options without changing any table, reducer signature, view or generated binding. The current live module rejects those new fields until its content allowlist is updated. Additional hair swatches already use the existing accepted `hair` RGB field.

## Exact compatibility baseline

| Artifact | SHA-256 |
| --- | --- |
| Existing live world | `2ade8d75a75f75e5d555c8f2c3a666c69c736300dff13611dd7964ea6984ac8c` |
| Existing public client tree | `8246fafc6e13048bd1eaabd5a63d6c06dc9ca1ba983de4bdb6e466de676c4a35` |
| Existing public entry `index-B4bNcXSU.js` | `492d8bfb7e1abfc0a9a03aab3c2d7887e8342fe6182f3c5f4afdbb20f6d72bc9` |

The world hash was verified directly from `.runtime/releases/refit-airlock-20260910/world-2ade8d75.js`, including its actual appearance allowlists and reducer implementation. Public identity is `c2005c24147323197826efa22f24e30d2d99a93a5a5091949f2ad25fa2127572`. These are the audited baseline, not substitutes for fresh pre-publication reads. The historical refit `candidate.json` retains older client fields; use the newer [character/F3 release](character_f3_public_release_20260910.md) for the current client.

## Additive document contract

Every value remains a string in the existing `appearanceJson` object. The 2,048-character limit, strict unknown-field rejection, case-sensitive enum IDs and lowercase six-digit RGB canonicalization remain unchanged.

| Field | Accepted values | Default when omitted, resolved by renderer |
| --- | --- | --- |
| `eyes` | Any `#rrggbb` RGB colour | `#754c2b` |
| `expression` | `neutral`, `happy`, `stern`, `sad`, `surprised`, `wink`, `grin`, `determined` | `neutral` |
| `faceDetail` | `none`, `freckles`, `scar`, `scratch`, `tattoo`, `bandage`, `dirt`, `warpaint`, `cyber`, `birthmark` | `none` |
| `facialHair` | `none`, `stubble`, `short`, `full`, `goatee`, `moustache`, `handlebar`, `sideburns` | `none` |
| `faceAge` | `young`, `adult`, `mature`, `elder` | `adult` |

Legacy `{}` and existing body/hair/outfit documents remain valid and are not rewritten to insert defaults. Cosmetic choices do not grant equipment, change inventory, alter character identity or affect gameplay stats. Keep enum order aligned with the native atlas contract, while persisting the readable string IDs rather than atlas indices.

The minimal production server input changes are:

- [packages/content/src/character-face-options.ts](../../packages/content/src/character-face-options.ts): new shared constants.
- [packages/content/src/appearance.ts](../../packages/content/src/appearance.ts): add four enum allowlists and the `eyes` colour key.

Keep `packages/sim/src/appearance.ts`, `packages/world/src/appearance.ts`, `appearance-tables.ts`, world registration, permissions and generated bindings unchanged. The existing authenticated game reducer receives `{appearanceJson, expectedRevision, operationId}`; it selects the connected character by sender, validates the complete document, checks receipt/revision and updates only that character's appearance. The client must keep merging UI changes into the latest accepted complete document.

## Focused evidence and limits

[character-face-appearance.test.ts](../../packages/world/src/character-face-appearance.test.ts) adds 62 passing cases invoking the actual `setCharacterAppearance` and `ownAppearance` implementations with the established in-memory SDK/table adapter. Coverage includes all 30 enum values, eye/neon-hair colours, legacy documents, unsupported fields and impersonation payloads, malformed/oversized input, stale revisions, canonical duplicate replay after later writes, sender-filtered private projections, actor-scoped operation IDs, disconnection, invalid operation IDs and bounded receipts.

Validation command: `npx vitest run packages/world/src/character-face-appearance.test.ts`.

The focused run passed all 62 tests on 2026-09-10. `npm run typecheck` and `python3 scripts/check_docs.py` also passed; the latter checked 77 project documents plus legacy hashes/imported provenance. No full build, server smoke or live publication was run by this bounded test task.

These tests exercise the real reducer helper and projection logic. They do not run the registered authentication wrapper or establish real server subscription privacy, OIDC admission, transaction rollback, reconnect persistence or browser appearance. Those remain isolated runtime gates; passing these tests is not publication or final artistic approval.

## Managed release checklist

1. Recheck [current coordination](coordination-current.md). Cargo authority and generated bindings are separately owned by `shared_space_rules`; do not build or publish that in-progress world as an incidental facial-option update.
2. Create an immutable release checkout from the verified source of world `2ade8d75`. The refit receipt records runtime `f29ff4a7`, data-only `aada6bcc`, client correction `d1d716d1` and fixture checkout `a265df28`. Reproduce the unmodified pinned world hash before selecting the base; a checkpoint name alone does not prove exact source equivalence. If coordination has deliberately advanced the live world, rebase this checklist on that accepted release instead of downgrading it.
3. Overlay only the two production content files above and this focused test for the authority change. Record every source hash. Do not overlay the shared working tree's world/index, schema, cargo files, generated bindings, unrelated component catalogs or compiled output. The independently prepared r009 client/art manifest defines its own larger client source set.
4. Run the focused tests, `npm run check`, required builds and art validation in that isolated checkout. Confirm the server table/reducer/view schema is unchanged. Preserve current item/container/character UUIDs, inventory permissions, r003 paired handhelds and the approved r008 bundle. Full shared-root build is not part of this bounded test task because it regenerates concurrently owned outputs.
5. Publish the exact compiled candidate to a named isolated review database through managed tooling. Exercise the authenticated reducer and real private-view subscriptions: both bodies, every facial family, RGB canonicalization, old JSON, invalid values, stale and duplicate operations, a second actor, reconnect and stable inventory/container/appearance identity. Extend the existing `scripts/persistence-smoke.ts` and `scripts/character-components-smoke.ts` scenarios as needed in the release checkout; run the required isolated smoke. Do not claim the unit adapter proves these runtime gates.
6. After numerical, visual and authority acceptance, freeze the candidate world/client/art hashes. Immediately reread the actual live module bytes from `st_module`, database identity, current public release receipt and HTTPS entry. Record a read-only durable-row baseline. Stop on an unexpected concurrent release; reconcile with its owner. Do not back up, reset, restart the database or restore over live rows.
7. The integration owner publishes only the verified additive world from the isolated checkout using the managed `scripts/dev.py` publication path with data deletion forbidden. Activate the exact matching client with managed expected-live and expected-staged guards. New facial controls must not submit unsupported fields to old world `2ade8d75`; publishing the compatible allowlist first permits the existing client to continue operating during the handover.
8. Verify the actual installed module/client hashes, unchanged database identity, successful normal provider login and saved options after reload. Compare durable rows and attribute concurrent accepted player actions through receipts rather than claiming byte-identical inventory while users are playing. Record exact browser evidence and remaining visual limitations. Release the named browser/GPU slot. Preserve historical receipts and keep r009 artistic sign-off separate from the previous r003/r008 approval.

No candidate world/client hashes or live acceptance are recorded here yet. The integration owner fills those from the actual isolated build and subsequent managed publication rather than inferring them from source tests.

## Isolated authority candidate prepared — 2026-09-10

The world candidate is now built; this supplements the earlier preparation checklist above. No client candidate, server smoke, live acceptance or publication is implied. No database read/write, backup, reset, service operation or shared generated-binding write was performed during this bounded preparation.

The new detached worktree is `.runtime/release-checkouts/character-faces-r009-world`, based on exact commit `a265df28c6e93eff67b47fcb83180d37ac0a8db0` from the verified `.runtime/release-checkouts/refit-loading-f29ff4a7` checkout. Its tracked authority packages, lockfile, managed build script and configuration matched that source. The refit checkout's unrelated art/reference/history additions were not copied. Dependencies were installed privately with its unchanged lockfile using `npm ci --ignore-scripts --no-audit --no-fund`; the pinned SpacetimeDB 2.10.0 executable/toolchain was copied into the worktree's private `.tools`, without copying authentication configuration or runtime state.

Before any appearance overlay, `npm run world:build` reproduced the verified world byte-for-byte:

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| Untouched refit baseline | 5,449,448 | `2ade8d75a75f75e5d555c8f2c3a666c69c736300dff13611dd7964ea6984ac8c` |
| Appearance candidate | 5,455,763 | `62453c2fbfa7c33e95712bdbfd538e6100a02ed6a6de10cb5821ad653968e64b` |

The compiled candidate is retained at `.runtime/releases/character-faces-r009-world/world-62453c2f.js`. Its baseline reproduction, complete preparation manifest, 296 tracked authority input hashes, build/test logs and compiled code diff are beside it. The full artifact includes its inline source map; `world-code.diff` omits only source-map/debug-ID comments for readable review.

Only these files were overlaid:

| Source | Before SHA-256 | Candidate SHA-256 |
| --- | --- | --- |
| `packages/content/src/appearance.ts` | `22226f1768bd55ffcc2c7e532884c5f15eed9bd59ec852f75a71a3d74942c3ab` | `c335ea7998d724a2aaa3185b123ed9878d8f144492d92d07b9ed6e3cb11a0df7` |
| `packages/content/src/character-face-options.ts` | New | `25de831d0a3c29181b06da304dbc81dcbcc6a782f9639da2f5f8866b901b06f4` |
| `packages/world/src/character-face-appearance.test.ts` | New test only | `9157d7c5cc15c3620a1db0b7a4a5515ddc55b5e6b696694c51ef4d4102d0b4bd` |

All other tracked content/sim/world authority inputs remain byte-identical to the reproduced baseline. Auditing the actual compiled source maps found 164 baseline dependencies and 165 candidate dependencies: only `../content/src/appearance.ts` changed, only `../content/src/character-face-options.ts` was added, and none were removed. The exported reducer/view list is identical; table definitions, permission logic, inventory, cargo, character UUID handling and all other implementation sources are unchanged. This candidate contains no new cargo authority or unapproved cargo asset dependency from the shared working tree.

The candidate passed its managed world typecheck/build and all 64 focused tests in the isolated checkout:

```text
npm run world:build
npx vitest run packages/world/src/character-face-appearance.test.ts packages/sim/src/appearance.test.ts
```

Both baseline and candidate builds emitted the existing SpacetimeDB CLI `tsc not found in node_modules` advisory and construction/auth circular-dependency warnings. The managed command's explicit workspace TypeScript check passed before bundling; both build commands exited successfully. The exact warnings are retained in `baseline-build.log` and `candidate-build.log`.

Full aggregate checks, client/art candidate preparation, real isolated server smoke, authenticated/private-view acceptance and subsequent release remain with the integration owner. Publish or test only the frozen artifact matching the full candidate hash above after those gates; do not rebuild from the concurrent shared world checkout or treat this preparation as a database backup or live deployment.

## Isolated full server smoke passed — 2026-09-10

The subsequent authorised real-server smoke passed through the managed command, run from the verified authority checkout:

```text
npm run smoke -- --fresh-smoke --smoke-name faces-r009
```

The lifecycle first reserved the unused `sidereal-spacetime-dev-faces-r009-r0001-smoke` database, then built/published this isolated checkout with `--delete-data=never` and ran the normal complete smoke suite. This command did not enter any backup, reset, service-start/stop or restart branch. Its printed `restartCommand` was informational and was not executed.

| Evidence | Exact result |
| --- | --- |
| Isolated database | `sidereal-spacetime-dev-faces-r009-r0001-smoke` |
| Database identity | `c2006ae0a2099c0767e2b57ba484ff97b91b71fe01d9c2feaa8e6e717f8d991b` |
| Actual installed module SHA-256 | `62453c2fbfa7c33e95712bdbfd538e6100a02ed6a6de10cb5821ad653968e64b` |
| Module verification | Managed read-only CLI `SELECT program_bytes FROM st_module`, decoded and hashed; 5,455,763 bytes |
| Full result and sanitised appearance evidence | `.runtime/releases/character-faces-r009-world/isolated-smoke-evidence.json` |
| Installed-module verification record | `.runtime/releases/character-faces-r009-world/isolated-installed-module.json` |
| Complete managed command log | `.runtime/releases/character-faces-r009-world/full-smoke.log` |

The full suite passed flight, asteroid/native bow/room collision, walking, sprint/reset, IFCS authority expiry, permissions/private projections, revision/retry handling, inventory packing/equipment/hotbar, interactions/reach/seating/lights, accepted combat, construction denials and two-account appearance/inventory/equipment reconnect. The existing character-components smoke still honestly reports `nativeArmoryIssued: false`, `components: 0`: it proves both body choices/reconnect, while native scoped armory issuance and the legacy 90-component equipment journey remain separate coverage.

The only additional non-module source change is `scripts/persistence-smoke.ts`, also retained in the shared source for future full smoke runs. Its baseline SHA-256 was `af8ac44ec16c0ba249925bebe70d77173b6063452bc7013fd6166a26dc6750fe`; the r009 smoke script SHA-256 is `7f92bb2769c3b45bbdf197e9221200687829256addde126d4c570e6e1d90759e`. It adds the new fields and explicit canonical-value/rejected-document assertions while preserving the original operation IDs, expected revisions, duplicate/eviction journey, private subscription probes, full snapshots and two reconnect passes. It does not enter the world bundle.

The two persisted full documents included these independently accepted face choices:

| Body | Eyes / hair | Expression / detail / facial hair / age | Final appearance revision | Inventory revision |
| --- | --- | --- | ---: | ---: |
| Male | Amber `#c88a2b` / electric blue `#2864ff` | determined / scar / handlebar / elder | 130 | 4 |
| Female | Cyan `#29d9ef` / hot pink `#ff2497` | wink / freckles / none / young | 1 | 4 |

The original male 129-receipt loop accounts for revision 130; the female remains at revision 1. Malformed eye RGB/null values and unknown expression/detail/facial-hair/age/body enums were rejected at revision 1 without changing the accepted complete document. Uppercase RGB input was canonicalised to lowercase. Each character retained seven items, three containers, stable character/ship/item/container UUIDs, equipped weapon and hotbar state across the existing complete reconnect comparisons. Unauthorised private-table subscriptions and cross-account equipment access were rejected.

The original token-bearing smoke evidence remains mode 0600 under the checkout's `.runtime/smoke-runs/sidereal-spacetime-dev-faces-r009-r0001-smoke/`. The release evidence copies only sanitised fields and snapshot digests. These are development-identity, actual-server checks, not ordinary-provider/OIDC browser acceptance, process-restart persistence, final visual approval or a public deployment. The main integration owner retains those release gates. No live database or existing service was changed by this smoke task.
