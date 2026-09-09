# Conserved refit, native airlock and loading release

Status: combined candidate; not yet publicly activated. Owner authorization permits deployment after the combined gates and browser review. Existing public world remains a962f39a with client2f5c1bd4.

The candidate adds explicit, revisioned existing-ship conversion to the qualified native Wayfarer; preserved item/container/station/character/ship identities and liquid capacity; a separately qualified fuel attachment and manual canister transfer; native airlock authority and return-origin preservation; and the client loading barrier. It does not automatically refit accounts at login. Cargo carrier stacking, closure art, planetary work and wider rendering optimization remain separate, unregistered work.

Refit authority is checkpoint eab3a3bd. Native airlock authority is f9731b30; its paired browser controller passed a full cycle and native-home return. Exact final client checkpoint and artifact pins will be recorded after the loading-barrier review. The current tested world artifact is2ade8d75a75f75e5d555c8f2c3a666c69c736300dff13611dd7964ea6984ac8c; it is published only to isolated review databases.

Validation to date: latest full combined check1,182tests/199files plus76docs; full build; art validation; Python tests; fresh generic authority smoke; real legacy317c additive upgrade and hidden inventory conservation; native mounted tank browser picking and1L roundtrip; nine-output telemetry conversion and conserved-station pilot/thrust/release. The final client loading/reload review and subsequent combined gate remain pending. Detailed migration evidence is in [the refit contract](wayfarer_existing_ship_refit.md).

## Recovery capacity preparation

Before the next cold archive, read-only Proxmox inspection verified CT107 hostname sidereal and rootfs nvme_pool:subvol-107-disk-0 matched the active container. Its128GiB quota left7.6GiB free, insufficient to safely retain another complete archive. The underlying nvme_pool had approximately2.4TiB available. With explicit parent coordination under the owner's infrastructure authorization, `pct resize 107 rootfs +64G` increased only that quota to192GiB. The running filesystem then had72GiB free. No service/database restart, data deletion, archive replacement or account mutation occurred. Managed database/client/dashboard/public-client processes remained running.

All previous recovery archives and their manifests remain intact. A new managed cold backup will be taken only after the browser is idle and its before-snapshot is recorded. Hashes, interruption duration, exact durable-state comparison and restore limitations will be appended here. No new restore proof is claimed from a quota increase or an archive listing.

## Activation order and recovery

Pin the final tested world bundle and independent immutable client build. Snapshot stable authoritative normal-world and isolated reviewer records privately. Take `dev.py backup-database`, compare state after the automatic managed restart, then publish the additive world with deletion forbidden and activate the matching immutable client. Preserve dashboard independence. Verify normal database identity, routes, artifact hashes and actual public login/gameplay. If activation fails, retain the source/artifact and use the recorded compatible prior client only when its view schema remains compatible; do not downgrade schema or restore over live data incidentally.


The final telemetry-adjusted module is retained privately at `.runtime/releases/refit-airlock-20260910/world-2ade8d75.js`; `candidate.json` records its exact hash and capacity preparation. This is staging only. The secondary normal-UI fixture was converted under the earlierbd018 module; later telemetry reconciliation was independently proven on a fresh real legacy upgrade, not falsely attributed to that earlier conversion. No production converted account exists before this release, so historical review projections do not require a live data repair.
