# Pixel Art Projectile Visuals Plan

Status: Implemented
Lifecycle: completed
Category: plan
Last updated: 2026-07-05
Owners: client runtime + content
Scope: Replace beam-quad weapon tracers with pixel-art cannon shell sprites, distance-capped trail ghosts, and muzzle flashes.
Source of truth: no
Supersedes: n/a
Superseded by: n/a
Primary references:
- `docs/systems/core_systems_catalog_v1.md`
- `docs/features/active/asset_delivery_contract.md`
- `bins/sidereal-client/src/runtime/visuals/effects.rs`
- `data/scripts/assets/registry.lua`

## 1. Context and problem

The current bullet visual is a unit quad scaled to `0.62m × 52m` with a soft-glow `beam_trail`
shader (`RuntimeEffectKind::BeamTrailTracer`), **center-anchored at the muzzle** on fire
(`effects.rs` spawn path). Because the quad is centered, ~26 m of beam instantly extends behind
the muzzle and across the hull, so shots appear to come from the back of the ship. The soft
gradient also clashes with the pixel-art ship/asteroid sprites.

Direction (user decision): pixel-art "cannon" style — discrete shell sprites, not a shader beam.
A shader is the wrong primary tool for pixel art (gradients fight the texel aesthetic; sprites are
the established pipeline via the Lua asset registry and the streamed `Sprite { image, custom_size }`
path).

## 2. Current architecture (kept)

Three visual lanes feed pooled bolt entities (`WeaponTracerPool`, 96 pooled `Mesh2d` quads):
local predicted fire (`emit_weapon_tracer_visuals_system`), remote
`ServerWeaponFiredMessage` tracers (`receive_remote_weapon_tracer_messages_system`), and
replicated `BallisticProjectile` entities (`attach_ballistic_projectile_visuals_system`, currently a
flat-color `Sprite` 0.45×2.8 m). Pooling, client ray-cast impact detection, impact spark/explosion
handoff, and Lighting V2 emitter registration (`lighting.rs`) all stay.

## 3. Changes

### 3.1 Pixel-art textures (generated, then committed as source assets)

New PNGs under `data/sprites/weapons/`, registered in `data/scripts/assets/registry.lua`
(`content_type = "image/png"`, `bootstrap_required = true` — combat is core):

| asset_id | file | content |
| --- | --- | --- |
| `cannon_shell_01` | `sprites/weapons/cannon_shell.png` | 6×14 px tracer shell: white-hot tip, yellow/orange core, short dark ember tail, pixel outline |
| `muzzle_flash_01_frame0/1/2` | `sprites/weapons/muzzle_flash_0/1/2.png` | 16×16 px 3-frame flash: bright burst → 4-point star → dissipating sparks |

Asset catalog/publish is automatic: `engine-asset-runtime` builds the catalog from
`asset_root + source_path`; no separate publish step. Delivery stays gateway-HTTP +
client cache (asset delivery contract); WASM consumes the same byte-backed cache adapter path.

### 3.2 Client rendering rework (`bins/sidereal-client/src/runtime/visuals/effects.rs` + `shared.rs`)

1. **Bolts become sprites.** Pooled bolt entities render `Sprite { image: cannon_shell, custom_size }`
   (~`1.0m × 3.4m`) instead of `Mesh2d` + `RuntimeEffectMaterial`. The shell is a small discrete
   bullet anchored **at** the projectile position — the 52 m beam and its center-anchor artifact
   are gone by construction. Velocity-aligned rotation, wiggle, ray-cast impact, TTL fade
   (via `Sprite.color` alpha) are preserved.
2. **Nearest sampling.** Add a nearest-sampler variant of `assets.rs::cached_image_handle` so
   pixel art is not blurred by the default linear sampler. Image handles resolve lazily through a
   small `WeaponSpriteImages` resource (assets are bootstrap-required, so they are cached before
   `InWorld` in practice).
3. **Trail = after-image ghosts, capped by distance travelled.** Each pooled bolt gets 2 child ghost
   sprites at local offsets `-min(spacing·i, distance_travelled)` along the flight axis with reduced
   alpha. The cap guarantees the trail can never extend behind the muzzle. `WeaponTracerBolt` gains
   a `distance_travelled_m` accumulator.
4. **Muzzle flash pool.** Small pool of flash sprite entities; on fire (both local-predicted and
   remote-message paths) a flash spawns at the muzzle, oriented to the shot, animating through the
   3 frames over ~0.09 s.
5. **Replicated projectile sprites.** `attach_ballistic_projectile_visuals_system` uses the shell
   image when resolved (flat-color fallback otherwise).
6. **Lighting V2.** `lighting.rs` tracer-bolt emitter query drops the
   `MeshMaterial2d<RuntimeEffectMaterial>` read and derives intensity from `ttl_s` (bullets are
   emissive presentation; no authoritative state written). The unused `beam_trail` uniform helper is
   removed with the pool's material usage (shader kind retained for other effects unless dead).

### 3.3 Out of scope

Gameplay/balance (fire rate, projectile speed, damage), server combat code, weapon authoring
schema changes, per-weapon sprite variants (the image is pool-wide for v1; a per-weapon
`tracer_sprite_asset_id` in the weapon Lua definition is the natural v2 follow-up).

## 4. Verification

- `scripts/siderealctl fmt` / `clippy` / `check`; `wasm-check` (WebGPU) since shared client
  visuals change, plus a Windows cross-build check
  (`cargo check -p sidereal-client --target x86_64-pc-windows-gnu`).
- Targeted tests: existing tracer/projectile tests in `visuals/projectiles.rs` updated for the new
  bolt fields; new unit tests for ghost-offset capping and flash frame selection.
- `scripts/siderealctl docs-check`.
- Manual/native: fire while flying — shells visibly leave the muzzle and never render behind it;
  trail ghosts trail the shell; muzzle flash plays at the hardpoint; remote ships' fire shows the
  same visuals; impacts still spark/explode; tracer light emitters still illuminate nearby hulls.

## 5. Native / WASM impact

Native: client presentation only. WASM: shared visuals code + byte-backed asset loading — compiles
for `wasm32` (checked); live browser validation deferred per native-stabilization priority.

## Closure Note (2026-07-05)

Implemented. Sprite assets shipped (`data/sprites/weapons/cannon_shell.png`, `muzzle_flash_{0,1,2}.png` + content packages) and the runtime visuals live in `bins/sidereal-client/src/runtime/visuals/projectiles.rs` (tracer/muzzle/impact pools).
