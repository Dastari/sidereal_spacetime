# Exact-byte GLB delivery release

Status: deployed and verified through actual public HTTPS GETs.

This is an independent static-delivery change following the [measured delivery audit](delivery_optimization_audit_20260910.md). It neither rebuilds nor changes the client/world/art artifacts. The owner authorized deployment; activation followed completion of the separately authorized Dastari refit and browser coordination.

## Release boundaries

The public client changed independently during preparation. The activated delivery preserves newer client `8246fafc6e13048bd1eaabd5a63d6c06dc9ca1ba983de4bdb6e466de676c4a35`, rather than restoring the earlier f9e323 release. Database process and authority are untouched.

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
- Full standard Python discovery passed71 tests, including the actual Node HTTP suite.
- Actual public HTTPS verification passed gzip and identity decoded SHA/MIME, Vary,304,206/If-Range and explicit gzip refusal. The exact app entry and world module hashes were verified afterward.
- Evidence: `.runtime/releases/glb-delivery-20260910/{before,after,pins-after}.json`.

| Published asset | Identity bytes | Gzip bytes | Reduction |
| --- | ---: | ---: | ---: |
| Modular crew GLB |14,775,768 |1,564,113 |89.41% |
| Assembly parts GLB |23,903,376 |3,830,408 |83.98% |
| Combined |38,679,144 |5,394,521 |86.05% |

These are actual wire-body measurements, with identical decoded SHA-256 values. Measured streaming gzip differs slightly from the earlier offline Python compression experiment; the public result above is authoritative. This does not measure the total bytes for every browser scene.

Only frontend PID4144936→4161929 restarted. Database PID4122784, development client PID3792320 and dashboard PID3541237 remained running. World `2ade8d75a75f75e5d555c8f2c3a666c69c736300dff13611dd7964ea6984ac8c` and the normal database identity remained exact. Current external client8246 is unchanged; entry `/assets/index-B4bNcXSU.js` SHA `492d8bfb7e1abfc0a9a03aab3c2d7887e8342fe6182f3c5f4afdbb20f6d72bc9` matched the immutable artifact through actual HTTPS.

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
