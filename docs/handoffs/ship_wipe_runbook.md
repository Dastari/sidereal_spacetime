# Runbook: wipe all player ships, retire ship assets, assign the owner's ship

**For:** the coordinator. Run it **only after the owner confirms** the wipe, the counts shown by the dry-run, and the backup choice.
**Prepared by:** FuchsiaPanther (SHIPS-REMOVAL), 2026-09-25. Nothing in this runbook has been executed against live.
**Background:** [ship_asset_removal_plan.md](ship_asset_removal_plan.md).

## Ground rules

- **Live target:** server `http://127.0.0.1:3100`, database `sidereal-spacetime-dev`. Every `ship_wipe.py` command names both explicitly.
- **Never** publish a world module built from `main` or from the canonical dirty checkout. The authority candidate is built from the live source plus this PR only.
- **Never** reset the database (`--delete-data=always`) or roll it back as a routine step.
- **Operator identity:** operator reducers only accept the deployment CLI identity `c2005c42…`, the same one that publishes. Run the tool from a directory whose `.tools/spacetime` is that CLI (the candidate below).
- **Choose operation IDs up front:** they make every step idempotent. Re-running a step with the same ID is a no-op; a different request under the same ID is refused. Suggested IDs:
  - `live-20260925-policy-off`
  - `live-20260925-wipe-dry-run`
  - `live-20260925-wipe-apply`
  - `live-20260925-assign-owner`
- **Order matters:**
  1. Publish the module. This is inert: starter Wayfarers continue until step 4.
  2. Take the backups.
  3. Disable starters.
  4. Dry-run.
  5. Get owner sign-off on the counts.
  6. Apply the wipe.
  7. Verify.
  8. Deploy the client.
  9. Assign the owner's ship.

  The new client must not go live before the wipe, and the old client should not stay live long after it.

## 0. Preconditions

- The owner has confirmed the wipe in writing (message or issue). An agent's judgement is not confirmation.
- The PR `feat/ship-removal-operator-tools` has been reviewed and merged into `release/live-authority-20260921`, or the coordinator explicitly uses the PR head.
- **Assignment target (step 9):** SHIPS-PREFABS has registered the owner-picked small ship with `registerPrefabShipSpawner` in the same authority candidate. Without it, stop after step 8: the owner's account then stays shipless. The legacy stand-in `legacy-wayfarer-r002` must **not** be assigned on live, because it re-creates the retired ship.
- Choose a quiet window. Connected players see their ship disappear immediately at step 6.

## 1. Build the authority candidate (no live effect)

```sh
cd /root/sidereal_spacetime && git fetch origin
git diff origin/release/live-authority-20260921 origin/feat/ship-removal-operator-tools \
  > /tmp/ship-removal-authority.patch
cp -a /root/sidereal-live-map-authority-candidate /root/sidereal-ship-removal-authority-candidate
cd /root/sidereal-ship-removal-authority-candidate
patch -p1 --dry-run < /tmp/ship-removal-authority.patch && patch -p1 < /tmp/ship-removal-authority.patch
npm ci --no-audit --no-fund
npm run typecheck --workspace @sidereal/world
npx vitest run packages/world
python3 scripts/dev.py generate   # additive bindings; must equal the PR's packages/net/src/generated
```

**Optional re-rehearsal** (recommended if anything changed since 2026-09-25). Use a separate copy whose `dev.toml` points at an isolated server port and database name, never 3100, and run:

```sh
npm run smoke:ship-wipe -- --label wipe-rNNN
```

The rehearsal refuses the live port.

## 2. Backups (default on; the owner may waive only the JSON export)

1. **Cold full-database archive.** This briefly interrupts the database. It must run from the checkout that manages the live process:
   ```sh
   cd /root/sidereal_spacetime && python3 scripts/dev.py backup-database
   ```
   Record the printed archive path and SHA-256 (private files under `.runtime/`, mode 0600).

2. **Publish the module** (inert: the policy row is absent, so starter behaviour is unchanged):
   ```sh
   cd /root/sidereal-ship-removal-authority-candidate
   python3 scripts/dev.py publish          # typecheck + spacetime publish --delete-data=never
   .tools/spacetime/spacetime --root-dir=.tools/spacetime describe --server http://127.0.0.1:3100 \
     --yes --no-config --json sidereal-spacetime-dev | grep -o 'operator_[a-z_]*' | sort -u
   ```
   Expect `operator_assign_prefab_ship`, `operator_set_starter_ships` and `operator_wipe_player_ships`. Before publishing, compare the schema as the earlier releases did. This change only **adds** three private tables and three reducers; no existing table, reducer or view changes.

3. **Pre-wipe ship export** (private JSON outside git):
   ```sh
   python3 scripts/ship_wipe.py export --server http://127.0.0.1:3100 --database sidereal-spacetime-dev
   ```
   Keep the printed `backup` path, `sha256` and `counts`. At the 2026-09-21 audit, live had 3 characters, 3 ships and 21 inventory items. The instance count can be higher if Studio test ships exist.

## 3. Disable legacy starter ships

```sh
python3 scripts/ship_wipe.py policy --server http://127.0.0.1:3100 --database sidereal-spacetime-dev \
  --operation-id live-20260925-policy-off --enabled false
```

From here on, new accounts get a shipless character that keeps its personal kit.

## 4. Dry-run and owner sign-off

```sh
python3 scripts/ship_wipe.py dry-run --server http://127.0.0.1:3100 --database sidereal-spacetime-dev \
  --operation-id live-20260925-wipe-dry-run > /tmp/live-ship-wipe-dry-run.json
```

Show the owner these fields from `summary`:
- `counts`;
- `ships` (id, name, owner);
- `instances` (including Studio test ships);
- `characters` (with `archivedItems`, the ship-held items that will be archived);
- `deleteRows`;
- `preservedMapRows`.

Get explicit approval of these exact numbers.

## 5. Apply the wipe (irreversible without the backups)

```sh
python3 scripts/ship_wipe.py apply --server http://127.0.0.1:3100 --database sidereal-spacetime-dev \
  --operation-id live-20260925-wipe-apply \
  --expected-ships S --expected-instances I --expected-characters C \
  --backup /root/sidereal-ship-removal-authority-candidate/.runtime/ship-wipe-backups/<file>.json \
  --confirm-database sidereal-spacetime-dev
```

- **S, I, C** are the dry-run counts. If anything changed in the meantime (for example a new character), the reducer refuses and nothing happens. In that case take a new dry-run (with a new operation ID) and get sign-off again.
- **If the owner waived the JSON export,** pass `--owner-waived-backup` instead of `--backup` and record the waiver.
- **What apply does, in one transaction:**
  - deletes every ship and construction-instance row;
  - archives ship-held items;
  - puts every character in the awaiting-ship state;
  - preserves personal kit, appearance and receipts;
  - never writes the map.

## 6. Verify

```sh
python3 scripts/ship_wipe.py verify --server http://127.0.0.1:3100 --database sidereal-spacetime-dev \
  --backup <same backup file> --expect-wiped
python3 scripts/ship_wipe.py ledger --server http://127.0.0.1:3100 --database sidereal-spacetime-dev \
  --operation-id live-20260925-wipe-apply
.tools/spacetime/spacetime --root-dir=.tools/spacetime logs --server http://127.0.0.1:3100 --no-config \
  sidereal-spacetime-dev -n 200 | grep -i -E "ship wipe|step_world|panic"
```

The step succeeds only if all of these hold:
- `mapUnchanged: true`;
- `charactersPreserved: true`;
- `charactersAwaitingShip` equals the character count;
- `wipedTablesEmpty: true`;
- no `step_world` errors;
- `world_system.last_simulation_tick` keeps advancing:
  ```sh
  .tools/spacetime/spacetime --root-dir=.tools/spacetime sql --server http://127.0.0.1:3100 --yes --no-config \
    sidereal-spacetime-dev "SELECT last_simulation_tick FROM world_system"
  ```
  Run it twice, a few seconds apart.

## 7. Deploy the game client (right after step 6)

Build from the live client source plus the client PR only:

```sh
cd /root/sidereal_spacetime && git diff origin/release/live-client-20260922 origin/feat/ship-removal-client \
  > /tmp/ship-removal-client.patch
cp -a /root/sidereal-shadow-release-20260922 /root/sidereal-ship-removal-client-candidate
cd /root/sidereal-ship-removal-client-candidate
patch -p1 --dry-run < /tmp/ship-removal-client.patch && patch -p1 < /tmp/ship-removal-client.patch
(cd scripts && python3 -m unittest test_prepare_app)
npm run build:client
ls apps/client/dist/assets/wayfarer.glb apps/client/dist/assets/assembly/wayfarer.json 2>&1   # both must be absent
```

Then stage and activate through the guarded public-client commands exactly as in [shadow_cache_release_20260922.md](shadow_cache_release_20260922.md):
1. `python3 scripts/dev.py public-client-stage --client-artifact <dist> --client-artifact-sha256 <tree digest>`
2. `python3 scripts/dev.py public-client-activate --expected-live-client-sha256 0c48930c709ab6eae5f856e4131de3e2081454f6a80114e93a9d094727db2558 --expected-staged-client-sha256 <new digest>`

These restart only the public-client service. Verify:
- **Signed out:** the login gate loads with no console or network errors.
- **Signed in:** a shipless character shows the "No ship assigned" notice and requests no `/assets/voxels/wayfarer.glb` or `/assets/assembly/*` files other than `floor-manifest.json` and `floor/`.

The Studio (dashboard) deployment is unchanged. It still publishes the legacy assets for its tools.

## 8. Identify the owner's main character

```sh
.tools/spacetime/spacetime --root-dir=.tools/spacetime sql --server http://127.0.0.1:3100 --yes --no-config \
  sidereal-spacetime-dev "SELECT id, name, owner, ship_id FROM character"
```

- Confirm the character ID with the owner (name and account).
- `ship_id` must be `''`.

## 9. Assign the prefab ship (after SHIPS-PREFABS registers it)

```sh
python3 scripts/ship_wipe.py assign --server http://127.0.0.1:3100 --database sidereal-spacetime-dev \
  --operation-id live-20260925-assign-owner --character-id <owner character id> \
  --prefab-id <prefab id from SHIPS-PREFABS>
```

- **What the reducer checks after the spawn, in the same transaction:**
  - the account owns exactly the new ship;
  - `game_ship_access` is active for that character;
  - the character stands on the prefab's spawn deck;
  - world admission exists.

  If any check fails, nothing is written.
- **Replay:** re-running the same command is a no-op.
- **Confirm in the game:** the owner signs in and sees the ship.

## Rollback and recovery

- **Module:** the additive module can stay deployed; with the policy re-enabled it behaves as before.
- **Re-enable starter Wayfarers** (not recommended once the client no longer ships their assets): `policy --operation-id live-...-policy-on --enabled true`.
- **Client:** stage the previous immutable artifact `0c48930c…` and activate it with the reversed expected hashes, as documented in the shadow-cache release.
- **Ships:** these are not restored by tooling. Every deleted row is in `ship_wipe_archive` (by operation ID) and in the JSON export. A full-state restore means restoring the cold archive from step 2.1, which discards everything after it. It requires a separate owner decision. Never do it as a routine rollback.

## Record

Write a release handoff under `docs/handoffs/`, and keep private evidence under canonical `.runtime/releases/`. Record:
- the owner's confirmation;
- the operation IDs;
- the dry-run counts;
- the backup paths and SHA-256 values;
- the module and client artifact hashes;
- the verify output;
- the assigned ship ID.

Release the Agent Mail reservations.
