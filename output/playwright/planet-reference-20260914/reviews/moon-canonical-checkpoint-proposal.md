# Canonical moon checkpoint proposal — 2026-09-14

Read-only inspection of nine family design ledgers, catalog/reference mappings, covered-reference history and guarded command implementation. No edits, splitting or index regeneration performed.

## Existing exact registry

All19 moon crop IDs remain members of their existing family designs below. Catalog and individual reference.json agree. **None of these19 references is listed in any canonical revision covered_reference_ids.** Actual authored moon work nevertheless exists under output; this is unregistered work, not untouched reference-only art.

| Existing design ID | Current main revision | Next checkpoint slot | Exact moon coverage |
|---|---:|---:|---|
| `environment.planet.rocky` | r010 | r011 | `planets--rocky-moon-1`, `planets--rocky-moon-2` |
| `environment.planet.temperate` | r003 | r004 | `planets--temperate-moon-1`, `planets--temperate-moon-2` |
| `environment.planet.desert` | r014 | r015 | `planets--desert-moon-1`, `planets--desert-moon-2` |
| `environment.planet.ice` | r026 | r027 | `planets--ice-moon-1`, `planets--ice-moon-2` |
| `environment.planet.volcanic` | r023 | r024 | `planets--volcanic-moon-1`, `planets--volcanic-moon-2` |
| `environment.planet.gas-giant` | r005 | r006 | `planets--gas-giant-moon-1`, `planets--gas-giant-moon-2`, `planets--gas-giant-moon-3` |
| `environment.planet.ocean` | r007 | r008 | `planets--ocean-moon-1`, `planets--ocean-moon-2` |
| `environment.planet.toxic` | r007 | r008 | `planets--toxic-moon-1`, `planets--toxic-moon-2` |
| `environment.planet.crystal` | r013 | r014 | `planets--crystal-moon-1`, `planets--crystal-moon-2` |

## Minimal safe checkpoint now

Keep these mappings and append one explicitly **moon-variant checkpoint** revision per family at the next slot above. This is the smallest change and does not require a canonical mapping migration. Set covered_reference_ids to only the exact moon refs for which preserved artifacts are actually attached; never include main-world coverage merely because its kit was reused. The existing main revisions/artifacts and owner feedback remain byte-for-byte intact. Current_revision becomes the family checkpoint number; it does NOT rename the pinned source revision of any main or moon asset.

Within each checkpoint directory preserve a manifest plus separate immutable `<reference-id>/source-rNNN/` folders for every meaningful existing moon iteration, including failed r001, r002 trials and optical diagnostics. Record original output path, source revision, hashes, reused foundation design/revision/hash, exact capture context, author/reviewer, individual working pass/open result, missing LOD/hardware/owner gates and links to independent reports. This explicitly distinguishes canonical checkpoint numbering from source-art numbering. For rocky-moon-1, preserve original output `rocky-moon-r001/r002` naming as provenance; do not confuse r002 with rocky-moon-2.

Use the revision's hypothesis/change to say this is a retrospective preservation checkpoint of independently authored moon variants. A family checkpoint with several exact covered refs is a variant container, not a claim that one mesh satisfies every ref. Keep each result separate in its manifest/review and no blanket owner approval. Preserve actual timestamps where known and record checkpoint time separately; do not fabricate earlier canonical start events.

Append a family-level feedback/next-action note pinning the still-current main deliverable to its earlier revision. Especially Ice: owner feedback stays onr025, exact quote preserved, resolved_by_revision remains untouched unless separately justified; r026 selected-glass work remains its own main deliverable. No unsigned moon checkpoint can resolve or inherit that owner feedback. All nine owner_final_signoff values currently null; preserve them and empty approvals.

All families currently have in-progress current work, so the normal `start` command refuses until it is honestly checkpointed. Do not silently relabel the main working pass as owner-approved or failed merely to bypass this guard. The existing explicit checkpoint utility pattern can append a preservation entry while preserving main revision facts; validate monotonic contiguous history. Document that the newest family pointer is a moon checkpoint, not a replacement rendered main world.

## When a separate canonical design is needed

No separate design is required merely to preserve current evidence. Before production integration, an explicit distinct morphology such as crystal-moon-2's angular crystalline chunk should have a precise canonical variant/design decision. Rocky-derived desert/temperate/ocean/gas moons likewise must retain explicit recipes; their source reuse does not change their reference membership automatically.

The guarded `split` command currently sees no recorded moon coverage and would allow a split, but also runs global `refresh()` and initializes a new child r000. Calling it now without importing ALL already-authored output history would conceal worked assets behind a new reference-only ledger. Thus do not use it as an incidental checkpoint shortcut. If choosing separation now, write a deliberate history-preserving migration mapping each exact moon ref to a new ID such as `environment.planet.crystal.moon-2`, retain reusable asset/reference UUID provenance, preserve all source iterations and original paths, carry no main-world approval, and regenerate only reviewed affected views. Once family checkpoints cover moons, ordinary split correctly refuses; later migration must account for those historical coverage links rather than deleting them.

The minimal checkpoint recommendation deliberately avoids modifying catalog.json, reference.json, BRIEF.md, global status/index or mapping history. Only the nine family design.json files and new revision directories/targeted generated design views need changes. Do not overwrite unrelated global library state.

## Existing invalid Gas coverage discovered

`environment.planet.gas-giant` r001–r005 currently use `planets--gas-giant-world`, which does not exist among that design's reference_ids. The actual exact reference is `planets--ringed-gas-giant`. `art_catalog.py check` explicitly rejects coverage outside reference_ids. Correct this metadata transparently with an audit note describing the mistaken ID and unchanged source/artifact hashes; do not invent a new crop or alter pixels to fit the typo. The checkpoint helper hard-codes world suffixes and needs the explicit gas mapping to avoid recurrence. This is independent of moon mapping and was not changed by this read-only review.
