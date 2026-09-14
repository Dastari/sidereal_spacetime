# IFCS input heartbeat fix — 2026-09-14

Status: implemented and publicly activated. No world module publication or database reset.

Released controls request IFCS braking, but the previous client treated them as idle and sent them only every 1,000 ms. The server accepts flight input for 300 ms, creating a reproducible 300 ms braking / 700 ms coasting cycle. A pending reducer acknowledgement also serialized all later input for up to one second, affecting held thrust and key releases. The world schedule remains 50 ms with three 60 Hz integration substeps.

The client now sends 100 ms heartbeats whenever seated at a control station, including zero demand. On-foot idle remains at one second. Input changes transmit immediately without waiting for earlier acknowledgements; sequence and lease enforcement remain server-owned. Outstanding requests are capped at 32 per connection. Saturation disconnects the stalled socket so the existing session manager reconnects; it does not recycle an unlimited queue on that socket. Old-socket failures, superseded failures and callbacks after disposal cannot back off a newer connection or report stale errors. Explicit current-request rejection retains bounded error backoff; actual network loss still allows the server safety timeout to cut thrust.

## Validation

- Workspace `npm run check`: typecheck, 1,919 tests in 328 files, 87 document/provenance checks passed.
- Workspace `npm run build`: world compilation/binding generation and independent client/dashboard builds passed. Large-chunk warnings remain.
- Focused final transmitter/session tests: 18 passed. Includes sustained zero-input piloting with delayed acknowledgements, continuous deceleration using the actual IFCS solver, immediate key release, bounded stalled requests, replacement sockets, obsolete errors and disposal.
- Release snapshot client typecheck and the same 18 focused tests passed; isolated client build passed.
- Actual HTTPS index and entry code/style files verified against immutable release bytes. Database ping returned 200. Fresh public browser reload reached the styled sign-in screen. This is startup validation, not an authenticated in-game flight recording; continuous braking was verified with the production transmitter and pure flight solver in tests.

## Release isolation and recovery

The release starts from `/root/shipyard-editor-refinements-r005-candidate`, the documented source snapshot of the previous live release. A separate copy at `/root/ifcs-input-fix-20260914` uses normal production configuration and changes only `apps/client/src/App.tsx`, `intent-transmitter.ts` and its test. The source delta is `.runtime/ifcs-input-release.patch`. Shared workspace work from other owners was preserved. Native assets match the prior release; its favicon was copied explicitly after the historical snapshot differed. Build chunk hashes are not claimed reproducible across the source-directory relocation.

Previous client SHA-256: `4a4d558a84a2873c0efa5d82ba896b72c45d8e6226bb5143046abfd9506f4524`.

Activated client SHA-256: `51b4228d8729ac821aaafb717ab83c1064b2fd60008b66ec807fa42f580437fd`.

Managed stage and activation used the exact prebuilt artifact and both expected live/staged digests. Only the public frontend restarted. The world, authentication configuration, dashboard and persisted gameplay data were not changed. Existing game tabs need a reload. The previous immutable client remains available for managed client-only rollback; no authority protocol changed.

Evidence logs and pins are `.runtime/ifcs-input-{check,build}.log`, `.runtime/ifcs-frozen-{tests,typecheck}.log`, `.runtime/ifcs-release-{pins,http,assets}.json`, and `.runtime/ifcs-release-build.log` (asset comparison is stored as `.runtime/ifcs-release-assets.json`; the initially different favicon was preserved before staging).
