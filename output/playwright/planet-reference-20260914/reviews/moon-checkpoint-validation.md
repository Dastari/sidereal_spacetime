# Nine-family moon preservation checkpoint validation — 2026-09-14

Parent explicitly authorized scoped canonical checkpoint writes after read-only proposal. Implementation source is `checkpoint_moon_history.py`; exact nine-family result is `moon-checkpoint-result.json`.

Preserved35 source revisions,1,229,481,054 evidence bytes,19 exact moon references, separate source revision numbering and pinned main-world revisions. All old revision records, feedback entries, approvals, owner_final_signoff and reference mappings were asserted unchanged before each write and independently compared afterward with saved pre-checkpoint ledgers. Every new ledger evidence SHA-256 was reverified. PASS for all9families. No main-world artifact overwritten. Global catalog/status/index not regenerated; scoped DESIGN.md views only. Remaining Gasr3/r4/Icer2 work is stored as open/unreviewed, not inferred visual acceptance. Preserved snapshots do not automatically include files completed after checkpoint time; later captures/reviews need subsequent explicit attachment.

`python3 scripts/art_catalog.py check`: FAIL only for source inventory changed and stale generated index/status. No invalid coverage, missing evidence or evidence hash mismatch reported. Global refresh intentionally outside authorized scope.

`npm run check`: FAIL with2,047 tests passed and1 timed-out test: `packages/render/src/environment/planet-terrain.test.ts`, excessive hero detail degradation exceeded20s. No implementation/code edits were made by checkpoint. Isolated retry recorded separately; full check is not claimed green.

`npm run build`: PASS; existing chunk-size advisory only. Logs saved adjacent. No commit, deployment or publication performed.

Isolated `npx vitest run packages/render/src/environment/planet-terrain.test.ts` retry: PASS, all5 tests. This supports load-sensitive timing as a possibility; it does not erase the full-check timeout or establish a cause.
