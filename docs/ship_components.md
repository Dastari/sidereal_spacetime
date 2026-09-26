# Ship components

Status: **proposed**. Every value is a proposed design value. Nothing here is owner-approved balance, economy or art.

| Area | State |
| --- | --- |
| Catalog data, validators, systems compiler, flight adapter | *Implemented* as pure code |
| Component GLBs | *Proposal art* |
| Authority, reducers, live resource simulation, runtime publication | *Not implemented* |

Date: 2026-09-25 · Schema: `sidereal.ship-components.v1` · Catalog revision 1.

This is the ship component catalog: engines, power, thermal, weapons, ammunition, defense, sensors, utility tools, edge modules and interior systems. It has 132 entries. It also covers how components hook up to the power, data, coolant, fuel, air and ammo networks, and how a list of placed components compiles into ship stats and feeds the existing flight compiler. Related documents:

- [Shipyard player builder design](shipyard_player_builder_design.md): hardpoint size classes (§12.8, r006, r007) and the prefab and performance rules (§8, P5).
- [Game scope](game_scope.md): the utility-network requirements.
- [IFCS integration](ifcs_integration.md): the flight compiler this feeds.

## Where things live

| Piece | Path |
| --- | --- |
| Types, units, frames, catalog validator | `packages/content/src/ship-components.ts` |
| Canonical tables (TypeScript) | `packages/content/src/ship-components-source.ts` |
| Checked-in snapshot for tools (Blender, docs, other languages) | `packages/content/src/ship-components.v1.json` |
| SM/MD/LG balance fits | `packages/content/src/ship-components-reference-fits.ts` |
| Systems compiler, hardpoint fit, port compatibility, auto-wire, flight and service adapters | `packages/sim/src/ship-systems.ts` |
| Regenerate the JSON and the tables below (`-- --check` to verify) | `npm run ship-components:export` |
| Headless Blender GLB exporter and manifest | `scripts/art_library/ship_component_export.py` |
| r002 builders (turret stacks, palette, detail pass, consoles, damage variants) | `scripts/art_library/ship_component_art.py` |
| Catalog sheets, exploded views, damage and variant rows, network diagram renders | `scripts/art_library/ship_component_sheets.py`, `ship_component_views.py`, `ship_component_network.py` |
| Exported proposal art (LFS) | `assets/art-library/ship-components/r002/glb/<id>.glb` and `manifest.json` (current); `r001/` is kept as history |

A vitest test keeps the TypeScript tables and the JSON snapshot identical.

## Model

**Ids.** Ids take the form `kind[.variant].size`, for example `ion-drive.md`, `ion-drive.salvaged.xl`, `magazine.missile.lg` or `cargo-door.4m`. They name reusable designs. A placed component has its own placement id; reusing a design never merges gameplay identities.

**Size classes.** Hardpoint cells are SM 1×1, MD 2×2, LG 3×3 and XL 4×4 m.
- XL propulsion is rear-only (`mount.rearOnly`).
- A component may sit on a larger hardpoint through an adapter, which raises a warning. It may never sit on a smaller one.
- Edge sockets are sized by width: SM 2 m, MD 4 m, LG 6 m and XL 8 m. The cargo doors are 2, 4 and 6 m.

**Frames.** All frames are part-local, in metres: +X starboard, +Y forward and +Z up.

| Mount | Origin | Orientation |
| --- | --- | --- |
| Face, rear, edge | Hardpoint centre on the hull face | The part stands out along −Y. Thrust acts along +Y. |
| Top | Hardpoint centre on the roof | The part rises along +Z. Barrels and emitters face +Y. |
| Interior | Footprint centre on the floor | Access side is +Y. |

- A placement applies the optional mirror first, then counter-clockwise quarter turns: rear 0, starboard 1, fore 2, port 3. This matches `transformFlightVector`.
- `mount.frame` records the frame a part is authored in.
- `shipMountRotation(frame, socket)` re-mounts a part onto another socket class, for example a top turret on a hull face or a bottom tractor. It applies before the yaw.
- In the GLBs, part (x, y, z) becomes glTF (x, z, −y).

**Per-component stats.**

| Group | Fields |
| --- | --- |
| Mount | Sockets, cells, envelope, clearance (plume, fire arc, beam, sweep or door swing) |
| Physical | Mass; integrity (hp, flat armour, destroyed effect, explosion damage) |
| Crew | Operators, station role; automation `passive`, `computer` (needs a computer-core control slot) or `manual` (needs an occupied console of that role); berths |
| Power | idle / active / peak kW; generation kW; storage kWh; max discharge and charge kW |
| Heat | idle / active / peak kW; rejection kW; heat-sink storage MJ |
| Fluids | Coolant demand and supply L/s; fuel idle and active L/s; tank litres; air supply m³/s; crew supported; O₂ reserve crew-hours |
| Data | kbit/s demand and supply; control slots provided and used |
| Type-specific block | `propulsion`, `weapon`, `magazine`, `shield`, `armor`, `sensor`, `tool`, `access`, `control` or `gravity` |
| Economy | Cost, build time and tech tier. These are placeholders. |

**Damage states.** These are catalog-wide. A component is pristine at ≥75 % hp and scuffed at ≥50 %; both run at full performance. At >0 % it is damaged and runs at 50 %. At 0 it is destroyed.

## Networks and ports

Every rated flow has a typed port. `validateShipComponentCatalog` rejects any component that, for example, consumes power without a `power-in` port or runs hot without a coolant input.

| Channel | Catalog unit | construction-services quantity | Medium / connector | Sheet colour |
| --- | --- | --- | --- | --- |
| `power` | kW | J/s (×1000) | `electric-dc` / `pwr-std` | red |
| `data` | kbit/s | byte/s (×125) | `optical` / `dat-std` | blue |
| `coolant` | L/s | kg/s (×1.04) | `glycol-water` / `cool-std` | white |
| `fuel` | L/s | kg/s (×0.8) | `fuel` / `fuel-std` | amber |
| `ventilation` (air) | m³/s | mol/s (×41.6) | `air` / `atm-std` | yellow |
| `ammo` | rounds/s | not routed yet | `ballistic` / `missile` / `torpedo`, `feed-std` | violet |

**Port definitions.**
- Each port has an id, channel, direction (`in`, `out` or `both`), capacity, medium, connector family, part-local position and unit normal.
- External mounts put their ports on the mount plane with the normal pointing into the hull. Interior parts put them in the floor utility layer with the normal −Z.
- Capacities cover the rating they serve: power-in ≥ peak, coolant-in ≥ demand, fuel-in ≥ 1.25 × active flow.
- Docking ports add `shore-*` pass-through ports (`both`).

**Connections.** Connections are explicit logical links from an `out`/`both` port to an `in`/`both` port. Channel, medium and connector family must match, and every input has exactly one feeder.

**Bus mode.** When connections are omitted, `compileShipSystems` treats each channel as one ideal ship bus. This is a design-time estimate.

**Auto-wiring.** `autoWireShipComponents` proposes deterministic links. It prefers primary suppliers (generators and batteries, pumps, tanks, cores, life support), then sources with spare capacity, then the nearest placed port. It falls back to flow-through outlets only for loop returns. All three reference fits auto-wire into explicit networks with no errors.

**Physical routes.** Routes, feedthroughs and pressure boundaries remain construction-services work. `shipComponentServicePorts` converts placed ports to that module's lattice ports.

## How the numbers were chosen

The anchors are the existing IFCS lab values:

| Anchor | Value |
| --- | --- |
| Wayfarer mass | 12 t |
| Main thrust | 36 kN |
| Profile max acceleration | 3 m/s² |
| Flight computer | 500 W |
| Fuel density | 0.8 kg/L |
| Flight speeds | Tens of m/s |

Ships therefore land between 2 and 4 m/s² forward. Fighters are hardest (≈4 m/s²); frigates and corvettes sit around 2–2.6 m/s².

**Propulsion.**

| Family | Thrust SM / MD / LG / XL | Character |
| --- | --- | --- |
| Ion drive | 11 / 24 / 50 / 95 kN | Electric. About 5 kW per kN, heat ≈35 % of draw, very low propellant. The effective Isp is derived, not tuned. |
| Thrust block | 16 / 34 / 70 / 130 kN | About 45 % more thrust per size, about 7× the propellant, little power, hotter. |
| Salvaged ion | 85 % of ion thrust | 120 % power, 150 % heat, 70 % hp and 40 % cost. Burns on destruction. |
| Aurelian resonance | Ion ×1.15 | Propellant-free, cooler, explodes when destroyed. Tech tier 4. |
| RCS SM / MD | 3 / 9 kN | Both fit in one cell. |
| VTOL, warp | — | Flagged `future`: vertical and jump gameplay need their own designs (AGENTS.md). |

**Power.**
- Reactors produce 250 / 700 / 1800 kW. Waste heat is about 20 % of the power delivered, and fuel scales with load.
- Batteries cover sustained deficits (20 / 60 / 160 kWh).
- Capacitors hold pulse energy (0.4 / 1.2 / 3.5 kWh at up to 7.5 MW).
- Pulse weapons (railgun, plasma) need a bank that holds one shot per mount. The reactor pays their average draw.

**Thermal.**
- 1 L/s of coolant carries 25 kW, which is a water-glycol loop with about a 6 K rise.
- Components with more than 5 kW of active heat need coolant equal to active heat / 25.
- Radiators reject 60 / 160 / 400 kW, but only up to what the pumps move. The effective rejection is min(radiators, pumps × 25 kW) + hull passive.
- Heat sinks buffer deficits: time to overheat = storage / deficit.

**Weapons.**
- Energy weapons draw energy per shot × shots per second while firing. Heat is 70 % of that for lasers, 45 % for railguns and 85 % for plasma.
- Ballistic and missile weapons feed from magazines. Capacity is by mass (ammo types list kg per round), and feed rate is limited by the magazine's ammo port.
- Ranges run from about 600 m (point defense) to 7 km (torpedo). The target and sensor band is 3–10 km.

**Modes.** The compiler evaluates four modes:

| Mode | Loads |
| --- | --- |
| `cruise` | Forward main engines, maneuvering thrusters, sensors and life support active; weapons and tools idle |
| `combat` | Adds weapons and shields; all engines active |
| `industry` | Tools active, main engines idle |
| `peak` | Everything at peak |

**Brownout.** Under a deficit, batteries cover up to their discharge limit. Beyond that, loads are supplied in priority order: interior/life support, then thermal/structure/power/ammunition, then sensors, then shields, then propulsion, then weapons, then tools. Starved engines lower the actuator `supply` passed to `compileFlightDefinition`, so brownouts reduce the real flight envelope.

**Balance fits.** The fits below close their cruise budgets. The fighter and corvette are intentionally heat-limited in combat, at 5–7 minutes. The corvette runs combat partly on its battery (about 23 minutes). The frigate needs its capacitor bank for two railguns.

## Validation rules (`compileShipSystems`)

Errors:
- unknown, duplicate or future components (unless `allowFuture`)
- missing, unknown, occupied or misaligned hardpoints; socket, size, footprint, rear-only or edge-width violations
- incompatible or duplicate-input connections; unconnected consumer ports; networks with consumers but no supply
- no generation, cruise brownout or unsustainable cruise heat
- fuel burners without a tank
- computer-controlled parts without a core, or control slots exceeded
- manual components without their console, or thrust without a navigation console
- life support below the minimum crew
- ammunition weapons without magazine stock
- pulse weapons without enough capacitors
- shield generators without an emitter

Warnings:
- combat brownout
- pump-limited radiators and coolant shortfall
- combat overheating in under 2 minutes
- data bandwidth exceeded
- berths short
- ammo feed limited
- emitters without a generator, or a shield bubble smaller than half the hull length
- undersized adapters

## Art (proposal r002; r001 kept as history)

r002 answers the first independent art review (VERIFY batch 1, 10/27). It is still a proposal awaiting review.

**Turret stack.** Every turret weapon and utility mount (PD, twin autocannon, laser, railgun, missile pod, flak, plasma, shield, tractor, sensor, clamp, beacon) uses the reference stack:
1. hardpoint connector
2. two-step bevelled octagonal plinth with inset lights
3. rotation ring
4. yoke
5. housing
6. real payload:
   - twin long barrels with recoil sleeves and muzzle brakes
   - a rail barrel about 2× the housing length
   - a cooling jacket with a lens
   - quad or six-barrel clusters
   - tube caps
   - a plasma emitter with cooling rings
7. extras: ammo drum, targeting module or power junction

The parts stay separate so every weapon has an exploded view.

**Palette.** The `orion` theme, which is also the GLB base colour, uses:
- lavender-grey body
- charcoal-navy darks
- crimson accent
- saturated cyan and amber emissives at lower strength, so they no longer clip to white

The other themes (federation, riftjack, aurelian) swap through the same nine slots.

**Detail pass.** A deterministic pass adds panel plates with 1-texel seams, corner bolts, vents and a few indicator lights. It runs on exposed faces of every non-engine builder. Engines keep the r001 design, which the review rated as the strongest part.

**Interiors.**
- Consoles have chunky desks, big two-tone multi-cell screens with UI bars, and chairs.
- Hydroponics has voxel plants. The plants use the accent slot, and the renders theme it green.

**Presentation only (renders, not exported GLBs):**
- a damage-state row: pristine, scuffed, damaged, destroyed
- theme variant rows
- a 1 m grid and a 1.8 m crew figure for scale

**Envelope clipping.** The exporter clips art to the catalog envelope, which is authoritative. The catalog heights and forward reach were updated to the measured r002 art.

### Exporter


`ship_component_export.py` builds one GLB per component and size (128 files; armour plates have no mesh because armour is voxel ship structure). It works from the studless brick kit in `scripts/art_library/ship_kit_prototype.py` plus new builders for kinds the kit lacked:

- torpedo launcher, plasma turret, radar array, scanner mast, salvage arm, mining laser, drone bay
- reactor, battery, capacitor, fuel tank, radiator, coolant pump, heat sink
- magazines, shield generator, life support, air filter, O₂ tank, hydroponics, gravity unit, computer core, consoles, bunk
- 2/4/6 m cargo doors, airlocks, hatches, docking ports
- resonance drive, VTOL, warp

What each GLB contains:
- Nine material slots in fixed order: `slot0_primary`, `slot1_secondary`, `slot2_accent`, `slot3_trim`, `slot4_metal`, `slot5_dark`, `slot6_emit_a`, `slot7_emit_b`, `slot8_glass`. glTF keeps only the slots a mesh uses; the manifest lists them.
- The applied brick bevel.
- `port.<id>` nodes carrying channel, direction and capacity extras.
- Root extras with the component id and schema.

The manifest records the sha256, bytes, triangle count, measured bounds and envelope fit for each GLB. Every mesh fits its catalog envelope within the bevel tolerance.

Excluded from the GLBs: plumes, labels, decals, damage-state variants and the detail bump, which does not survive glTF.

Runtime publication is separate and belongs to prefab ship integration. None of this art is owner-approved.

## Gaps

- **Not built yet:**
  - authority and reducers
  - live fuel and energy deduction
  - pressure, voltage or thermal solvers
  - drones, missiles and mines as entities
  - component damage application
  - refit jobs and costs
- **Networks** are logical links. The ammo feed is not a routed channel.
- **Stats only, no art:** armour classes carry stats but are voxel structure with no component GLB. Future entries (VTOL, warp) are placeholders.

<!-- ship-components:generated:begin -->
Generated by `npm run ship-components:export` from catalog revision 1: 132 components (propulsion 21, power 15, thermal 8, weapon 23, ammunition 6, defense 10, sensor 9, utility 12, structure 9, interior 19).

### Balance sheets (reference fits, bus mode)

| Measure | SM fighter balance fit | MD corvette balance fit | LG frigate balance fit |
| --- | --- | --- | --- |
| Status (issues) | ok (heat-combat-limited) | ok (heat-combat-limited, power-battery-combat) | ok (power-battery-combat) |
| Hull / components / fuel / ammo t | 2.6 / 4.5 / 0.3 / 0.6 | 9 / 15.1 / 1.1 / 2.7 | 38 / 50.5 / 4.7 / 7.4 |
| Total mass t | 8.0 | 27.9 | 100.6 |
| Thrust fwd / rev / lat kN | 32 / 6 / 6 | 59 / 50 / 18 | 258 / 86 / 36 |
| Accel fwd / rev / lat m/s² (flight envelope) | 4.01 / 0.75 / 0.75 | 2.11 / 1.79 / 0.64 | 2.56 / 0.85 / 0.36 |
| Yaw accel rad/s² | 0.256 | 0.170 | 0.040 |
| Generation kW / battery kWh | 250 / 20 | 700 / 60 | 2500 / 160 |
| Power cruise: demand kW (balance) | 88.06 (+161.94) | 533.27 (+166.73) | 1516.4 (+983.6) |
| Power combat: demand kW (balance) | 220.06 (+29.94) | 854.77 (-154.77, battery 1396 s) | 2537.4 (-37.4, battery 15402 s) |
| Power peak: demand kW (balance) | 267.41 (-17.41, battery 4135 s) | 1120.66 (-420.66, battery 513 s) | 3312.47 (-812.47, battery 709 s) |
| Heat rejection kW (radiators, pump-limited + hull) | 120 + 15 | 380 + 30 | 1920 + 60 |
| Heat cruise: generated kW → time | 93.79 → sustained | 313.77 → sustained | 983.8 → sustained |
| Heat combat: generated kW → time | 194.91 → 334 s | 556.91 → 408 s | 1705.08 → sustained |
| Heat peak: generated kW → time | 241.64 → 188 s | 654.94 → 245 s | 2149.15 → 355 s |
| Coolant supply / demand L/s | 8 / 6.52 | 28 / 21.51 | 96 / 68.48 |
| Fuel L; cruise burn L/s → endurance | 400; 0.2519 → 26 min | 1400; 0.3121 → 75 min | 5900; 0.9634 → 102 min |
| Data kbit/s used/available; control slots | 625/4000; 8/8 | 1750/12000; 15/20 | 5160/32000; 22/48 |
| Crew min / berths / life support | 1 / 2 / 4 | 3 / 4 / 13 | 7 / 8 / 32 |
| Weapons: alpha / sustained dps / max range | 157 / 493 / 1200 m | 856 / 623 / 3500 m | 5918 / 1026 / 6000 m |
| Ammo sustain (continuous fire) | ac-30mm 94 s | ac-30mm 385 s, pd-20mm 385 s, missile-std 40 s | flak-40mm 135 s, pd-20mm 135 s, rail-slug 135 s, missile-std 30 s, torpedo-hvy 150 s |
| Shield hp / recharge / radius | 800 / 25 hp/s / 8 m | 2400 / 60 hp/s / 16 m | 6500 / 150 hp/s / 28 m |
| Sensors max range | 3000 m | 6000 m | 8000 m (360° radar) |
| Cost / build time (placeholders) | 56400 cr / 38 min | 183500 cr / 104 min | 638500 cr / 296 min |

### Component tables

#### Propulsion (21)

| Id | Size | Sockets | Mass kg | HP | Power idle/active/peak kW | Gen kW | Heat kW | Coolant L/s | Fuel L/s | Data kbit/s | Key stats | Cost |
| --- | --- | --- | --: | --: | --: | --: | --: | --: | --: | --: | --- | --: |
| `ion-drive.sm` | SM | rear/face 1×1 | 380 | 140 | 2/60/72 | – | 21 | 0.84 | 0.012 | 20 | 11 kN main, Isp 116842 s, gimbal 5° | 4200 |
| `ion-drive.md` | MD | rear/face 2×2 | 900 | 300 | 4/130/156 | – | 46 | 1.84 | 0.026 | 20 | 24 kN main, Isp 117660 s, gimbal 5° | 9800 |
| `ion-drive.lg` | LG | rear/face 3×3 | 2000 | 520 | 8/260/312 | – | 91 | 3.64 | 0.054 | 30 | 50 kN main, Isp 118023 s, gimbal 5° | 21000 |
| `ion-drive.xl` | XL | rear 4×4 | 4200 | 820 | 15/480/576 | – | 168 | 6.72 | 0.1 | 40 | 95 kN main, Isp 121091 s, gimbal 5° | 42000 |
| `thrust-block.sm` | SM | rear/face 1×1 | 320 | 160 | 1/10/12 | – | 20 | 0.8 | 0.08 | 20 | 16 kN main, Isp 25493 s, gimbal 8° | 3200 |
| `thrust-block.md` | MD | rear/face 2×2 | 800 | 340 | 1.5/20/24 | – | 42 | 1.68 | 0.17 | 20 | 34 kN main, Isp 25493 s, gimbal 8° | 7600 |
| `thrust-block.lg` | LG | rear/face 3×3 | 1800 | 600 | 3/38/45.6 | – | 85 | 3.4 | 0.35 | 30 | 70 kN main, Isp 25493 s, gimbal 8° | 16500 |
| `thrust-block.xl` | XL | rear 4×4 | 3800 | 950 | 5/70/84 | – | 160 | 6.4 | 0.65 | 40 | 130 kN main, Isp 25493 s, gimbal 8° | 33000 |
| `ion-drive.salvaged.sm` | SM | rear/face 1×1 | 426 | 98 | 2/72/86.4 | – | 32 | 1.28 | 0.014 | 20 | 9.3 kN main, Isp 85128 s, gimbal 5° | 1680 |
| `ion-drive.salvaged.md` | MD | rear/face 2×2 | 1008 | 210 | 4/156/187.2 | – | 69 | 2.76 | 0.03 | 20 | 20.4 kN main, Isp 86676 s, gimbal 5° | 3920 |
| `ion-drive.salvaged.lg` | LG | rear/face 3×3 | 2240 | 364 | 8/312/374.4 | – | 137 | 5.48 | 0.062 | 30 | 42.5 kN main, Isp 87375 s, gimbal 5° | 8400 |
| `ion-drive.salvaged.xl` | XL | rear 4×4 | 4704 | 574 | 15/576/691.2 | – | 252 | 10.08 | 0.115 | 40 | 80.8 kN main, Isp 89502 s, gimbal 5° | 16800 |
| `resonance-drive.aurelian.sm` | SM | rear/face 1×1 | 300 | 120 | 3/70/84 | – | 13 | 0.52 | – | 40 | 13 kN main, Isp n/a s, gimbal 12° | 10500 |
| `resonance-drive.aurelian.md` | MD | rear/face 2×2 | 720 | 260 | 6/150/180 | – | 28 | 1.12 | – | 40 | 28 kN main, Isp n/a s, gimbal 12° | 24500 |
| `resonance-drive.aurelian.lg` | LG | rear/face 3×3 | 1600 | 460 | 12/300/360 | – | 55 | 2.2 | – | 60 | 58 kN main, Isp n/a s, gimbal 12° | 52000 |
| `rcs.sm` | SM | face/rear 1×1 | 45 | 60 | 0.2/4/4.8 | – | 2 | – | 0.015 | 10 | 3 kN maneuver, Isp 25493 s, gimbal 0° | 600 |
| `rcs.md` | MD | face/rear 1×1 | 120 | 120 | 0.4/10/12 | – | 4 | – | 0.04 | 10 | 9 kN maneuver, Isp 28680 s, gimbal 0° | 1500 |
| `vtol-thruster.sm` (future) | SM | bottom 1×1 | 260 | 120 | 1/15/18 | – | 18 | 0.72 | 0.1 | 20 | 20 kN vertical, Isp 25493 s, gimbal 10° | 3800 |
| `vtol-thruster.md` (future) | MD | bottom 2×2 | 620 | 260 | 2/32/38.4 | – | 40 | 1.6 | 0.22 | 20 | 45 kN vertical, Isp 26072 s, gimbal 10° | 8800 |
| `warp-drive.lg` (future) | LG | interior 3×4 | 6500 | 600 | 5/1500/1800 | – | 300 | 12 | – | 500 | jump drive (future) | 180000 |
| `warp-drive.xl` (future) | XL | interior 4×5 | 12000 | 1000 | 10/4000/4800 | – | 800 | 32 | – | 1000 | jump drive (future) | 400000 |

#### Power (15)

| Id | Size | Sockets | Mass kg | HP | Power idle/active/peak kW | Gen kW | Heat kW | Coolant L/s | Fuel L/s | Data kbit/s | Key stats | Cost |
| --- | --- | --- | --: | --: | --: | --: | --: | --: | --: | --: | --- | --: |
| `reactor.sm` | SM | interior 2×2 | 600 | 300 | 2/2/2 | 250 | 50 | 2 | 0.004 | 40 | generates 250 kW | 9000 |
| `reactor.md` | MD | interior 3×3 | 1500 | 650 | 5/5/5 | 700 | 140 | 5.6 | 0.01 | 60 | generates 700 kW | 22000 |
| `reactor.lg` | LG | interior 4×4 | 3800 | 1100 | 10/10/10 | 1800 | 360 | 14.4 | 0.024 | 80 | generates 1800 kW | 52000 |
| `battery.sm` | SM | interior 1×1 | 180 | 120 | – | 120 | 4 | – | – | 5 | 20 kWh, discharge 120 kW | 2400 |
| `battery.md` | MD | interior 1×2 | 450 | 240 | – | 320 | 10 | 0.4 | – | 5 | 60 kWh, discharge 320 kW | 6000 |
| `battery.lg` | LG | interior 2×2 | 1100 | 420 | – | 800 | 24 | 0.96 | – | 10 | 160 kWh, discharge 800 kW | 14500 |
| `capacitor.sm` | SM | interior 1×1 | 90 | 80 | – | 1200 | 3 | – | – | 5 | 0.4 kWh, discharge 1200 kW | 1800 |
| `capacitor.md` | MD | interior 1×1 | 220 | 160 | – | 3000 | 8 | 0.32 | – | 5 | 1.2 kWh, discharge 3000 kW | 4400 |
| `capacitor.lg` | LG | interior 2×1 | 520 | 280 | – | 7500 | 20 | 0.8 | – | 10 | 3.5 kWh, discharge 7500 kW | 10500 |
| `fuel-tank.sm` | SM | interior 1×1 | 120 | 100 | – | – | – | – | – | – | 400 L fuel | 900 |
| `fuel-tank.md` | MD | interior 2×2 | 320 | 220 | – | – | – | – | – | – | 1400 L fuel | 2200 |
| `fuel-tank.lg` | LG | interior 3×3 | 850 | 420 | – | – | – | – | – | – | 4500 L fuel | 5500 |
| `solar-array.sm` | SM | top/face 1×1 | 60 | 40 | – | 12 | – | – | – | – | generates 12 kW | 900 |
| `solar-array.md` | MD | top/face 2×2 | 160 | 80 | – | 35 | – | – | – | – | generates 35 kW | 2300 |
| `aux-generator.sm` | SM | interior 1×1 | 220 | 120 | 0.5/0.5/0.5 | 80 | 16 | 0.64 | 0.01 | 5 | generates 80 kW | 2600 |

#### Thermal (8)

| Id | Size | Sockets | Mass kg | HP | Power idle/active/peak kW | Gen kW | Heat kW | Coolant L/s | Fuel L/s | Data kbit/s | Key stats | Cost |
| --- | --- | --- | --: | --: | --: | --: | --: | --: | --: | --: | --- | --: |
| `radiator.sm` | SM | top/face 1×1 | 90 | 60 | – | – | – | – | – | – | rejects 60 kW | 1100 |
| `radiator.md` | MD | top/face 2×2 | 240 | 120 | – | – | – | – | – | – | rejects 160 kW | 2800 |
| `radiator.lg` | LG | top/face 3×3 | 600 | 200 | – | – | – | – | – | – | rejects 400 kW | 6600 |
| `coolant-pump.sm` | SM | interior 1×1 | 80 | 80 | 1/4/4.8 | – | 1 | – | – | 5 | pumps 8 L/s (200 kW) | 700 |
| `coolant-pump.md` | MD | interior 1×1 | 180 | 150 | 2/9/10.8 | – | 2 | – | – | 5 | pumps 20 L/s (500 kW) | 1600 |
| `coolant-pump.lg` | LG | interior 2×1 | 420 | 260 | 4/20/24 | – | 4 | – | – | 10 | pumps 48 L/s (1200 kW) | 3800 |
| `heat-sink.sm` | SM | interior 1×1 | 150 | 120 | – | – | – | – | – | – | buffers 20 MJ | 800 |
| `heat-sink.md` | MD | interior 2×1 | 400 | 240 | – | – | – | – | – | – | buffers 60 MJ | 2000 |

#### Weapon (23)

| Id | Size | Sockets | Mass kg | HP | Power idle/active/peak kW | Gen kW | Heat kW | Coolant L/s | Fuel L/s | Data kbit/s | Key stats | Cost |
| --- | --- | --- | --: | --: | --: | --: | --: | --: | --: | --: | --- | --: |
| `point-defense.sm` | SM | top/face/bottom 1×1 | 180 | 90 | 1/6/7.2 | – | 4 | – | – | 60 | 6 kinetic × 600/min (60 dps), 600 m, pd-20mm | 2600 |
| `point-defense.md` | MD | top/face/bottom 2×2 | 420 | 180 | 2/12/14.4 | – | 7 | 0.28 | – | 80 | 2×9 kinetic × 700/min (210 dps), 800 m, pd-20mm | 6200 |
| `autocannon.sm` | SM | top/face/bottom 1×1 | 260 | 120 | 1/6/7.2 | – | 5 | – | – | 50 | 2×28 kinetic × 240/min (224 dps), 1000 m, ac-30mm | 3000 |
| `autocannon.md` | MD | top/face/bottom 2×2 | 620 | 260 | 2/12/14.4 | – | 10 | 0.4 | – | 60 | 2×52 kinetic × 210/min (364 dps), 1300 m, ac-30mm | 7200 |
| `autocannon.lg` | LG | top/face/bottom 3×3 | 1400 | 460 | 4/22/26.4 | – | 18 | 0.72 | – | 80 | 2×90 kinetic × 180/min (540 dps), 1600 m, ac-30mm | 16000 |
| `laser-cannon.sm` | SM | top/face/bottom 1×1 | 300 | 110 | 2/42/50.4 | – | 28 | 1.12 | – | 60 | 45 thermal × 60/min (45 dps), 1200 m, 40 kJ/shot | 4200 |
| `laser-cannon.md` | MD | top/face/bottom 2×2 | 700 | 240 | 4/86.5/103.8 | – | 57.8 | 2.31 | – | 80 | 100 thermal × 45/min (75 dps), 1600 m, 110 kJ/shot | 10000 |
| `laser-cannon.lg` | LG | top/face/bottom 3×3 | 1600 | 420 | 8/168/201.6 | – | 112 | 4.48 | – | 100 | 220 thermal × 30/min (110 dps), 2100 m, 320 kJ/shot | 23000 |
| `railgun.md` | MD | top/face/bottom 2×2 | 1200 | 300 | 5/155/186 | – | 67.5 | 2.7 | – | 120 | 420 kinetic × 10/min (70 dps), 3000 m, rail-slug | 22000 |
| `railgun.lg` | LG | top/face/bottom 3×3 | 2600 | 520 | 10/250/300 | – | 108 | 4.32 | – | 160 | 950 kinetic × 6/min (95 dps), 4200 m, rail-slug | 52000 |
| `missile-pod.sm` | SM | top/face/bottom 1×1 | 350 | 110 | 1/4/4.8 | – | 2 | – | – | 80 | 4×160 explosive × 6/min (64 dps), 3500 m, missile-std, r6 m | 5200 |
| `missile-pod.md` | MD | top/face/bottom 2×2 | 800 | 230 | 2/7/8.4 | – | 4 | – | – | 120 | 8×160 explosive × 5/min (106.7 dps), 4000 m, missile-std, r6 m | 12000 |
| `missile-pod.lg` | LG | top/face/bottom 3×3 | 1700 | 400 | 3/11/13.2 | – | 6 | 0.24 | – | 160 | 12×160 explosive × 4.29/min (137.3 dps), 4500 m, missile-std, r6 m | 26000 |
| `torpedo-launcher.md` | MD | face/top 2×2 | 1100 | 320 | 2/8/9.6 | – | 4 | – | – | 150 | 1400 explosive × 2.4/min (56 dps), 6000 m, torpedo-hvy, r15 m | 18000 |
| `torpedo-launcher.lg` | LG | face/top 3×3 | 2400 | 560 | 4/14/16.8 | – | 7 | 0.28 | – | 200 | 2×2600 explosive × 2/min (173.3 dps), 7000 m, torpedo-hvy, r20 m | 40000 |
| `flak-cannon.sm` | SM | top/face/bottom 1×1 | 240 | 110 | 1/5/6 | – | 4 | – | – | 50 | 16 explosive × 360/min (96 dps), 700 m, flak-40mm, r10 m | 2800 |
| `flak-cannon.md` | MD | top/face/bottom 2×2 | 560 | 230 | 2/9/10.8 | – | 7 | 0.28 | – | 70 | 22 explosive × 400/min (146.7 dps), 800 m, flak-40mm, r12 m | 6600 |
| `flak-cannon.lg` | LG | top/face/bottom 3×3 | 1250 | 400 | 3/15/18 | – | 11 | 0.44 | – | 90 | 30 explosive × 450/min (225 dps), 950 m, flak-40mm, r14 m | 14500 |
| `plasma-turret.md` | MD | top/face/bottom 2×2 | 800 | 240 | 4/84/100.8 | – | 68 | 2.72 | – | 90 | 260 plasma × 24/min (104 dps), 900 m, 200 kJ/shot, r3 m | 14000 |
| `plasma-turret.lg` | LG | top/face/bottom 3×3 | 1800 | 420 | 8/152/182.4 | – | 122.4 | 4.9 | – | 120 | 580 plasma × 18/min (174 dps), 1100 m, 480 kJ/shot, r4 m | 32000 |
| `side-cannon.sm` | SM | face 1×1 | 220 | 120 | 0.5/3/3.6 | – | 3 | – | – | 40 | 55 kinetic × 80/min (73.3 dps), 1000 m, cannon-60mm | 2200 |
| `side-cannon.md` | MD | face 2×2 | 520 | 250 | 1/5/6 | – | 5 | – | – | 50 | 110 kinetic × 65/min (119.2 dps), 1250 m, cannon-60mm | 5200 |
| `side-cannon.lg` | LG | face 3×3 | 1200 | 440 | 2/9/10.8 | – | 9 | 0.36 | – | 60 | 2×210 kinetic × 50/min (350 dps), 1500 m, cannon-60mm | 12000 |

#### Ammunition (6)

| Id | Size | Sockets | Mass kg | HP | Power idle/active/peak kW | Gen kW | Heat kW | Coolant L/s | Fuel L/s | Data kbit/s | Key stats | Cost |
| --- | --- | --- | --: | --: | --: | --: | --: | --: | --: | --: | --- | --: |
| `magazine.ballistic.sm` | SM | interior 1×1 | 240 | 150 | 0.2/1/1.2 | – | – | – | – | 5 | 600 kg ballistic (pd-20mm, ac-30mm, flak-40mm, cannon-60mm, rail-slug) | 1200 |
| `magazine.ballistic.md` | MD | interior 2×1 | 560 | 300 | 0.4/2/2.4 | – | – | – | – | 5 | 2000 kg ballistic (pd-20mm, ac-30mm, flak-40mm, cannon-60mm, rail-slug) | 2800 |
| `magazine.ballistic.lg` | LG | interior 2×2 | 1300 | 520 | 0.8/4/4.8 | – | – | – | – | 10 | 6000 kg ballistic (pd-20mm, ac-30mm, flak-40mm, cannon-60mm, rail-slug) | 6200 |
| `magazine.missile.md` | MD | interior 2×1 | 500 | 260 | 0.3/2/2.4 | – | – | – | – | 5 | 720 kg missile (missile-std) | 2600 |
| `magazine.missile.lg` | LG | interior 3×2 | 1200 | 480 | 0.6/4/4.8 | – | – | – | – | 10 | 1800 kg missile (missile-std) | 6000 |
| `magazine.torpedo.lg` | LG | interior 3×2 | 1400 | 560 | 0.5/4/4.8 | – | – | – | – | 10 | 3600 kg torpedo (torpedo-hvy) | 7500 |

#### Defense (10)

| Id | Size | Sockets | Mass kg | HP | Power idle/active/peak kW | Gen kW | Heat kW | Coolant L/s | Fuel L/s | Data kbit/s | Key stats | Cost |
| --- | --- | --- | --: | --: | --: | --: | --: | --: | --: | --: | --- | --: |
| `shield-generator.sm` | SM | interior 1×1 | 350 | 160 | 12/90/110 | – | 45 | 1.8 | – | 40 | 800 hp, 25 hp/s, delay 5 s | 6500 |
| `shield-generator.md` | MD | interior 2×2 | 850 | 340 | 30/220/270 | – | 110 | 4.4 | – | 60 | 2400 hp, 60 hp/s, delay 5 s | 16000 |
| `shield-generator.lg` | LG | interior 3×3 | 2000 | 600 | 75/520/640 | – | 260 | 10.4 | – | 100 | 6500 hp, 150 hp/s, delay 6 s | 38000 |
| `shield-emitter.sm` | SM | top/face/bottom 1×1 | 60 | 50 | 1/5/6 | – | 2 | – | – | 20 | bubble r8 m | 1800 |
| `shield-emitter.md` | MD | top/face/bottom 2×2 | 150 | 110 | 2/10/12 | – | 4 | – | – | 20 | bubble r16 m | 4400 |
| `shield-emitter.lg` | LG | top/face/bottom 3×3 | 380 | 200 | 4/20/24 | – | 8 | 0.32 | – | 30 | bubble r28 m | 10500 |
| `armor-plate.light.sm` | SM | face/top/bottom/rear 1×1 | 60 | 120 | – | – | – | – | – | – | 120 hp/cell, resist K0.1 T0.1 E0.05 P0.05 | 150 |
| `armor-plate.medium.sm` | SM | face/top/bottom/rear 1×1 | 140 | 260 | – | – | – | – | – | – | 260 hp/cell, resist K0.25 T0.2 E0.2 P0.15 | 380 |
| `armor-plate.heavy.sm` | SM | face/top/bottom/rear 1×1 | 260 | 480 | – | – | – | – | – | – | 480 hp/cell, resist K0.4 T0.3 E0.3 P0.25 | 800 |
| `armor-plate.reactive.sm` | SM | face/top/bottom/rear 1×1 | 200 | 320 | – | – | – | – | – | – | 320 hp/cell, resist K0.3 T0.15 E0.55 P0.2 | 1100 |

#### Sensor (9)

| Id | Size | Sockets | Mass kg | HP | Power idle/active/peak kW | Gen kW | Heat kW | Coolant L/s | Fuel L/s | Data kbit/s | Key stats | Cost |
| --- | --- | --- | --: | --: | --: | --: | --: | --: | --: | --: | --- | --: |
| `sensor-dish.sm` | SM | top/face/bottom 1×1 | 120 | 60 | 1/10/12 | – | 3 | – | – | 200 | 3000 m, 90° | 2200 |
| `sensor-dish.md` | MD | top/face/bottom 2×2 | 300 | 120 | 2/22/26.4 | – | 7 | 0.28 | – | 500 | 6000 m, 120° | 5400 |
| `sensor-dish.lg` | LG | top/face/bottom 3×3 | 700 | 220 | 4/45/54 | – | 14 | 0.56 | – | 1200 | 10000 m, 150° | 12500 |
| `radar-array.md` | MD | top/bottom 2×2 | 420 | 140 | 3/28/33.6 | – | 9 | 0.36 | – | 800 | 4500 m, 360° | 6800 |
| `radar-array.lg` | LG | top/bottom 3×3 | 950 | 260 | 6/60/72 | – | 20 | 0.8 | – | 1600 | 8000 m, 360° | 15000 |
| `scanner-mast.sm` | SM | top/face 1×1 | 90 | 50 | 0.5/8/9.6 | – | 3 | – | – | 300 | 600 m, 360°, scan 8 s | 1900 |
| `scanner-mast.md` | MD | top/face 2×2 | 220 | 100 | 1/16/19.2 | – | 6 | 0.24 | – | 600 | 1200 m, 360°, scan 5 s | 4600 |
| `relay-beacon.sm` | SM | top 1×1 | 70 | 40 | 1/6/7.2 | – | 2 | – | – | 100 | comm 25 km | 1400 |
| `relay-beacon.md` | MD | top 2×2 | 180 | 90 | 2/15/18 | – | 5 | – | – | 200 | comm 60 km | 3400 |

#### Utility (12)

| Id | Size | Sockets | Mass kg | HP | Power idle/active/peak kW | Gen kW | Heat kW | Coolant L/s | Fuel L/s | Data kbit/s | Key stats | Cost |
| --- | --- | --- | --: | --: | --: | --: | --: | --: | --: | --: | --- | --: |
| `tractor-projector.sm` | SM | top/face/bottom 1×1 | 250 | 90 | 2/60/75 | – | 30 | 1.2 | – | 60 | 6 kN, 120 m, ≤10 t | 4800 |
| `tractor-projector.md` | MD | top/face/bottom 2×2 | 650 | 190 | 5/160/200 | – | 80 | 3.2 | – | 80 | 18 kN, 220 m, ≤40 t | 11500 |
| `tractor-projector.lg` | LG | top/face/bottom 3×3 | 1500 | 340 | 10/380/470 | – | 190 | 7.6 | – | 100 | 45 kN, 350 m, ≤150 t | 27000 |
| `salvage-arm.md` | MD | face/top 2×2 | 600 | 200 | 1/25/30 | – | 8 | 0.32 | – | 80 | 2 kg/s cut, reach 10 m | 6000 |
| `salvage-arm.lg` | LG | face/top 3×3 | 1400 | 360 | 2/60/72 | – | 18 | 0.72 | – | 120 | 5 kg/s cut, reach 18 m | 14000 |
| `docking-clamp.md` | MD | top/face/bottom 2×2 | 500 | 240 | 0.5/12/14.4 | – | 2 | – | – | 20 | holds ≤80 t | 3600 |
| `docking-clamp.lg` | LG | top/face/bottom 3×3 | 1200 | 420 | 1/25/30 | – | 4 | – | – | 30 | holds ≤300 t | 8600 |
| `mining-laser.sm` | SM | top/face/bottom 1×1 | 280 | 100 | 1/45/54 | – | 32 | 1.28 | – | 60 | 0.4 kg/s, 120 m | 3800 |
| `mining-laser.md` | MD | top/face/bottom 2×2 | 700 | 210 | 3/120/144 | – | 84 | 3.36 | – | 80 | 1.2 kg/s, 200 m | 9000 |
| `mining-laser.lg` | LG | top/face/bottom 3×3 | 1600 | 380 | 6/300/360 | – | 210 | 8.4 | – | 100 | 3 kg/s, 300 m | 21000 |
| `drone-bay.md` | MD | top/bottom 2×2 | 900 | 260 | 3/20/24 | – | 5 | – | – | 800 | 2 drones, 2000 m control | 12000 |
| `drone-bay.lg` | LG | top/bottom 3×3 | 2000 | 460 | 6/40/48 | – | 10 | 0.4 | – | 1600 | 4 drones, 3500 m control | 26000 |

#### Structure (9)

| Id | Size | Sockets | Mass kg | HP | Power idle/active/peak kW | Gen kW | Heat kW | Coolant L/s | Fuel L/s | Data kbit/s | Key stats | Cost |
| --- | --- | --- | --: | --: | --: | --: | --: | --: | --: | --: | --- | --: |
| `cargo-door.2m` | SM | edge 2×1 | 250 | 200 | 0.2/4/4.8 | – | – | – | – | 5 | 2×2.5 m, cycle 3 s, 3 m³/min, seals | 1500 |
| `cargo-door.4m` | MD | edge 4×1 | 600 | 400 | 0.4/9/10.8 | – | – | – | – | 5 | 4×3 m, cycle 5 s, 8 m³/min, seals | 3400 |
| `cargo-door.6m` | LG | edge 6×1 | 1100 | 600 | 0.6/15/18 | – | – | – | – | 5 | 6×3 m, cycle 7 s, 15 m³/min, seals | 6200 |
| `airlock.exterior.md` | MD | edge 2×1 | 450 | 300 | 0.2/6/7.2 | – | – | – | – | 10 | 1.2×2.2 m, cycle 12 s, 1 m³/min, seals | 3200 |
| `airlock.interior.sm` | SM | edge 2×1 | 220 | 200 | 0.1/3/3.6 | – | – | – | – | 5 | 1.2×2.2 m, cycle 6 s, 1.5 m³/min, seals | 1200 |
| `hatch.sm` | SM | interior 1×1 | 80 | 150 | 0.1/1/1.2 | – | – | – | – | – | 0.9×0.9 m, cycle 3 s, 0.5 m³/min, seals | 400 |
| `hatch.exterior.sm` | SM | top/bottom 1×1 | 120 | 220 | 0.1/1.5/1.8 | – | – | – | – | – | 0.9×0.9 m, cycle 4 s, 0.4 m³/min, seals | 600 |
| `docking-port.md` | MD | edge/top 2×1 | 700 | 320 | 0.5/8/9.6 | – | – | – | – | 20 | 1.4×2.2 m, cycle 20 s, 4 m³/min, seals | 5200 |
| `docking-port.lg` | LG | edge/top 3×1 | 1500 | 540 | 1/14/16.8 | – | – | – | – | 40 | 2.4×2.6 m, cycle 25 s, 12 m³/min, seals | 11500 |

#### Interior (19)

| Id | Size | Sockets | Mass kg | HP | Power idle/active/peak kW | Gen kW | Heat kW | Coolant L/s | Fuel L/s | Data kbit/s | Key stats | Cost |
| --- | --- | --- | --: | --: | --: | --: | --: | --: | --: | --: | --- | --: |
| `life-support.sm` | SM | interior 1×1 | 200 | 120 | 3/8/9.6 | – | 3 | – | – | 10 | supports 4 crew, 0.2 m³/s | 3000 |
| `life-support.md` | MD | interior 2×1 | 480 | 240 | 8/20/24 | – | 8 | 0.32 | – | 10 | supports 10 crew, 0.5 m³/s | 7200 |
| `life-support.lg` | LG | interior 2×2 | 1100 | 420 | 18/48/57.6 | – | 20 | 0.8 | – | 20 | supports 24 crew, 1.2 m³/s | 16500 |
| `air-filter.sm` | SM | interior 1×1 | 80 | 60 | 1/2/2.4 | – | 1 | – | – | – | supports 3 crew, 0.15 m³/s | 700 |
| `air-filter.md` | MD | interior 1×1 | 200 | 120 | 2/5/6 | – | 2 | – | – | – | supports 8 crew, 0.4 m³/s | 1700 |
| `oxygen-tank.sm` | SM | interior 1×1 | 120 | 80 | – | – | – | – | – | – | 48 crew-hours O₂ | 500 |
| `oxygen-tank.md` | MD | interior 2×1 | 350 | 160 | – | – | – | – | – | – | 160 crew-hours O₂ | 1300 |
| `hydroponics.sm` | SM | interior 2×1 | 45 | 40 | 0.1/0.2/0.2 | – | – | – | – | – | supports 1 crew, 0.02 m³/s | 900 |
| `gravity-unit.md` | MD | interior 2×2 | 800 | 200 | 10/30/36 | – | 12 | 0.48 | – | 20 | 80 m² gravity | 9500 |
| `gravity-unit.lg` | LG | interior 3×3 | 1900 | 360 | 25/80/96 | – | 32 | 1.28 | – | 30 | 250 m² gravity | 22000 |
| `computer-core.sm` | SM | interior 1×1 | 80 | 80 | 0.5/0.5/0.6 | – | 0.5 | – | – | 4000 | 4 Mbit/s, 8 control slots | 2500 |
| `computer-core.md` | MD | interior 1×1 | 180 | 160 | 1.2/1.2/1.5 | – | 1.2 | – | – | 12000 | 12 Mbit/s, 20 control slots | 6500 |
| `computer-core.lg` | LG | interior 2×1 | 400 | 280 | 3/3/3.6 | – | 3 | – | – | 32000 | 32 Mbit/s, 48 control slots | 15000 |
| `console.navigation.sm` | SM | interior 1×1 | 110 | 60 | 0.5/1.5/1.8 | – | 1.2 | – | – | 40 | grants flight (pilot) | 1800 |
| `console.command.sm` | SM | interior 1×1 | 110 | 60 | 0.1/0.3/0.4 | – | 0.3 | – | – | 60 | grants command (command) | 1800 |
| `console.fire-control.sm` | SM | interior 1×1 | 110 | 60 | 0.3/0.8/1 | – | 0.6 | – | – | 120 | grants fire-control (gunner) | 1800 |
| `console.engineering.sm` | SM | interior 1×1 | 110 | 60 | 0.2/0.6/0.7 | – | 0.5 | – | – | 80 | grants engineering (engineer) | 1800 |
| `console.sensor.sm` | SM | interior 1×1 | 110 | 60 | 0.2/0.6/0.7 | – | 0.5 | – | – | 150 | grants sensors (sensor) | 1800 |
| `crew-bunk.sm` | SM | interior 2×1 | 145 | 60 | 0/0/0 | – | – | – | – | – | 2 berths | 600 |
<!-- ship-components:generated:end -->
