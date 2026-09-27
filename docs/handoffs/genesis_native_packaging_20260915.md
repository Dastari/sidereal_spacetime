# Genesis reviewed native packaging

Implemented renderer catalog: `packages/render/src/environment/reviewed-native-planet-catalog.ts` and generated JSON. All 28 entries have explicit local IDs, accepted revisions/style/layout, fixed-detail qualification, glow/local-light flags, normal `/reviewed-planets/` payload and texture URLs, and exact source/runtime SHA256 values. This catalog supports local Genesis selection; it does not derive or write authoritative appearance identity. Weather descriptors are present for Ocean/Temperate (Cloud r002) and Toxic (Fog r005), matching the existing recipe defaults. Other styles have zero default cloud coverage.

Reproduce assets from an available checkout containing real accepted sources:

```sh
python3 scripts/art_library/package_reviewed_native_planets.py --source-root /root/sidereal_spacetime
REVIEWED_NATIVE_SOURCE_ROOT=/root/sidereal_spacetime NODE_OPTIONS=--max-old-space-size=4096 npx vitest run packages/render/src/environment/reviewed-native-planet-encoding.test.ts --maxWorkers=1
```

The source-root value is an input location only. Generated descriptors and provenance contain portable repository-relative paths. Packaging pins all body hashes to the accepted capture manifest and both weather hashes to explicit constants. Existing destination files with different bytes cause failure. Source art and maps remain unchanged. Each destination revision includes `provenance.json` with source/runtime hashes and texture hashes/lengths.

Desert r014 and Toxic r007 exceed the unchanged 64MiB JSON bound. Their `native-packed-v1` files occupy 30,848,760 and 30,375,176 bytes respectively. SDNPK001 contains a bounded UTF8 JSON header and explicit little-endian binary64 attributes/u32 indices. No precision quantization, topology changes, variant omission, material changes, or placement changes occur. The decoder returns ordinary arrays required by existing composers. It rejects invalid lengths, noncanonical offsets, wrong references/types, nonzero padding, nonfinite values and trailing data. Registration must verify the runtime hash before decoding and validate the resulting kit afterward.

Ice moon1 r002 uses the previously sealed used-variant projection, 45,891,881 bytes, validated by the existing projection helper and recorded equality hash. All other body/weather payloads remain byte-identical source JSON. No new projection policy was introduced.

Validation: all four tests passed on 2026-09-15 in 1.15 seconds with one worker and 4GiB heap cap. Tests covered all28 catalog entries/runtime hashes/budgets, corrupt transport and signed-zero behavior, and complete deep equality of both packed kits against accepted source JSON. Source comparisons are opt-in using the environment variable above because archived source files may be LFS pointers. Small transport and packaged catalog checks always run. Python packer additionally independently unpacks every packed value and compares binary64 bits. Whole-project checks, builds, actual Genesis browser validation, and PR delivery remain coordinator-owned.

All generated public payloads need LFS tracking alongside the existing image rules. Runtime assets are normal dashboard public assets; packaging does not publish a service or activate normal-game authority.

Public staging correction: the active source checkout rebuilds `public/assets` from its publication allowlist. Reviewed packages now reside in `apps/dashboard/public/reviewed-planets/`, served through `/reviewed-planets/`. Existing payloads were moved without repacking; every catalog payload hash still matches. An isolated fixture invoking the actual source `prepare()` confirmed that it deletes withdrawn assets while preserving this sibling directory byte-exact. Historical Ice r015 and Volcanic r018 remain in their existing assets directory.

Cross-selection publication preparation: `reviewed-native-selection.ts` owns current/pending candidates and generation tokens. Three NullEngine tests passed (8ms test time) for old-visible retention, explicit ready-only publication, stale completion rejection, superseded and failed pending cleanup, idempotent disposal, and late completion cleanup with no remaining TransformNodes. Preview integration is coordinator-owned while browser checks run: replace its current/pending/generation state with helper getters, call `begin()` on selection, retain caller AbortController handling, pass each completed candidate to `stage(token,candidate)`, and publish from the render loop through `publishIfReady`. Use `rejectPending()` for terminal preparation failures and `dispose()` on unmount. Caller keeps status/camera/glow handling after publication. The helper does not own the worker or perform request cancellation.
