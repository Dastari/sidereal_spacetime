# Godot Client Migration Feasibility Report

Status: Archived
Lifecycle: historical-report
Category: report
Last updated: 2026-06-04
Owners: report author
Scope: Godot Client Migration Feasibility Report.
Source of truth: no
Supersedes: n/a
Superseded by: n/a
Primary references:
- n/a

## 0. Status Note

2026-05-04: This is an investigation report only. It does not approve a client migration by itself and does not change the current implementation priority that native Bevy client control/prediction stabilization remains the immediate delivery focus. If a Godot migration is adopted, the architecture documents and `AGENTS.md` invariant that the client is currently one workspace member (`bins/sidereal-client`) must be updated as part of that decision.

## 1. Executive Summary

A Godot migration is feasible for native desktop, but it is not a direct port of the existing client. The practical path is to keep the authoritative client runtime in Rust and Bevy ECS, then embed that runtime into Godot through a Rust GDExtension. Godot should own presentation: scene tree nodes, sprites, cameras, UI, input capture, audio playback, editor tooling, and platform packaging. Rust should continue owning gateway DTOs, Lightyear protocol registration, replication, prediction, Avian f64 simulation state, asset manifest/cache validation, and all authority-sensitive data handling.

The existing replication server and gateway server can stay compatible if the Godot client uses the same `sidereal-net` Lightyear protocol, the same gateway endpoints, and the same authenticated `player_entity_id`/token flow. Reimplementing the Lightyear client protocol in GDScript or C# is not recommended; it would duplicate the most fragile part of the stack and risk breaking prediction, correction, identity binding, and f64 coordinate guarantees.

The largest rewrite is presentation. Current Bevy UI, Bevy cameras, `Material2d` shaders, WGSL runtime shader validation, `bevy_svg`, Bevy render layers, post-process passes, tactical overlay rendering, streamed visual attachment, nameplates, HUD, dialogs, notification UI, and dev console cannot be lifted directly into Godot. They need Godot equivalents over a stable Rust snapshot/event bridge.

Lua can be brought across as Rust code for content tooling and validation, because the existing scripting crate is already `mlua`-based and independent of Bevy rendering. However, current authoritative Lua is server-side by contract. Browser/native clients do not execute authoritative gameplay scripts; they consume replicated outcomes and content catalogs. A Godot client should preserve that split. Client-side Lua inside Godot would be a new non-authoritative feature, not a migration prerequisite.

Godot is a reasonable engine choice for this project because it has direct native extension support and a mature Rust binding path through GDExtension/godot-rust. Unity and Unreal are not obviously better unless the project chooses to move the main client logic into C# or C++ respectively. For a Rust-heavy, server-authoritative, mostly 2D top-down space client that wants to retain Bevy ECS, Godot is the better fit than Unity or Unreal.

## 2. Feasibility Verdict

| Target | Feasibility | Risk | Verdict |
| --- | --- | --- | --- |
| Native Linux/Windows Godot client with Rust GDExtension | High enough to justify a spike | High implementation effort | Feasible if Bevy is embedded headlessly and Godot is presentation-only |
| Existing gateway HTTP compatibility | High | Medium | Reuse Rust gateway adapters/DTOs or wrap them behind a Godot bridge |
| Existing replication compatibility | Medium-high | High | Feasible only if Lightyear/Bevy protocol registration remains in Rust |
| Bevy ECS inside Godot | Medium-high | Medium | Feasible as an embedded headless Bevy `App`; not as two full engines sharing rendering/window ownership |
| Existing Lua content/scripting engine | High for native tooling/server-side use | Medium for Godot web | Bring `sidereal-scripting` across in Rust; keep authority server-side |
| Bevy UI and Bevy rendering migration | Low direct reuse | High | Rewrite in Godot |
| Current WGSL shader/material system | Low direct reuse | High | Port shader families to Godot shader language or define Godot-specific shader assets |
| Browser/WASM Godot client parity | Low for phase 1 | Very high | Defer; godot-rust web support is experimental and uses an Emscripten/GDExtension path unlike the current `wasm32-unknown-unknown` client |

Recommended decision: do not start a full migration immediately. First extract a renderer-agnostic Rust client core from `bins/sidereal-client` and prove a Godot native vertical slice: login, character select, world entry, Lightyear session ready, one predicted controlled entity, simple Godot sprite rendering, realtime input, asset bootstrap, and disconnect/error handling.

## 3. Current Client Baseline

The current client is a substantial Bevy application, not just a thin renderer. `bins/sidereal-client/src` is about 44.5k Rust lines, with another roughly 6.3k lines in closely related shared crates inspected for UI/audio/assets/net/scripting. It contains platform startup, gateway auth, Lightyear transport, replication adoption, prediction, Avian motion ownership, asset delivery, runtime shader management, UI, audio, diagnostics, and debug tools.

### 3.1 Workspace and Dependency Shape

Important current dependencies:

- Bevy `0.18.0` is the application/runtime host.
- Avian2d `0.5.0` is configured with f64 physics support.
- Lightyear is used from a pinned git revision with UDP, WebTransport, raw connection, replication, prediction, interpolation, frame interpolation, native input, and Avian integration.
- `mlua 0.11` is used with vendored Lua 5.4 for the scripting/content pipeline.
- `sidereal-client` is a single crate with a native `[[bin]]` target and WASM `[lib]` target.

Local references:

- `Cargo.toml`
- `bins/sidereal-client/Cargo.toml`
- `docs/architecture/sidereal_design_document.md`

### 3.2 Runtime State Machine

The client state machine is:

- `StartupLoading`
- `Auth`
- `CharacterSelect`
- `WorldLoading`
- `AssetLoading`
- `InWorld`

This is defined in `bins/sidereal-client/src/runtime/app_state.rs`. The same file holds `ClientSession`, selected character state, session-ready state, controlled/selected entity state, free camera state, and owned-entity panel state. This model maps well to a Godot front end: Godot can render scenes/screens for each state while Rust remains the source of state transitions that are driven by gateway, replication, and asset readiness.

Migration status: mostly reusable as Rust state, but Godot UI needs a new presentation layer.

### 3.3 Bevy Runtime Composition

`configure_client_runtime` in `bins/sidereal-client/src/runtime/app_setup.rs` wires the core runtime:

- Avian `PhysicsPlugins`, with `PhysicsTransformPlugin` and `PhysicsInterpolationPlugin` disabled.
- Gravity set to zero.
- Shared Sidereal client core and fixed tick from `SIM_TICK_HZ`.
- Lightyear `ClientPlugins`.
- `LightyearAvianPlugin` using `PositionButInterpolateTransform`.
- Bevy `Transform -> Position` sync disabled to preserve `Position`/`Rotation` ownership.
- Frame interpolation and Lightyear native input support.
- `register_lightyear_client_protocol`.
- Shared simulation plugin with `SimulationRuntimeRole::ClientPrediction`.
- Fixed update systems for motion ownership and mass synchronization before gameplay simulation.
- Bootstrap, transport, replication, and prediction plugins for all modes.
- Visuals, lighting, UI, post-process, and diagnostics plugins only when not headless.

This split is encouraging: a headless transport app already exists. However, the current headless app still initializes Bevy asset, mesh, image, shader, scene, and transform infrastructure because Avian/collider/runtime code expects some of those resources. A Godot migration should push this split further by extracting a true presentation-neutral `sidereal-client-core`.

Migration status: core scheduling is reusable; app construction must be extracted and made embeddable.

### 3.4 Native and WASM Platform Entry

The native client can run either:

- windowed Bevy/winit with Bevy render, WGPU settings, SVG/material plugins, remote inspect, and continuous event loop; or
- headless transport mode with `MinimalPlugins`, transform, asset, scene, and minimal asset types.

The WASM client currently uses browser fetch and IndexedDB adapters plus Lightyear WebTransport. The design docs explicitly say native stabilization is the near-term priority and live browser parity validation is deferred while native in-world control and correction are stabilized.

Migration status: native platform behavior can be rehosted in Godot; WASM should be deferred until a separate Godot/godot-rust web spike proves extension, WebTransport, cache, and audio viability.

### 3.5 Gateway Auth and World Entry

The client talks to the gateway through shared DTOs and adapters:

- `/auth/v1/login/password`
- `/auth/v1/login/challenge/totp`
- `/auth/me`
- `/auth/characters`
- `/world/enter`
- `/startup-assets/manifest`
- `/startup-assets/<asset_guid>`
- `/assets/bootstrap-manifest`
- `/assets/<asset_guid>`

The gateway routes are visible in `bins/sidereal-gateway/src/api.rs`, and native/WASM client adapters are in `bins/sidereal-client/src/platform/native/io.rs` and `bins/sidereal-client/src/platform/wasm.rs`.

World entry produces a character-scoped token and replication transport config. WASM validates WebTransport address and certificate digest before entering. Native currently accepts UDP config and can derive local loopback-friendly defaults.

Migration status: reusable. The safest Godot path is to keep this logic in Rust and expose high-level login/character/world-entry methods to Godot UI.

### 3.6 Replication and Protocol

`crates/sidereal-net/src/lightyear_protocol/messages.rs` defines `LIGHTYEAR_PROTOCOL_VERSION = 8` and the message set:

- client auth/session bind,
- session ready/denied,
- disconnect notify,
- control request/ack/reject,
- realtime input,
- local view mode,
- tactical resnapshot requests,
- weapon fire/destruction presentation events,
- tactical fog and tactical contacts snapshots/deltas,
- owner asset manifests,
- asset catalog version notifications,
- server notifications and client dismissal.

`crates/sidereal-net/src/lightyear_protocol/registration.rs` registers message directions and channels:

- `ControlChannel`: unordered reliable, bidirectional.
- `InputChannel`: sequenced unreliable.
- `TacticalSnapshotChannel`: ordered reliable.
- `TacticalDeltaChannel`: sequenced unreliable, server-to-client.
- `ManifestChannel`: ordered reliable, server-to-client.
- `NotificationChannel`: ordered reliable, bidirectional.

The same file manually registers Avian physics components for prediction, correction, rollback thresholds, and interpolation, then deterministically registers all `sidereal_component` replicated types sorted by component kind. This is exactly the kind of code that should not be rewritten in Godot scripting.

Migration status: reusable if Rust/Bevy/Lightyear stays embedded. High risk if reimplemented outside Rust.

### 3.7 Transport

Native transport uses Lightyear UDP. WASM transport uses Lightyear WebTransport with a certificate digest. The runtime adds required channel senders/receivers after the Lightyear client entity exists.

Migration status:

- Native Godot: likely reusable with embedded Rust Lightyear client.
- Godot web: high risk. It would need Godot web export, GDExtension extension support, Rust/Emscripten extension builds, browser WebTransport compatibility, and the same authenticated fetch/cache boundary.

### 3.8 Input, Control, Prediction, and Motion

Current player input uses keyboard mappings:

- `W`: forward thrust
- `S`: reverse thrust
- `A`/`D`: turn
- `Ctrl`: brake
- `Shift`: afterburner
- `Space`: primary fire

`bins/sidereal-client/src/runtime/input.rs` converts these into `PlayerInput` and a `ClientRealtimeInputMessage`. It sends immediately on input/target changes and otherwise sends a 0.1s heartbeat. It only sends authoritative realtime intent when the control lease, control generation, selected player, and predicted controlled entity line up. Local input markers and Lightyear native input state are applied only to the active predicted controlled entity.

The motion code enforces single-writer ownership for `Position`, `Rotation`, `LinearVelocity`, and `AngularVelocity`; presentation transforms must not feed back into simulation state. This is a hard architecture invariant in `AGENTS.md`.

Migration status: input capture should move to Godot, but Rust must continue to own control validation, realtime message construction, prediction, correction, and Avian state.

### 3.9 Visibility, Tactical, Owner Manifest, and Free Camera

The client receives:

- actual replicated/interpolated/predicted entities from Lightyear,
- tactical fog snapshots/deltas,
- tactical contacts snapshots/deltas,
- owner asset manifest snapshots/deltas,
- notification messages.

Free camera is local presentation state. It must not widen authoritative visibility or become an authoritative world transform. Local view mode/delivery radius messages are hints to server delivery policy and are still bounded server-side.

Migration status: Rust should keep tactical caches and local-view message semantics; Godot should render map/contact/fog/UI overlays from bridge snapshots.

### 3.10 Replicated Entity Adoption and Hierarchy

The client distinguishes confirmed/replicated, predicted, and interpolated lanes. It adopts Lightyear entities when required spatial components are present, maps them to stable runtime entity IDs, attaches visual markers, defers controlled predicted adoption until motion components are present, and preserves parent/child hierarchy synchronization. Control tags are only bound to the predicted clone for active control.

Migration status: keep Rust adoption/registry logic. Godot should mirror adopted entity snapshots by Sidereal entity ID or UUID, never by raw Bevy `Entity`.

### 3.11 Asset Delivery and Runtime Cache

The asset runtime uses:

- startup asset manifests,
- authenticated bootstrap manifests,
- authenticated `/assets/<asset_guid>` fetches,
- checksum validation,
- cache index records,
- runtime dependency scanning,
- optional asset fetching,
- catalog version invalidation,
- native filesystem cache,
- WASM IndexedDB cache adapter.

The asset contract requires gateway HTTP delivery for payload bytes; replication must not stream asset payloads. Asset IDs, filenames, shader/material/audio/sprite references, bootstrap sets, and dependencies are Lua-authored/generated, not hardcoded in Rust runtime code.

Migration status: asset manifest/cache logic is reusable in Rust. Mounting loaded bytes into Godot resources must be rewritten.

### 3.12 Rendering and Visual Effects

The current Bevy renderer is deeply custom:

- Bevy `Material2dPlugin` for starfield, backgrounds, streamed sprites, asteroids, planets, stars, runtime effects, and tactical map overlay.
- `bevy_svg` for SVG assets.
- bundled WGSL shader sources under `data/shaders/`.
- runtime shader slots and assignment sync.
- `naga` validation for streamed WGSL ABI/binding compatibility.
- Bevy render layers, cameras, fullscreen layers, backdrop passes, and post-process effects.
- streamed visual attachment, duplicate predicted/interpolated visual suppression, planet visual stacks, thruster plumes, weapon tracers, impact sparks, explosion effects, fade-in, and lighting-derived material updates.

Godot cannot use these Bevy `Material2d` types or WGSL shader handles directly. Godot uses its own scene/rendering APIs and its own shader language. Logical shader families and asset IDs can survive, but shader sources and material bindings need Godot-native equivalents.

Migration status: major rewrite. Keep data contracts; port presentation implementations.

### 3.13 UI and UX Surface

Current Bevy UI includes:

- startup loading,
- login with password/TOTP,
- character select,
- world loading,
- asset loading,
- HUD,
- tactical map,
- nameplates,
- sensor ring,
- owned entities panel,
- notifications,
- persistent dialogs,
- pause/logout,
- dev console,
- debug overlay.

`ClientUiPlugin` registers dev console, notifications, menu/loading UI, in-world UI, post-update UI, and logout systems. These are Bevy ECS/UI systems. They should not be ported line-for-line.

Migration status: rewrite as Godot `Control` scenes and Godot scripts or Rust-backed Godot classes. Reuse DTOs, state names, and behavior contracts.

### 3.14 Audio

The native client has a Kira-backed audio backend with:

- authored bus graph sync,
- menu/world music,
- one-shots,
- loop emitters,
- spatial listener sync,
- debug probes,
- profile/cue lookup from the Lua-authored audio registry.

The documented audio contract says WASM backend parity is still incomplete. Audio is client presentation only; servers never stream audio bytes or delegate gameplay authority to client audio state.

Migration status: keep Lua audio catalog and logical profile IDs. Prefer a Godot audio backend for playback rather than embedding Kira inside Godot unless there is a specific Kira-only feature Godot cannot match.

### 3.15 Lua and Scripting

`crates/sidereal-scripting` uses `mlua` with vendored Lua 5.4. The sandbox disables `io`, `os`, and `package`, removes `dofile`, `loadfile`, and `require`, applies memory limits, and installs an instruction-budget hook. Script path resolution rejects absolute paths, non-Lua files, and root escapes.

The scripting support docs state that browser/native clients do not execute authoritative gameplay scripts. Lua emits high-level intents on the server side; Rust validates and applies them. Clients render replicated state and presentation messages. Lua also authors content registries for assets, audio, planets, asteroids, ships/modules, render layers, and world initialization.

Migration status: Lua engine can come across as a Rust crate for native Godot tooling or content validation, but authoritative gameplay scripting should remain server-side.

### 3.16 Diagnostics and Remote Inspection

The current client includes BRP/remote inspect, debug overlays, logs, dev console, phase capture, runtime perf counters, and headless transport controls. These tools are Bevy-specific in presentation and scheduling, but the underlying diagnostic state can be bridged.

Migration status: diagnostics need a two-tier approach: retain Rust counters/snapshots; rebuild UI/debug display in Godot.

## 4. Godot and Rust Technical Fit

Godot's GDExtension system is designed for native code extension without recompiling Godot itself. The `.gdextension` file tells Godot how to load platform-specific extension libraries. Godot stable documentation also lists platform feature tags including Windows, Linux, macOS, Android, iOS, web, double precision, single precision, x86_64, arm64, and wasm32.

The godot-rust project provides Rust bindings for Godot 4 through GDExtension. Its setup guide assumes Godot 4 and Rust via `rustup`. That is a good fit for native desktop development.

Important caveat: godot-rust web export support is explicitly experimental. The documented path uses `wasm32-unknown-emscripten`, nightly Rust, `-Zbuild-std`, Emscripten, `.gdextension` web library entries, Godot export "Extensions Support", and cross-origin isolation for extension/thread support. That differs significantly from the current `sidereal-client` WASM path, which targets browser WASM directly with Bevy/WebGPU and Lightyear WebTransport.

Godot web stable docs also say Godot web export requires WebAssembly/WebGL 2.0, does not currently support WebGPU for Forward+/Mobile on web, and requires Extension Support for GDExtension projects. This is enough friction that web parity should not be a first milestone.

Bevy ECS itself is usable as a standalone Rust crate, but Sidereal is not using only `bevy_ecs`. The client depends on Bevy `App`, schedules, resources, states, messages, transform, time, asset/event plumbing, Lightyear plugins, and Avian plugins. That still fits an embedded Rust runtime, but it means the Godot bridge should run a headless Bevy `App`, not just a raw `World`.

## 5. Recommended Godot Architecture

### 5.1 Core Principle

Godot should be a presentation host. Rust should remain the client authority boundary.

The Godot scene tree should never become the authoritative state store for:

- world positions,
- velocities,
- rotations,
- control target state,
- prediction/correction state,
- replicated gameplay components,
- identity binding,
- visibility authorization,
- asset checksum/catalog validation.

Godot should render snapshots produced by Rust and feed user intent back into Rust.

### 5.2 Proposed Crate/Project Split

Recommended future layout:

- `crates/sidereal-client-core`: presentation-neutral Rust client runtime. Owns a headless Bevy `App`, Lightyear, Avian, replication, prediction, gateway adapters, asset/cache state, tactical caches, and bridge snapshots.
- `clients/godot/` or `bins/sidereal-godot-client/`: Godot project plus Rust GDExtension crate. Exact placement needs an architecture decision because current docs say the client is one workspace member.
- `crates/sidereal-client-bridge` if needed: DTOs for crossing Bevy/Godot boundary, using Sidereal entity IDs and serializable snapshots.

Do not add a separate copy of gameplay components or protocol structs in GDScript. Godot-facing structs should be presentation DTOs derived from the Rust ECS world.

### 5.3 Rust Runtime Loop

Start with the simple model:

1. Godot calls a Rust `SiderealClientRuntime.physics_tick(delta)` method from `_physics_process`.
2. Rust accumulates time but only advances Bevy fixed-step simulation using the existing fixed tick rate.
3. Godot input events are translated into a compact Rust input snapshot.
4. Rust updates Lightyear, prediction, replication adoption, asset/gateway tasks, tactical caches, and notification queues.
5. Rust exposes a frame snapshot for Godot presentation.

Avoid running Godot API calls from Rust network/task threads. If Rust needs background workers for HTTP/cache/network, it should marshal results into Rust-owned queues and expose them on the main Godot thread.

Later, if performance requires it, Rust networking can run on a dedicated thread, but Godot API calls must remain thread-safe and main-thread-bound.

### 5.4 Bridge Data Model

Use stable DTOs:

- `SiderealClientStateSnapshot`
- `AuthUiSnapshot`
- `CharacterSelectSnapshot`
- `LoadingProgressSnapshot`
- `WorldEntitySnapshot`
- `WorldVisualSnapshot`
- `TacticalSnapshot`
- `OwnedEntitySnapshot`
- `NotificationSnapshot`
- `AudioEvent`
- `AssetDemandSnapshot`
- `DebugSnapshot`

All entity references crossing the boundary must be Sidereal entity IDs/UUIDs, not Bevy `Entity` IDs.

World positions should remain f64 in Rust. Godot should receive camera-relative presentation coordinates for rendering. This preserves the project rule that authoritative world-space coordinates are f64 while render/UI projection may be f32/local.

### 5.5 Godot Scene Ownership

Godot should own:

- windows and main loop,
- scenes and `Node2D`/`Control` hierarchy,
- cameras and viewports,
- sprites, textures, particles, animation, shader materials,
- UI interaction and focus,
- audio buses and players,
- editor workflow,
- package/export pipeline.

Rust should own:

- gateway auth and world-entry state,
- token/session identity,
- Lightyear transport,
- replication protocol registration,
- prediction/reconciliation,
- Avian f64 simulation components,
- local control lease validation,
- asset manifest/cache/checksum logic,
- Lua registry validation if needed,
- bridge snapshots/events.

## 6. Migration Compatibility Matrix

| Current capability | Current implementation | Godot migration path | Status |
| --- | --- | --- | --- |
| Gateway login/password/TOTP | Rust gateway adapters + Bevy UI | Keep Rust adapters, rebuild UI in Godot | Reuse core, rewrite UI |
| Character select | Gateway DTOs + Bevy UI state | Keep DTO/state, render Godot screen | Reuse core, rewrite UI |
| World entry | Gateway `/world/enter` + character-scoped token | Keep Rust world-entry flow | Reuse |
| Replication auth/session ready | `ClientAuthMessage`, `ServerSessionReadyMessage` | Keep Lightyear/Rust protocol | Reuse |
| Native UDP replication | Lightyear UDP in Bevy app | Keep in embedded Bevy runtime | Reuse with spike |
| WASM WebTransport | Lightyear WebTransport + Bevy WASM | Separate Godot web spike | Defer |
| Protocol version/channel registration | `sidereal-net` registration | Keep exactly the same Rust path | Reuse |
| Realtime input | Bevy keyboard input -> Rust messages | Godot input -> Rust input DTO -> existing send path | Adapt |
| Local prediction | Lightyear native input + Avian + Sidereal realtime input | Keep embedded Bevy runtime | Reuse |
| Motion ownership | Rust ECS systems | Keep Rust only | Reuse |
| f64 world coordinates | Avian f64 + protocol f64 arrays | Keep f64 in Rust; Godot gets render-local projection | Reuse with bridge care |
| Tactical fog/contacts | Rust caches + Bevy UI | Keep caches, Godot map UI | Reuse core, rewrite UI |
| Owner manifest | Rust caches + Bevy UI | Keep caches, Godot panel | Reuse core, rewrite UI |
| Asset manifests/cache | Rust adapters, checksum, Bevy asset mounting | Keep manifest/cache; add Godot resource mounting | Adapt |
| Runtime image loading | Bevy `Image::from_buffer` | Godot `ImageTexture`/resource loaders | Rewrite mount path |
| Runtime SVG loading | `bevy_svg` | Use Godot import if static; for runtime bytes likely rasterize via Rust/resvg then make texture | Rewrite |
| WGSL shaders | Bevy `Shader` + Naga validation | Port to Godot shader language or Godot-specific shader assets | Rewrite |
| Runtime shader families | Lua/catalog logical shader IDs | Keep logical IDs; add Godot shader variant contract | Adapt |
| Fullscreen/background/post-process | Bevy material/camera/render layer stack | Godot viewports/canvas shaders/post-processing | Rewrite |
| Planet/star procedural visuals | Bevy meshes/materials | Godot mesh/polygon/shader implementation | Rewrite |
| Thrusters/tracers/explosions | Bevy ECS visual systems | Godot particles/sprites/materials driven by Rust events | Rewrite presentation |
| Lighting V2 presentation | Rust-derived presentation state + Bevy materials | Keep logical lighting state; update Godot shader params | Adapt |
| Auth/loading/HUD/tactical UI | Bevy UI and `sidereal-ui` | Godot `Control` scenes | Rewrite |
| Dialog errors | Bevy dialog queue | Keep Rust error queue, Godot modal presentation | Adapt |
| Notifications | Replicated messages + Bevy toasts | Keep protocol, Godot toast UI | Adapt |
| Dev console/debug overlay | Bevy UI/gizmos | Godot console/debug overlay from Rust diagnostics | Rewrite |
| Audio catalog | Lua registry + Rust catalog | Keep | Reuse |
| Audio playback | Kira native backend, null fallback | Prefer Godot audio backend from Rust/Godot events | Rewrite backend |
| Lua authoritative scripts | Server-side `mlua` | Keep server-side | Reuse unchanged |
| Lua content validation in tools | `sidereal-scripting` | Can be reused in Rust GDExtension/editor tools | Reuse native, web uncertain |
| BRP remote inspect | Bevy remote/native | Need Godot/Rust diagnostic endpoint or editor panel | Adapt/rewrite |

## 7. What Will Work

### 7.1 Keeping the Server Protocol

The existing gateway and replication servers can keep their current APIs if the Godot client does not fork the protocol. A Rust GDExtension can depend on the same workspace crates and call the same registration functions.

The migration should preserve:

- `LIGHTYEAR_PROTOCOL_VERSION`,
- message structs,
- channel modes and directions,
- deterministic replicated component registration,
- `player_entity_id` canonicalization,
- character-scoped tokens,
- server-side control generation,
- f64 protocol fields for world/tactical coordinates.

### 7.2 Embedding Bevy ECS

A headless Bevy `App` inside a Rust GDExtension is the realistic way to retain Bevy ECS. The current native headless app already shows most of the required shape: `MinimalPlugins`, transform, asset, scene, mesh/image/shader asset events, and the shared runtime configuration.

What should work:

- ECS resources/states/messages,
- fixed update scheduling,
- Lightyear client entity and transport components,
- Avian f64 components and prediction,
- Sidereal shared simulation plugin,
- replication adoption and hierarchy caches,
- tactical/manifest/notification caches,
- asset manifest/cache state.

What must be removed from the embedded core:

- Bevy window/winit ownership,
- Bevy render graph ownership,
- Bevy UI,
- Bevy cameras as presentation authorities,
- Bevy `Material2d` runtime rendering,
- Bevy asset server assumptions that expect filesystem paths for browser/runtime streamed assets.

### 7.3 Gateway and Asset Delivery

Gateway HTTP code is a good migration candidate because it already sits behind platform adapters. Godot can either:

- call Rust methods that use Rust HTTP clients and shared DTOs, or
- use Godot HTTP APIs but pass JSON through Rust DTO validation.

The first option is safer because it keeps auth, token, asset manifest, checksum, and cache semantics in one Rust implementation.

### 7.4 Lua Content Registry

Lua registry loading can be reused in Rust for native Godot tooling. This is useful for:

- editor preview of asset catalogs,
- validating Godot shader/audio/resource mappings against Lua-authored IDs,
- validating content registries without starting the full server,
- shared asset registry build tools.

It should not become client authority.

### 7.5 Godot UI and 2D Presentation

Godot is strong at 2D scene organization, Control-based UI, editor iteration, and packaging. It should improve iteration speed for complex UI compared with the current Bevy UI implementation. The account/character/loading/HUD/tactical UI surfaces are natural Godot `Control` candidates.

## 8. What Will Not Work Directly

### 8.1 Two Full Engines Owning the Same Window/Renderer

Running the existing Bevy windowed client inside Godot is the wrong model. Bevy and Godot would both want ownership over event loop, window, GPU device, asset lifetime, cameras, and rendering. The migration must strip Bevy to a headless runtime.

### 8.2 Bevy UI

The Bevy UI systems are not portable to Godot. Reusing them would keep the worst coupling and defeat the point of the migration. Port behavior and state, not UI code.

### 8.3 Bevy `Material2d` and WGSL Shaders

Godot does not use Bevy `Material2d` or Bevy shader handles. Godot shaders use Godot shader language. The current Naga validation path validates WGSL bindings for Bevy material ABI; that does not validate Godot shader compatibility.

The project can keep logical shader family IDs, but it needs a Godot shader contract:

- Godot shader source assets or generated `.gdshader` files,
- Godot uniform naming/binding conventions,
- validation tools for Godot shader families,
- mapping from Lua asset catalog shader families to Godot materials,
- fallback shader behavior equivalent to the Bevy fallback policy.

### 8.4 Runtime SVG Assumptions

`bevy_svg` does not carry over. If SVGs remain runtime-delivered authenticated bytes, the Godot path probably needs Rust-side rasterization via `resvg` or a constrained Godot loader path. Static editor-imported SVGs are easier, but Sidereal's asset contract emphasizes runtime authenticated cache bytes.

### 8.5 Godot Physics as Authoritative Motion

Godot physics should not replace Avian for the replicated/predicted gameplay simulation in phase 1. The server and current client use Avian f64 motion components and Lightyear/Avian prediction registration. Switching client physics to Godot would be a protocol and prediction rewrite.

Godot physics can be used later for local-only presentation helpers, pointer hit testing, or UI interactions, but it should not write authoritative or predicted gameplay motion state.

### 8.6 Immediate Browser Parity

The current browser path is already specialized. Godot + Rust + GDExtension web export introduces a different target (`wasm32-unknown-emscripten`), export flags, extension support, thread/cross-origin isolation concerns, and experimental godot-rust support. Treat Godot web as a later research track.

## 9. Lua Scripting Migration

### 9.1 What "Bringing Lua Across" Means

There are three different Lua surfaces:

1. Authoritative gameplay scripts and AI intents.
2. Content registries for assets/audio/world definitions.
3. Possible client-side presentation/mod scripts.

Only the first two exist in the current architecture. The third would be new.

### 9.2 Authoritative Lua

Authoritative Lua should remain on the server/gateway/replication side. The current contract says clients receive replicated outcomes and presentation messages; scripts do not authoritatively mutate client transforms or velocities. Moving authoritative Lua into Godot would violate the server-authoritative model.

Verdict: do not migrate authoritative Lua into the client.

### 9.3 Lua Content Registries

Lua registry loading can come across because it is Rust-based and sandboxed. A Godot native extension can link `sidereal-scripting` and validate/load registries the same way other Rust tools do.

Useful native Godot uses:

- local content preview,
- editor import validation,
- asset ID lookup,
- audio profile lookup,
- shader/material family mapping validation,
- debug panels showing resolved Lua-authored definitions.

Verdict: bring registry loading across as Rust tooling, not as gameplay authority.

### 9.4 Client-Side Lua Presentation Scripts

If desired later, Godot could support non-authoritative Lua presentation scripts. That would need a new contract:

- no direct network send except approved UI actions,
- no authoritative ECS mutation,
- no transform/velocity writes,
- no token access,
- no file/network APIs outside sandbox,
- deterministic failure isolation,
- explicit UI/event API only.

This is not required for the migration and should not be included in the first spike.

## 10. Asset and Content Implications

### 10.1 Preserve the Logical Asset Contract

The Sidereal asset contract should survive:

- Lua-authored asset IDs and dependencies,
- generated catalogs,
- gateway startup/bootstrap manifests,
- authenticated asset fetch,
- checksum/version validation,
- cache index,
- replication payloads carry logical IDs, not bytes.

### 10.2 Replace Bevy Mounting

Godot needs new mount adapters:

- images -> `ImageTexture` or imported Godot texture resources,
- audio bytes -> Godot `AudioStream` resources or temp/cache files if Godot requires paths for specific codecs,
- SVG bytes -> rasterized textures or static imported assets,
- shader assets -> Godot shader resources,
- material presets -> Godot `ShaderMaterial` parameter sets,
- post-process/fullscreen layers -> Godot viewports/canvas shaders.

### 10.3 Godot `.pck` Versus Sidereal `assets.pak`

Godot's packaged resources and Sidereal's authenticated MMO-style cache should remain separate at first. Sidereal runtime content is delivered by the gateway and validated by Sidereal checksums. Godot's `.pck` should contain the base client/editor resources needed to boot the client and load the Rust extension.

If production packaging later wants a single preload bundle, define an explicit bridge between Godot packaging and Sidereal `assets.pak`; do not silently replace the Sidereal asset contract with Godot import assumptions.

## 11. Rendering and Shader Migration Plan

The rendering migration should happen by family, not by trying to transpile all Bevy visuals at once.

Recommended order:

1. Simple replicated entity sprites with static Godot materials.
2. Camera-relative f64-to-render projection and zoom.
3. Streamed image assets from Sidereal cache bytes.
4. Tactical map contacts/fog using Godot UI/canvas drawing.
5. Thruster/tracer/explosion event visuals.
6. Planet/star procedural visuals.
7. Fullscreen starfield/space background.
8. Runtime shader family assignment from Lua/catalog.
9. Godot shader validation/tooling.
10. Post-process effects and advanced lighting.

Do not put shader streaming on the critical path for the first vertical slice. Start with a small fixed Godot shader set, then expand the asset contract to include Godot shader variants.

## 12. UI Migration Plan

Recommended Godot UI scenes:

- `StartupLoadingScreen`
- `AuthScreen`
- `CharacterSelectScreen`
- `WorldLoadingScreen`
- `AssetLoadingScreen`
- `InWorldHud`
- `TacticalMap`
- `OwnedEntitiesPanel`
- `NotificationLayer`
- `DialogLayer`
- `PauseMenu`
- `DevConsole`
- `DebugOverlay`

Rust should expose state snapshots and commands:

- `submit_login(email, password)`
- `submit_totp(challenge_id, code)`
- `select_character(player_entity_id)`
- `enter_world()`
- `request_control(entity_id)`
- `set_local_view_mode(mode, delivery_range_m)`
- `dismiss_notification(notification_id)`
- `logout()`
- `send_console_command(command)`

Godot should not construct raw network messages directly.

## 13. Audio Migration Plan

Recommended audio approach:

1. Keep Lua-authored audio catalog and profile IDs.
2. Keep Rust catalog validation and asset demand tracking.
3. Replace Kira playback with a Godot audio backend for the Godot client.
4. Emit `AudioEvent` bridge items from Rust for menu/world music, one-shots, loops, spatial emitters, and debug probes.
5. Implement Godot audio bus/effect mapping from the same authored bus/profile data where feasible.

Kira should remain available for the existing Bevy native client until the Godot backend reaches parity. Avoid sharing two live audio engines inside one Godot process unless a specific Kira capability is required.

## 14. Detailed Issue List

### 14.1 GDExtension Lifecycle and Reloading

Godot can reload extensions during development depending on configuration and binding support. Rust runtime state may own sockets, tasks, cache file handles, and a Bevy world. The extension needs explicit startup/shutdown methods and must cleanly disconnect from replication before unload.

### 14.2 Panic and FFI Boundaries

Rust panics crossing GDExtension boundaries are unacceptable. All exported methods should catch/contain errors and return Godot-safe results. The godot-rust web guide notes that panics in Wasm cannot currently be caught there, which is another reason to defer web.

### 14.3 Threading

Godot APIs are not generally safe to call from arbitrary Rust worker threads. Rust networking/cache tasks should communicate through channels into a main-thread bridge. Godot scene updates should happen on the Godot main thread.

### 14.4 Bevy App Reentrancy

A Bevy `App` embedded in Godot must be ticked from one owner. Do not tick from both Godot `_process` and a Rust background loop. Start with `_physics_process` driving the Rust runtime.

### 14.5 Event Loop Ownership

Do not include Bevy `WinitPlugin`, Bevy window plugins, or Bevy render plugins in the Godot embedded runtime. Godot owns window/event loop/rendering.

### 14.6 Lightyear Assumptions

Lightyear plugins may assume Bevy time/schedules/resources but should not need Bevy rendering. This requires a spike because the current headless app still initializes some asset/render-adjacent types for collider and asset event paths.

### 14.7 Native Library Packaging

Godot needs a `.gdextension` file with per-platform dynamic libraries. CI must build Linux and Windows extension artifacts. Windows packaging must include all dependent DLLs. The current client Windows cargo check is not enough for Godot packaging.

### 14.8 Godot Web

Godot web GDExtension requires extension support, web-compiled libraries, and cross-origin isolation for extension/thread support. godot-rust web support is experimental. Current Bevy WASM uses WebGPU/WebTransport assumptions that do not translate directly to Godot web.

### 14.9 f64 World Coordinates

Sidereal authoritative state is f64. Godot presentation should use camera-relative coordinates and origin rebasing. Never round/stringify/downcast at the Rust protocol/cache boundary.

### 14.10 Duplicate Entity Graphs

The Bevy ECS world and Godot scene tree will both represent world entities. The bridge needs deterministic spawn/update/despawn diffing by Sidereal entity ID. It must handle predicted/interpolated duplicate suppression the same way the current Bevy visuals do.

### 14.11 Shader Language Mismatch

WGSL validation with Naga cannot validate Godot shaders. The dashboard/editor shader workflow will need a Godot-aware validation target if Godot becomes the primary client.

### 14.12 Asset Import Versus Runtime Bytes

Godot editor imports are convenient, but Sidereal runtime asset delivery is authenticated byte delivery. Runtime-loaded cache bytes need first-class Godot mounting. Do not assume every asset is available as a `res://` editor import.

### 14.13 UI Parity Scope

The UI surface is broad. Auth, TOTP, character select, loading, HUD, tactical, owned entities, notifications, dialogs, pause/logout, sensor ring, nameplates, dev console, and debug overlay must be accounted for before claiming feature parity.

### 14.14 Audio Backend Parity

Godot audio should cover most client needs, but authored bus/effect/spatial semantics need explicit mapping. If Godot lacks a specific Kira effect/send behavior, the profile schema needs a documented fallback.

### 14.15 Maintaining Bevy Client During Migration

The current Bevy client should remain until Godot reaches functional parity. During transition, shared Rust crates must not fork behavior. The bridge should reuse the same client core where possible.

## 15. Proposed Phased Plan

### Phase 0: Decision and Spike Definition

Deliverables:

- architecture decision draft for a Godot client experiment,
- explicit statement that Bevy native remains current supported client during the spike,
- CI target list for Rust GDExtension dynamic libraries,
- minimal Godot project skeleton,
- "no protocol fork" acceptance criterion.

Exit criteria:

- Godot can load a Rust GDExtension and call a trivial Rust method on Linux and Windows.

### Phase 1: Extract Presentation-Neutral Client Core

Deliverables:

- `sidereal-client-core` or equivalent internal module extraction,
- headless Bevy `App` builder that excludes Bevy window/render/UI,
- gateway auth/world-entry methods independent of Bevy UI,
- bridge event/snapshot DTOs,
- tests for state transitions and snapshot conversion.

Exit criteria:

- existing native headless client still works,
- extracted core can run without Bevy window/render plugins,
- no server protocol changes.

### Phase 2: Godot Native Network Vertical Slice

Deliverables:

- Godot auth screen calls Rust login/TOTP,
- character select calls Rust world entry,
- Rust embedded Lightyear client connects to replication over UDP,
- Rust sends `ClientAuthMessage`,
- Rust receives `ServerSessionReadyMessage`,
- Godot shows session/connection state.

Exit criteria:

- no GDScript protocol duplication,
- replication server accepts Godot client as a normal client,
- protocol version mismatch is surfaced through persistent UI.

### Phase 3: In-World Minimal Presentation

Deliverables:

- Godot renders simple sprites for adopted replicated entities,
- Rust exposes entity snapshots with f64 world positions and render-local projection data,
- Godot sends W/A/S/D/Space intent into Rust,
- predicted controlled entity moves locally and receives correction,
- disconnect/logout works.

Exit criteria:

- one controlled entity can be flown in Godot against the existing replication server,
- Godot scene transforms never write Rust authoritative motion components.

### Phase 4: Asset Bootstrap and Basic Runtime Assets

Deliverables:

- startup/bootstrap manifest progress screens,
- authenticated asset fetch/cache through Rust,
- Godot texture mounting from validated bytes,
- simple streamed sprite assets,
- missing/failing asset errors surfaced through dialogs.

Exit criteria:

- a clean cache can enter world and render at least one gateway-delivered visual asset.

### Phase 5: UI and Tactical Parity

Deliverables:

- HUD,
- tactical map/fog/contact rendering,
- owned entities panel,
- nameplates,
- notifications,
- dialogs,
- pause/logout,
- dev console subset.

Exit criteria:

- all current gameplay-visible information surfaces have Godot equivalents.

### Phase 6: Visual Effects, Lighting, and Shader Families

Deliverables:

- Godot shader variants for existing runtime shader families,
- thrusters/tracers/impact/explosion effects,
- planet/star procedural visuals,
- fullscreen starfield/background,
- Lighting V2 parameter bridge,
- Godot shader validation/tooling plan.

Exit criteria:

- visual parity is good enough to replace the Bevy presentation path for native testing.

### Phase 7: Audio Backend

Deliverables:

- Godot audio backend consuming Rust audio events,
- music profiles,
- weapon fire,
- destruction one-shots,
- spatial listener/emitters,
- bus/settings mapping.

Exit criteria:

- native Godot audio covers current Kira-backed user-facing behavior or documents accepted fallbacks.

### Phase 8: Web/Mobile Research Track

Deliverables:

- Godot web GDExtension build spike,
- Lightyear WebTransport compatibility proof,
- asset cache storage proof,
- browser audio proof,
- panic/threading policy for web.

Exit criteria:

- explicit go/no-go for Godot web parity. Do not make web a dependency for native Godot migration.

## 16. Validation Gates

Minimum validation for the first serious Godot milestone:

- `cargo fmt --all -- --check`
- `CARGO_INCREMENTAL=0 cargo clippy --workspace --all-targets -- -D warnings`
- `CARGO_INCREMENTAL=0 cargo check --workspace`
- native Godot extension build for Linux,
- native Godot extension build/check for Windows target,
- local gateway + replication smoke test,
- login/password/TOTP flow,
- character select/world entry,
- Lightyear session ready,
- controlled entity prediction/correction,
- asset bootstrap from clean cache,
- no raw Bevy `Entity` IDs crossing Godot bridge,
- f64 positions preserved in Rust snapshots and converted only for render-local Godot coordinates,
- no Godot physics writes to authoritative/predicted motion state.

When the bridge touches shared client/runtime code, keep the existing WASM compile check policy in mind. If Godot-specific crates cannot compile for the existing WASM target, isolate them behind target-specific crates or `cfg(target_arch = "wasm32")` boundaries in accordance with the project platform branching rule.

## 17. Unity and Unreal Comparison

### 17.1 Unity

Unity supports native plug-ins through C-style native libraries called from C# scripts. Rust can be exposed to Unity through a C ABI, but that is less direct than godot-rust/GDExtension for a Rust-first client. Unity would likely push the client toward C# UI/game-layer code calling Rust through FFI. That can work, but it makes Bevy ECS embedding and rich Rust-side bridge types more awkward.

Unity advantages:

- mature editor,
- mature UI/tooling,
- broad platform support,
- strong asset pipeline.

Unity disadvantages for Sidereal:

- Rust is a native plugin boundary, not a first-class gameplay binding,
- C# would probably become the presentation/application layer,
- Bevy ECS integration would be hidden behind C ABI glue,
- less aligned with the project's Rust-heavy architecture.

Verdict: not better than Godot for retaining Rust + Bevy ECS.

### 17.2 Unreal

Unreal has strong C++ plugin and third-party library integration. It is excellent for high-end 3D, rendering, animation, and large production pipelines. Rust integration would still be through third-party libraries, C ABI, or custom C++ glue.

Unreal advantages:

- strongest high-end renderer,
- mature networking/tools if adopting Unreal patterns,
- robust C++ plugin system,
- high production ceiling.

Unreal disadvantages for Sidereal:

- heavy C++/Unreal architecture mismatch with Rust/Bevy ECS,
- overkill for current top-down 2D presentation,
- difficult to preserve Bevy ECS as a natural runtime,
- larger packaging/build/tooling burden.

Verdict: only better if Sidereal deliberately pivots to Unreal/C++ and high-end 3D production. It is not better for the stated goal.

### 17.3 Godot

Godot advantages:

- open source and lightweight,
- direct GDExtension model,
- godot-rust bindings for Godot 4,
- strong 2D/UI workflow,
- easier to treat as a presentation host around a Rust core,
- better cultural/technical fit for a Rust-heavy indie/server-authoritative client.

Godot disadvantages:

- GDExtension lifecycle/packaging complexity,
- godot-rust web support is experimental,
- shader/runtime asset pipeline must be rebuilt,
- less battle-tested than Unity/Unreal for some production workflows,
- custom Rust bridge architecture is still substantial engineering work.

Verdict: Godot is the best candidate among the three if the project wants an engine migration while preserving Rust and Bevy ECS.

## 18. Recommendation

Proceed only with a bounded native Godot spike after the current native Bevy client control/prediction stability work is in a known-good state.

The recommended technical direction is:

1. Extract a renderer-agnostic Rust client core from `bins/sidereal-client`.
2. Embed that core as a headless Bevy `App` inside a Godot Rust GDExtension.
3. Keep gateway and replication protocols unchanged.
4. Keep authoritative Lua server-side; reuse Lua registries in Rust tooling only.
5. Rebuild Godot presentation deliberately: UI first, then simple world sprites, then assets, then tactical, then advanced shaders/effects/audio.
6. Defer Godot web parity until native Godot proves the Rust/Lightyear/Bevy bridge.

The migration is feasible, but it should be treated as a major client rewrite with protocol/runtime reuse, not as an engine skin over the current Bevy client.

## 19. Sources Reviewed

Local project sources:

- `AGENTS.md`
- `Cargo.toml`
- `bins/sidereal-client/Cargo.toml`
- `bins/sidereal-client/src/runtime/app_setup.rs`
- `bins/sidereal-client/src/runtime/app_builder.rs`
- `bins/sidereal-client/src/platform/native/entry.rs`
- `bins/sidereal-client/src/platform/native/io.rs`
- `bins/sidereal-client/src/platform/wasm.rs`
- `bins/sidereal-client/src/runtime/app_state.rs`
- `bins/sidereal-client/src/runtime/auth_net.rs`
- `bins/sidereal-client/src/runtime/transport.rs`
- `bins/sidereal-client/src/runtime/input.rs`
- `bins/sidereal-client/src/runtime/motion.rs`
- `bins/sidereal-client/src/runtime/assets.rs`
- `bins/sidereal-client/src/runtime/shaders.rs`
- `bins/sidereal-client/src/runtime/plugins/`
- `crates/sidereal-net/src/lightyear_protocol/messages.rs`
- `crates/sidereal-net/src/lightyear_protocol/registration.rs`
- `crates/sidereal-scripting/src/lib.rs`
- `docs/architecture/sidereal_design_document.md`
- `docs/features/active/visibility_replication_contract.md`
- `docs/features/active/asset_delivery_contract.md`
- `docs/features/reference/scripting_support_reference.md`
- `docs/features/active/audio_runtime_contract.md`
- `docs/features/active/account_character_selection_layout_contract.md`

External technical references reviewed on 2026-05-04:

- Godot stable GDExtension overview: <https://docs.godotengine.org/en/stable/tutorials/scripting/gdextension/what_is_gdextension.html>
- Godot stable `.gdextension` file documentation: <https://docs.godotengine.org/en/stable/tutorials/scripting/gdextension/gdextension_file.html>
- Godot stable web export documentation: <https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html>
- Godot stable shader introduction: <https://docs.godotengine.org/en/stable/tutorials/shaders/introduction_to_shaders.html>
- Godot stable CanvasItem shader reference: <https://docs.godotengine.org/en/stable/tutorials/shaders/shader_reference/canvas_item_shader.html>
- godot-rust setup guide: <https://godot-rust.github.io/book/intro/setup.html>
- godot-rust web export guide: <https://godot-rust.github.io/book/toolchain/export-web.html>
- Bevy ECS crate documentation: <https://docs.rs/bevy_ecs/latest/bevy_ecs/>
- Unity native plug-ins manual: <https://docs.unity.cn/Manual/plug-ins-native.html>
- Unreal Engine third-party library integration: <https://dev.epicgames.com/documentation/en-us/unreal-engine/integrating-third-party-libraries-into-unreal-engine>
