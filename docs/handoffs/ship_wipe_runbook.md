# Runbook: wipe all player ships, retire ship assets, assign the owner's ship

**For:** the coordinator. Run it **only after the owner confirms** three things: the wipe itself, the counts shown by the dry-run, and the backup choice.
**Prepared by:** FuchsiaPanther (SHIPS-REMOVAL), 2026-09-25/26. Nothing in this runbook has been executed against live.
**Background:** [ship_asset_removal_plan.md](ship_asset_removal_plan.md).

## Ground rules

- **Live target:** server `http://127.0.0.1:3100`, database `sidereal-spacetime-dev`. Every `ship_wipe.py` command names both explicitly.
- **Never publish a main-derived world.** Do not publish a world module built from `main` or from the canonical dirty checkout. The authority candidate is built from the live source plus this PR only.
- **Never reset or roll back routinely.** Do not reset the database (`--delete-data=always`) and do not roll it back as a routine step.
- **Operator identity:** operator reducers only accept the deployment CLI identity `c2005c42…`, the same one that publishes. Run the tool from a directory whose `.tools/spacetime` is that CLI; the candidate below qualifies.
- **Choose operation IDs up front.** They make every step idempotent: re-running a step with the same ID is a no-op, and a different request under the same ID is refused. Suggested IDs:
  - `live-20260926-policy-none`
  - `live-20260926-wipe-dry-run`
  - `live-20260926-wipe-apply`
  - `live-20260926-assign-owner`
- **Publishing the module stops new legacy ships immediately.** From that moment, new accounts are created without a ship and wait for one. Existing players keep their ships until the wipe.
- **Order:**
  1. Cold backup.
  2. Publish.
  3. JSON export.
  4. Record the starter policy (none).
  5. Dry-run.
  6. Owner sign-off on the counts.
  7. Apply.
  8. Verify.
  9. Deploy the client.
  10. Assign the owner's prefab (once one is registered).

  The new client must not go live before the wipe, because existing Wayfarer scenes need the retired catalogs. The old client should not stay live long after it.

## 0. Preconditions

- **Owner confirmation:** the owner has confirmed the wipe in writing (message or issue). An agent's judgement is not confirmation.
- **Authority PR:** `feat/ship-removal-operator-tools` has been reviewed and merged into `release/live-authority-20260921`, or the coordinator explicitly uses the PR head.
- **Owner's starter pick:**
  - Candidates from SHIPS-PREFABS: `fed.s.wren`, `rj.s.jackal`, `au.s.lumen`.
  - Step 10 also needs SHIPS-PREFABS to have registered that prefab with `registerPrefabShipSpawner` in a live-compatible authority, recording its `catalogRevision`. See the plan for the integration that is still open.
  - Without it, stop after step 9. The owner's account then stays shipless; that is safe.
  - **Never** assign the legacy stand-in `legacy-wayfarer-r002` on live.
- **Timing:** choose a quiet window. Connected players see their ship disappear immediately at step 7.

## 1. Cold full-database archive (default on)

This briefly interrupts the database. Run it from the checkout that manages the live process:

```sh
cd /root/sidereal_spacetime && python3 scripts/dev.py backup-database
```

Record the printed archive path and SHA-256. The files are private, under `.runtime/`, mode 0600.

## 2. Build and publish the authority candidate

Keep scratch copies on disk, not in `/tmp`.

```sh
cd /root/sidereal_spacetime && git fetch origin
git diff origin/release/live-authority-20260921 origin/feat/ship-removal-operator-tools \
  > /root/sidereal-scratch/ship-removal-authority.patch
cp -a /root/sidereal-live-map-authority-candidate /root/sidereal-ship-removal-authority-candidate
cd /root/sidereal-ship-removal-authority-candidate
patch -p1 --dry-run < /root/sidereal-scratch/ship-removal-authority.patch && patch -p1 < /root/sidereal-scratch/ship-removal-authority.patch
npm ci --no-audit --no-fund
npm run typecheck --workspace @sidereal/world
npx vitest run packages/world/src/ship-wipe      # 10 tests
python3 scripts/dev.py generate                  # must equal the PR's packages/net/src/generated
```

**Optional re-rehearsal.** Recommended if anything changed since 2026-09-26. Use a separate copy whose `dev.toml` points at an isolated server port and database name, never 3100:

```sh
npm run smoke:ship-wipe -- --label wipe-rNNN --stage seed
npm run smoke:ship-wipe -- --label wipe-rNNN --stage wipe
```

**Schema comparison.** Before publishing, compare the schema as earlier releases did. The change only **adds**:
- three private tables: `ship_policy`, `ship_operator_operation`, `ship_wipe_archive`;
- three reducers: `operator_set_starter_prefab`, `operator_wipe_player_ships`, `operator_assign_prefab_ship`.

No existing table, reducer or view definition changes. `enter_lab` and `claim_starter_kit` change behaviour only.

**Publish:**

```sh
python3 scripts/dev.py publish          # typecheck + spacetime publish --delete-data=never
.tools/spacetime/spacetime --root-dir=.tools/spacetime describe --server http://127.0.0.1:3100 \
  --yes --no-config --json sidereal-spacetime-dev | grep -o 'operator_[a-z_]*' | sort -u
```

## 3. Pre-wipe ship export (default on; the owner may waive it)

```sh
python3 scripts/ship_wipe.py export --server http://127.0.0.1:3100 --database sidereal-spacetime-dev
```

- Keep the printed `backup` path, `sha256` and `counts`. The export is private JSON under `.runtime/ship-wipe-backups/`, mode 0600, outside git.
- At the 2026-09-21 audit, live had 3 characters and 3 ships. The instance count may be higher if Studio test ships exist.

## 4. Record the starter policy (none)

The default is already "no starter ship". Record it explicitly for the audit trail:

```sh
python3 scripts/ship_wipe.py policy --server http://127.0.0.1:3100 --database sidereal-spacetime-dev \
  --operation-id live-20260926-policy-none --starter-prefab-id ""
```

## 5. Dry-run and owner sign-off

```sh
python3 scripts/ship_wipe.py dry-run --server http://127.0.0.1:3100 --database sidereal-spacetime-dev \
  --operation-id live-20260926-wipe-dry-run > /root/sidereal-scratch/live-ship-wipe-dry-run.json
```

Show the owner these parts of `summary`:
- `counts`;
- `ships` (id, name, owner);
- `instances` (including Studio test ships);
- `characters`, with `personalItems` and `archivedItems`;
- `archivedInventory`: every item that will be archived, with the reason it is ship-held;
- `deleteRows`;
- `preservedMapRows`.

Get explicit approval of these exact numbers.

## 6. (Reserved.) There is no policy toggle to flip: publishing already stopped legacy starters.

## 7. Apply the wipe (irreversible without the backups)

```sh
python3 scripts/ship_wipe.py apply --server http://127.0.0.1:3100 --database sidereal-spacetime-dev \
  --operation-id live-20260926-wipe-apply \
  --expected-ships S --expected-instances I --expected-characters C \
  --backup /root/sidereal-ship-removal-authority-candidate/.runtime/ship-wipe-backups/<file>.json \
  --confirm-database sidereal-spacetime-dev
```

- **Counts:** S, I and C are the dry-run counts. If anything changed in the meantime, the reducer refuses and nothing happens. Then take a new dry-run under a new operation ID and get sign-off again.
- **If the owner waived the JSON export:** pass `--owner-waived-backup` instead of `--backup`, and record the waiver.
- **What the transaction does:**
  - deletes every ship and construction-instance row;
  - archives ship-held items;
  - puts every character into the awaiting-ship state;
  - preserves personal kit, appearance and receipts;
  - never writes the map.

## 8. Verify

```sh
python3 scripts/ship_wipe.py verify --server http://127.0.0.1:3100 --database sidereal-spacetime-dev \
  --backup <same backup file> --expect-wiped
python3 scripts/ship_wipe.py ledger --server http://127.0.0.1:3100 --database sidereal-spacetime-dev \
  --operation-id live-20260926-wipe-apply
.tools/spacetime/spacetime --root-dir=.tools/spacetime logs --server http://127.0.0.1:3100 --no-config \
  sidereal-spacetime-dev -n 2000 | grep -i -E "ERROR: step_world|panic"     # must print nothing
.tools/spacetime/spacetime --root-dir=.tools/spacetime sql --server http://127.0.0.1:3100 --yes --no-config \
  sidereal-spacetime-dev "SELECT scheduled_id FROM movement_timer"           # exactly one row
```

The step succeeds only if all of these hold:
- `mapUnchanged: true`;
- `charactersPreserved: true`;
- `charactersAwaitingShip` equals the character count;
- `wipedTablesEmpty: true`;
- **no `step_world` errors**;
- the world timer is retained.

Do **not** expect `world_system.last_simulation_tick` to keep advancing. `stepSharedWorld` deliberately writes no clock row for idle samples, so with zero ships and no moving bodies the tick stays put.

## 9. Deploy the game client (right after step 8)

Build from the live client source plus the client PR only:

```sh
cd /root/sidereal_spacetime && git diff origin/release/live-client-20260922 origin/feat/ship-removal-client \
  > /root/sidereal-scratch/ship-removal-client.patch
cp -a /root/sidereal-shadow-release-20260922 /root/sidereal-ship-removal-client-candidate
cd /root/sidereal-ship-removal-client-candidate
patch -p1 --dry-run < /root/sidereal-scratch/ship-removal-client.patch && patch -p1 < /root/sidereal-scratch/ship-removal-client.patch
(cd scripts && python3 -m unittest test_prepare_app)
npm run build:client
ls apps/client/dist/assets/wayfarer.glb apps/client/dist/assets/assembly/wayfarer.json 2>&1   # both must be absent
```

Stage and activate through the guarded public-client commands, exactly as in [shadow_cache_release_20260922.md](shadow_cache_release_20260922.md):
1. `python3 scripts/dev.py public-client-stage --client-artifact <dist> --client-artifact-sha256 <tree digest>`
2. `python3 scripts/dev.py public-client-activate --expected-live-client-sha256 0c48930c709ab6eae5f856e4131de3e2081454f6a80114e93a9d094727db2558 --expected-staged-client-sha256 <new digest>`

These commands restart only the public-client service. Then verify:
- **Signed out:** the login gate loads with no console or network errors.
- **Signed in:** a shipless character shows "No ship assigned". It requests no `/assets/voxels/wayfarer.glb` and no `/assets/assembly/*` files other than `floor-manifest.json` and `floor/`.

The Studio (dashboard) deployment is unchanged; it still publishes the legacy assets for its tools.

## 10. Assign the owner's prefab ship (after SHIPS-PREFABS registers it)

Identify the owner's main character, confirm it with the owner by name and account, and check that `ship_id` is `''`:

```sh
.tools/spacetime/spacetime --root-dir=.tools/spacetime sql --server http://127.0.0.1:3100 --yes --no-config \
  sidereal-spacetime-dev "SELECT id, name, owner, ship_id FROM character"
python3 scripts/ship_wipe.py assign --server http://127.0.0.1:3100 --database sidereal-spacetime-dev \
  --operation-id live-20260926-assign-owner --character-id <owner character id> \
  --prefab-id <owner-picked prefab id> --catalog-revision <that prefab's catalogRevision> \
  --spawn-pose '{"kind":"berth"}'
```

- **Pose:** `--spawn-pose` may instead name an exact world pose: `{"kind":"at","systemId":"…","x":…,"y":…,"heading":…}`.
- **What the reducer verifies, in the same transaction:**
  - the account owns exactly the new ship;
  - `game_ship_access` is active for that character;
  - the character stands on the returned spawn deck;
  - world admission exists;
  - the pose matches;
  - map row counts are unchanged.

  Anything else rolls back.
- **Replay:** re-running the same command is a no-op.
- **Final check:** the owner signs in and sees the ship.

**Optional, later:** make that prefab the starter for new accounts:

```sh
python3 scripts/ship_wipe.py policy --server … --database … --operation-id live-…-policy-starter \
  --starter-prefab-id <prefab id> --catalog-revision <rev>
```

## Rollback and recovery

- **Module:** the additive module can stay deployed.
- **Client:** stage the previous immutable artifact `0c48930c…` and activate it with the reversed expected hashes, as documented in the shadow-cache release.
- **Ships:** these are not restored by tooling. Every deleted row is in `ship_wipe_archive` (by operation ID) and in the JSON export. A full-state restore means restoring the cold archive from step 1, which discards everything after it. It needs a separate owner decision and is never a routine rollback.

## Record

Write a release handoff under `docs/handoffs/`, and keep private evidence under the canonical `.runtime/releases/`. Record:
- the owner's confirmation;
- the operation IDs;
- the dry-run counts and manifest;
- the backup paths and SHA-256 values;
- the module and client artifact hashes;
- the verify output;
- the assigned ship ID.
