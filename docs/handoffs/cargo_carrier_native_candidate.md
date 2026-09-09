# Native cargo carrier candidate — r000

The technical candidate supplies native Blender1m and2m frames with an exact shared bearing interface. It demonstrates a2m base, four independently placed1m frames and another2m frame above them. It does **not** change any of the73 approved cargo models or activate the cargo-grid adapter in the game.

Parent technical review accepted the visible frame hierarchy and roof clearance, and asked for exact payload envelopes, exported contact proof and explicit excluded variants. This is not owner artistic sign-off or approval of gameplay ratings.

## Exact artifacts

- Carrier design: `assets/art-library/designs/cargo.carrier.grid-support/`, current `revisions/r000/a003/`.
- Editable native source: `blender-source.blend`; editable six-placement assembly with unchanged approved payloads: `stack-fixture.blend`.
- Individual visuals: `carrier-1m.glb`, `carrier-2m.glb`; each has native PBR material roles and sockets. Component occupancy boxes and bearing metadata are separate `*-interface.json` files.
- Actual CPU Cycles renders: `carrier-1m-cutout.png`, `carrier-2m-cutout.png`, `mixed-stack.png`, `mixed-stack-top.png`.
- `qualification.json`: actual GLB triangle/plane/material/envelope evidence, all73 exact source/hash mappings and closed payload compatibility.
- `stack-validation.json`: executable existing pure cargo solver results against these interfaces.
- `proposed-gameplay.json`: explicit sandbox game-balance ratings, unapproved and not inferred from geometry.
- Both design directories contain `artifact-manifest.json` with every preserved attempt hash. `design.staged.json` is a complete proposed ledger, intentionally not named `design.json` while the release owner holds the shared generated art index. Promote/index together.

Carrier GLB SHA256s:

| Asset | SHA256 |
|---|---|
|1m | `faa8a7b7786c4e92cfeb6ec5b25d43739ad070e202d4e2f1ee1dc98ca6877f78` |
|2m | `5e42e6ab46b00674129ffafe136affefa6586325c1149e838bf9ff693b9769fd` |

## Dimensional and contact contract

Author XY is the deck plane, Z is height. One meter is32 nominal integer units. Carrier origin is its lower-left bottom-bearing corner; GLB conversion remains author XYZ to renderer X/Z/-Y. Frame footprints are exactly1×1m or2×2m; height is22units = .6875m.

Each1m cell has a .75×.75m top and bottom bearing patch, inset .125m. The exact nominal rectangle is `[4,4,28,28]`, offset32units for each cell of the2m frame. These are actual un-beveled outward-facing native faces: two triangles, .5625m², and exactly coplanar with the interface planes. Contact validation reads the exported triangles, not just the recipe. Four1m frames cover the four required bottom patches of the upper2m frame. A missing corner fails support; all quarter turns are permitted around each frame's nominal center.

The three-tier fixture begins at deck top .1875m and ends at2.25m. The reviewed roof underside is2.5625m. A separate .15m handling allowance leaves .1625m further clearance. Orange enclosing rails are **review-only height guides**, absent from the individual GLBs and all support/collision metadata.

Collision boxes conservatively enclose individual frame components. They preserve the open interior instead of filling the entire frame AABB. Bevel voids are intentionally not walkable. Decorative trim has no independent contact rating. The exact actual geometry is within the nominal footprint; a preserved prior attempt failed because a status light exceeded it by2.5mm, and only that new light was inset in a003.

## Payload fit —13 of73, not all cargo

Each cell reserves .8125×.8125m XY. Payload bottom is .09375m and ceiling .625m relative to the carrier, leaving .53125m usable closed height. Both carrier sizes use these same cell interfaces; the2m frame has four cells, not a larger tall-payload admission rule.

These thirteen exact appearances fit at all four quarter turns:

- `standard-small`, `standard-small-red`
- `medical-small`, `medical-small-red`, `medical-small-green`, `medical-small-blue`
- `high-value-small`, `high-value-small-amber`, `high-value-small-red`, `high-value-small-blue`
- `narrow-blue`, `narrow-red`, `tiny-magenta`

For every appearance, `qualification.json` records stable asset ID, exact revision, original GLB/Blender hashes, measured bounds, accepted turns and rejection dimensions. The remaining60 appearances are excluded. In particular fuel at .864m, medium/large crates, and1.92m oversized crates cannot fit this carrier height despite some fitting a nominal horizontal reservation.

Payloads rotate about their measured neutral XY bounds center, then translate that center to the cell center and source bottom to the payload floor. Scale remains1. Standard-small's asymmetric source Y center is approximately−.03775m; assuming source origin equals center would misplace it. The demo retains the approved standard-small and red GLBs unchanged, including their native materials.

Envelope fit is not yet a payload-specific restraint qualification. Runtime admission requires a validated securing adapter/retention record; `secured:true` is deliberately synthetic in the pure solver fixture. Lids may not open into the frame above; unloading or removing the upper assembly precedes opening. Do not claim accessible open-container animation from a closed-envelope pass.

## Separate oversized fitting variant

`assets/art-library/designs/cargo.reinforced.oversized.grid-fit/revisions/r000/a002/` derives from the exact approved `cargo.reinforced.oversized/r002` source and remains independently unapproved. Only two lock levers move25mm inward along author+Y. Every other exported vertex is unchanged within1µm, all seven materials remain identical, all12 sockets remain identical, and all19,332 triangles are retained. There is no mesh/global scaling.

The closed dimensions are1.941×3.9881×1.92m, fitting a2×4m reservation after bounds-center translation.0/180° uses2×4;90/270° uses4×2. The old approved4.0111m depth remains untouched. The new variant is too tall for the low carrier and still needs its own mounting/door-sweep/authority qualification. Source occupancy gauges are retained as historical unqualified evidence, not silently promoted to new collision authority.

## Validation and next integration boundary

Executed:

```sh
python3 -m unittest scripts/art_library/test_cargo_carriers.py
python3 scripts/art_library/validate_cargo_carriers.py assets/art-library/designs/cargo.carrier.grid-support/revisions/r000/a003
npx tsx scripts/art_library/check_carrier_stack.ts assets/art-library/designs/cargo.carrier.grid-support/revisions/r000/a003
python3 scripts/art_library/validate_cargo_oversized_grid_variant.py assets/art-library/designs/cargo.reinforced.oversized.grid-fit/revisions/r000/a002
npx tsc --ignoreConfig --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --strict --skipLibCheck --types node scripts/art_library/check_carrier_stack.ts
```

Six Python tests pass. The actual exported interfaces pass98 solver assertions, including64 mixed rotation combinations; missing bottom/middle support removal; unsupported relocation; overlapping placements; floating top; ceiling; cargo-only restrictions; restraint and overload rejection. Proposed loads sum to800kg through the supported contact graph. These are synthetic game-balance masses, not measurements or structural certification. The previously staged world adapter adds atomic revision/replay/deck/grant/LOS and UUID-preservation checks; this Blender fixture does not instantiate database inventories.

No aggregate build or database publication is implied by these isolated art checks. The current release owner has source/index ownership. Next coordinated implementation must:

1. Review explicit proposed ratings and payload restraint contracts separately from art approval.
2. Pin these new definitions and qualified interfaces; promote only explicitly accepted assets/variants. Preserve existing approved sources and container UUIDs/content.
3. Register the staged cargo-grid tables/adapter with server-derived instance/deck access, destination proximity/LOS as well as source proximity, fresh revisions and custody anchors. Update actual instance placement/collision bindings atomically; a cosmetic carrier alone does not relocate cargo authority.
4. Integrate every inventory mass-changing writer with stack load validation, including liquid changes and nested inventory, or deny the unsupported operation. Never let an existing stack become silently overloaded.
5. Wire root-owned Shipyard/game placement UI to stable carrier/container IDs; preserve contents through move, rotation and dismantling. Add real isolated two-actor placement/transfer evidence, then browser review and matched publication.

No carrier gameplay capabilities, payload retention, owner art approval, or live cargo stacking are claimed complete by this candidate.
