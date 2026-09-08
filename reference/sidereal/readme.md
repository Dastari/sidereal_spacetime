# sidereal

Status: Active
Lifecycle: active-reference
Category: root
Last updated: 2026-06-04
Owners: project
Scope: sidereal.
Source of truth: no
Supersedes: n/a
Superseded by: n/a
Primary references:
- n/a

Sidereal is a server-authoritative multiplayer space RPG built around:

- deterministic fixed-step simulation,
- capability-driven Bevy ECS gameplay,
- persistent world state,
- smooth client prediction/interpolation for responsive control.

## What This Repo Currently Contains

Sidereal is a server-authoritative multiplayer game rebuild with:

1. Bevy 0.18 client/runtime code,
2. Lightyear-based networking and client prediction/interpolation,
3. Postgres + AGE-backed persistence,
4. Lua-authored content direction for assets, rendering, and scripting-connected systems.

Primary services/workspace areas:

1. `bins/sidereal-client`
2. `bins/sidereal-gateway`
3. `bins/sidereal-replication`
4. `crates/sidereal-game`
5. `crates/engine-asset-runtime`

## Quick Start

## Environment Setup

Ubuntu/Debian hosts can install the required toolchains and native dependencies with:

```bash
scripts/siderealctl setup-environment
```

This setup target installs the packages Sidereal needed on this machine:

```bash
apt-get install -y \
  build-essential pkg-config curl git \
  mingw-w64 gcc-mingw-w64-x86-64 g++-mingw-w64-x86-64 \
  cmake ninja-build perl make \
  docker.io docker-compose-v2 \
  libwayland-dev libxkbcommon-dev libxkbcommon-x11-0 \
  libasound2-dev libudev-dev \
  libx11-dev libxcursor-dev libxi-dev libxrandr-dev \
  libxxf86vm-dev libgl1-mesa-dev
```

It also installs and configures the Rust-side dependencies:

```bash
rustup toolchain install stable
rustup default stable
rustup target add x86_64-pc-windows-gnu wasm32-unknown-unknown
rustup component add rustfmt clippy
scripts/siderealctl setup-wasm-bindgen
```

`setup-environment` replaces a mismatched `wasm-bindgen-cli` version so its
binary schema stays aligned with the version locked by the workspace.

For dashboard builds, ensure `pnpm` is available as well:

```bash
npm install -g pnpm
```

And it writes the Windows GNU linker configuration required for cross-builds:

```toml
[target.x86_64-pc-windows-gnu]
linker = "x86_64-w64-mingw32-gcc"
```

If you prefer to install things manually instead of using `scripts/siderealctl setup-environment`, use the commands above, then verify the main targets:

```bash
cargo check -p sidereal-client --target x86_64-pc-windows-gnu
cargo check -p sidereal-client --target wasm32-unknown-unknown --features bevy/webgpu
scripts/siderealctl build-wasm
```

Everything runs through one tool, `scripts/siderealctl` (`siderealctl --help`): build/quality/db tasks (`fmt`, `test`, `pg-up`, `publish-client-windows`, …) and service stacks (`up <profile>`, `status`, `restart`/`logs`/`stop`/`down`; `siderealctl profiles` lists profiles). Per-service env is defined once in `dev.toml`. See DR-0043.

1. Start database:

```bash
scripts/siderealctl pg-up
```

2. Run core services (persistence + replication + gateway, detached + tracked):

```bash
scripts/siderealctl up single-shard-debug
```

3. (Optional) Run the native client too:

```bash
scripts/siderealctl up dev-stack-client
```

Then `scripts/siderealctl status` shows what is running; `scripts/siderealctl logs <service>` tails one; `scripts/siderealctl down` stops the stack. (Multi-shard remains `make dev-stack-multi` until siderealctl gains multi-shard profiles.)

## Documentation Map

1. Architecture baseline: `docs/architecture/sidereal_design_document.md`
2. Implementation tracker: `docs/architecture/implementation_checklist.md`
3. Decision register: `docs/decision_register.md`
4. Documentation index: `docs/README.md`
5. Active feature contracts/references: `docs/features/`
6. Decision detail docs: `docs/decisions/`
7. Plans and migration docs: `docs/plans/`
8. Audit reports: `docs/reports/`

## Useful Commands

```bash
scripts/siderealctl --help        # all tasks + service stacks
scripts/siderealctl pg-reset                     # destructive: resets local postgres volume
scripts/siderealctl profiles      # available dev stacks
scripts/siderealctl status        # what is currently running
```
