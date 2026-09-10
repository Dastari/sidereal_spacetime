# Exact-byte GLB delivery release

Status: staged; public activation and actual compressed public GET verification pending.

This is an independent static-delivery change following the [measured delivery audit](delivery_optimization_audit_20260910.md). It neither rebuilds nor changes the client/world/art artifacts. The owner authorized deployment; activation is coordinated with ongoing authenticated browser work.

## Release boundaries

The public client changed independently during preparation. The staged delivery preserves newer client `8246fafc6e13048bd1eaabd5a63d6c06dc9ca1ba983de4bdb6e466de676c4a35`, rather than restoring the earlier f9e323 release. Database process and authority are untouched.

Delivery artifact `520de12b8dada34e0016524008d5e098af7b5cd1ac42a89f7875024898e5678d` pins only `glb_delivery.mjs` and `public_client_preview.mjs`. The separate managed manifest records the exact client at staging and previous delivery revision. Activation refuses a changed client or delivery manifest and verifies both immutable file trees before stopping the frontend. The delivery configuration also applies to later deliberately activated client releases, each using its own resolved immutable root. No dashboard changes are included.

## HTTP behavior

Only existing native `/assets/*.glb` paths are intercepted. Other assets, SPA callbacks and the `/v1` HTTP/WebSocket proxy retain Vite preview behavior. Gzip level6 streams with backpressure; decompression restores the exact native bytes. The server does not simplify meshes, alter textures, add geometry compression extensions, or change any asset manifest/hash.

Both representations keep `model/gltf-binary`, `Vary: Accept-Encoding`, `Cache-Control: no-cache`, and Last-Modified. Identity has a strong SHA-256 ETag; gzip has a separate weak representation ETag. Encoding quality values and explicit refusal are honored. Conditional GET/HEAD support includes validator precedence and preconditions. Single byte ranges, suffix ranges and valid If-Range use identity bytes with206; unsatisfiable ranges return416. Unsupported/multiple ranges are ignored with a full200 response. If identity is explicitly unacceptable, Range is ignored and an acceptable full gzip representation is returned. Mismatched/weak If-Range cannot authorize a partial response.

Compression is streamed per accepted full GET, with a bounded immutable-file hash cache. It is not a disk compression cache. It trades CPU per cold/full transfer for fewer transmitted bytes; no internet latency or rendering FPS improvement is claimed. Static cache lifetime remains unchanged because today's asset URLs are mutable across releases.

## Validation

- Eight actual Node HTTP/Vite checks exercise decoded SHA, MIME, negotiation/refusal, GET/HEAD, conditional requests, preconditions, range/If-Range behavior, missing assets, symlink refusal, SPA callback and database proxy forwarding.
- 25 focused Python tests cover existing client publication guards and delivery stage/activate/rollback, tampered artifacts, concurrent client changes and automatic restoration after failed launch. Python discovery includes the Node HTTP suite, so CI does not silently omit it.
- Current workspace typecheck passed; aggregate Vitest passed1,233/1,234 cases with one unrelated20-second planet-terrain timeout. That suite passed all five cases on focused repeat in15.82s. The separate77-document check passed. No application/world artifact is built or substituted by this delivery release.
- Public pre-activation GETs on the newer8246 client preserve the exact source hashes but have no gzip. Crew14,775,768B and parts23,903,376B total38,679,144B.
- Evidence: `.runtime/releases/glb-delivery-20260910/before.json`; post-activation evidence is pending.

## Managed operation and recovery

```sh
python3 scripts/dev.py public-client-delivery-stage
python3 scripts/dev.py public-client-delivery-activate
python3 scripts/verify_glb_delivery.py --expect-gzip --output .runtime/releases/glb-delivery-20260910/after.json
```

Stage performs no application build or service stop. Activation and rollback use the same publication lock as ordinary client releases. Only `public-client` restarts; the database, development apps and dashboard keep running. Existing sockets through that proxy reconnect normally.

```sh
python3 scripts/dev.py public-client-delivery-rollback
```

Rollback restores the previous independently pinned delivery implementation, or the original Vite configuration for the first release. It keeps the exact active client and world. A failed new launch automatically restores the prior delivery and attempts to restart it. No backup is deleted or database restored as part of this delivery-only operation. Historical artifacts and manifests remain available.
