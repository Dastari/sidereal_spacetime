# Construction services foundation

Status: pure 3D route validation and conserved-capacity allocation implemented, 2026-09-09. No authoritative device behavior, publication, UI or live resource persistence is connected by this change.

## Files and verification

- `packages/sim/src/construction-services.ts`
- `packages/sim/src/construction-services.test.ts`

Sixteen focused tests pass and full `npm run typecheck` passes. Tests cover exact ports, wall/deck feedthroughs, vertical risers, missing/unsealed/undersized penetrations, geometric crossings, colocated disconnected ports, junction capacity, consumer priority, residual rerouting, supply/rate/timestep conservation, disabled routes/devices, all five channel units, media compatibility, clearance, cycles, deterministic ordering and invalid state. Aggregate checks/build and future authority smoke remain the integration owner's gates.

No existing schema, editor, world, shared export, asset, service or browser files were changed.

## Geometry and connection API

`compileConstructionServices(network)` accepts explicit service regions, structural boundaries, functional ports/junctions, feedthroughs and directed routes. Positions are integer ship-local XYZ on the 1/32 m lattice. All definition IDs, capacities, media, connector families and pressure-seal metadata must be supplied by approved server-resolved interfaces. Names or visual dimensions never confer those capabilities.

This bounded adapter represents service regions as non-overlapping axis-aligned boxes. A region identifies its deck. This is an intermediate compiler adapter, not an arbitrary polygon-volume or mesh intersection engine. The actual layout compiler must decompose usable routing volumes and structural boundaries consistently with collision/pressure geometry.

Each route uses explicit `fromPortId`/`toPortId` and must end at their exact positions. Ports, routes and feedthroughs must agree on channel, medium and connector family. Source-facing ports cannot receive directed routes and consumer-facing ports cannot emit them; explicit junctions use `both`. Ports merely sharing a position do not connect. Crossing route geometry never creates a node. A junction requires deliberately referenced identity.

Paths use nonzero axis-aligned segments. The validator slices each segment through declared regions; undeclared space and ambiguous travel along a region boundary reject. Route cross-sections must fit their region/shaft clearance. Every change of region must match exactly one shared structural boundary and an explicitly referenced feedthrough at the exact crossing point. Unknown, unused or duplicate feedthrough references reject.

Walls, deck interfaces and exterior hull interfaces are distinct boundary kinds. Cross-deck boundaries require deck/hull interfaces, and every vertical route requires a riser definition. Boundary spans must lie on the actual shared region face. Feedthrough capacity/clearance must cover the route. Pressure boundaries require sealed feedthroughs. An unsealed pressure penetration fails closed; this foundation does not yet generate the corresponding pressure leak.

One feedthrough connector ID belongs to one route. Independent circuits require independent connector IDs even when their glands share an authored housing. This avoids inventing junctions or allowing multiple routes to bypass one connector's capacity. Shared cable-bundle packing, overlapping service-volume occupancy and full obstacle clearance are not modeled beyond the supplied region cross-section and connector bounds.

Compile on changed service geometry/definitions, and cache the resulting valid immutable graph. The compiler copies returned node/route geometry. This API is not a general untrusted-JSON decoder; bounded decoding and approved definition lookup still belong to the authority adapter.

## Conserved allocation

`allocateConstructionServices(compiled, supplies, demands, seconds, availability)` accepts actual available source amounts and requested consumer amounts for one bounded interval. Runtime state can disable explicit node or route IDs, representing unavailable devices, breakers or isolation valves. Unknown/duplicate IDs reject. Supplies/demands attach to functional ports; junctions do not manufacture or consume resources. One port cannot simultaneously be a supply and consumer in the same call.

Channel quantity adapters:

| Channel | Quantity | Capacity unit |
| --- | --- | --- |
| Power | joules | J/s |
| Fuel | kilograms of the exact medium | kg/s |
| Coolant | kilograms of the exact medium | kg/s |
| Ventilation | moles of the exact medium | mol/s |
| Data | byte budget | byte/s |

The allocator splits graph nodes to enforce aggregate port/junction capacity and enforces every route's rate multiplied by timestep. It adds consumer terminals by descending priority, then stable port ID. Residual-flow rerouting can improve total delivery without reversing previously accepted terminal allocations. Geometric cycles remain bounded and cannot create supply. Channels and media remain disconnected unless an explicit, separately implemented conversion device exists; this module implements no conversions.

Returned data includes each source's consumed/remaining amount, each consumer's delivered/unmet amount, and route/node quantities. “Consumed” here means withdrawn from the source and transported or assigned to the consumer; it does not imply burning coolant or deleting fuel from an unbound inventory. The authority adapter must commit source withdrawal, destination/storage effects and actual device operation together. It must not both allocate an atmosphere amount here and separately spend that same amount in the pressure solver.

This is a directed conserved-capacity model, not electrical voltage/drop, fluid pressure, pump curves, hydraulic circulation, thermal exchange, oxygen species, packet routing or latency simulation. Data uses a divisible byte budget; actual packet processing is separate. Recirculating coolant needs explicit reservoir/return and heat adapters. Producer output and device operating thresholds are inputs/consumers of this solver, not invented from graphics.

## Bounds and remaining integration

At most 512 nodes, 1,024 routes, 32 points per route, 4,096 total path segments, 256 service regions, 8,192 traversed region intervals, 512 structural boundaries and 512 feedthroughs. Lattice coordinates are bounded to ±8,192. Each capacity and source/demand quantity is at most 10¹² in its declared unit. Each call permits up to 128 supply and 128 demand ports, with timestep in `(0,1]` seconds.

Allocation uses breadth-first residual augmentation with at most 1,024 augmentations per call. If a further augmenting path exists after that cap, `exhausted` is true and the result remains conservative but may be underallocated. The caller must report/schedule that condition rather than claim full service satisfaction. These are admission caps, not demonstrated worst-case server throughput. Geometry validation and dirty graph rebuilds should not run for every wire every tick.

Remaining work: geometry adapter from actual authored decks/partitions/routing volumes; approved port/gland/riser metadata; server resource/reservoir and device-state bindings; power/fuel prerequisites for engines and thrusters; real pump/life-support/airlock behavior; pressure-leak coupling for damaged glands; route editing/overlay UI; revisioned authority/CAS/permissions; persisted graph/resource state; multi-client/restart tests and actual installed-game review. A valid graph does not by itself grant thrust, power, inventory balances or pressure sealing to a decorative model.
