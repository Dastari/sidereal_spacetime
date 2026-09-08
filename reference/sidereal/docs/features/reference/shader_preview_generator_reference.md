# Shader Preview Generator

Status: Reference
Lifecycle: active-reference
Category: feature
Last updated: 2026-06-04
Owners: feature owners
Scope: Shader Preview Generator.
Source of truth: no
Supersedes: n/a
Superseded by: n/a
Primary references:
- n/a

## 0. Implementation Status

2026-05-24: `scripts/render_space_backdrop_preview.mjs` renders the canonical
fullscreen space backdrop stack to a PNG using the same native
`sidereal-shader-preview-render` binary used by the dashboard software fallback.
The path is presentation-only. It does not run client ECS, does not affect
authoritative gameplay state, and has no replication, persistence, transport, or
WASM authority impact.

## 1. What It Does

The preview generator renders the current repo WGSL files for the default space
backdrop stack:

- `data/shaders/space_background_base.wgsl`
- `data/shaders/space_background_nebula.wgsl`
- `data/shaders/starfield.wgsl`

It sends those layers to `sidereal-shader-preview-render`, which creates an
offscreen `wgpu` render target, draws each layer in stack order, reads back the
pixels, and writes a PNG. This is useful for quick shader iteration on hosts
without browser WebGPU or a physical GPU, as long as a software adapter such as
llvmpipe or lavapipe is available.

The preview uses the same WGSL source files as the game and dashboard preview,
but it is not a full game-client capture. In-game output can still differ if a
development world has persisted old shader component values, if the runtime has
different viewport/time/camera uniforms, or if streamed cache contents are stale.

## 2. Quick Start

From the workspace root:

```bash
node scripts/render_space_backdrop_preview.mjs
```

The default output path is:

```text
tmp/space-backdrop-preview.png
```

To choose an output file and resolution:

```bash
node scripts/render_space_backdrop_preview.mjs tmp/space-backdrop-1680x945.png 1680 945
```

The script prints JSON with the output path, dimensions, backend, and render
timings:

```json
{
  "outputPath": "/root/sidereal/tmp/space-backdrop-1680x945.png",
  "width": 1680,
  "height": 945,
  "backend": "llvmpipe (LLVM 20.1.8, 256 bits) (Vulkan)",
  "metrics": {
    "compileMs": 28.09,
    "pipelineMs": 81.58,
    "renderMs": 412.8,
    "readbackMs": 1.56,
    "encodeMs": 339.94,
    "totalMs": 901.59
  }
}
```

In Codex sessions, use `view_image` on the generated PNG path for immediate
visual inspection.

## 3. Prerequisites

The script needs:

- Node.js for `scripts/render_space_backdrop_preview.mjs`.
- Rust/Cargo for the native renderer.
- A `wgpu` adapter. A physical GPU works, but Mesa software adapters such as
  llvmpipe/lavapipe are sufficient for this preview path.

If `target/debug/sidereal-shader-preview-render` is missing, the script builds
it automatically with:

```bash
cargo build -p sidereal-shader-preview --bin sidereal-shader-preview-render
```

To use a prebuilt renderer binary:

```bash
SIDEREAL_SHADER_PREVIEW_RENDERER=/path/to/sidereal-shader-preview-render \
  node scripts/render_space_backdrop_preview.mjs tmp/space-backdrop.png 1680 945
```

To restrict `wgpu` backend selection:

```bash
SIDEREAL_SHADER_PREVIEW_BACKENDS=vulkan \
  node scripts/render_space_backdrop_preview.mjs tmp/space-backdrop.png 1680 945
```

Supported backend tokens are parsed by
`crates/sidereal-shader-preview/src/native.rs` and include `all`, `vulkan`,
`gl`, `metal`, `dx12`, and `noop`.

## 4. Uniform Behavior

The renderer extracts uniform declarations from WGSL, packs them by binding, and
applies fallback runtime defaults from `crates/sidereal-shader-preview/src/native.rs`.
Resolution uniforms such as `viewport_time`, `resolution_time`,
`viewport_size`, and `resolution` are patched to the requested PNG dimensions.

For the preview to stay close to game output, keep these sources aligned:

- Runtime component defaults in `crates/sidereal-game/src/components/`.
- Runtime material packing in `bins/sidereal-client/src/runtime/backdrop/materials.rs`.
- Preview fallback defaults in `crates/sidereal-shader-preview/src/native.rs`.
- Lua asset registry schemas and presets in `data/scripts/assets/registry.lua`.

If the generated PNG looks correct but the game does not, first check whether
the running world has persisted old `SpaceBackgroundShaderSettings` or
`StarfieldShaderSettings` values.

## 5. Troubleshooting

If the renderer reports WGSL diagnostics, fix the shader compile issue first.
Diagnostics are prefixed with the layer label, for example `space background
nebula`.

If the renderer cannot create an adapter on a VM, verify Mesa software Vulkan or
OpenGL drivers are installed and try `SIDEREAL_SHADER_PREVIEW_BACKENDS=vulkan`
or `SIDEREAL_SHADER_PREVIEW_BACKENDS=gl`.

If the output is black or missing layers, confirm the canonical shader files
exist under `data/shaders/` and that the layer shader still uses supported
bindings. The preview renderer supports uniforms, textures, and samplers needed
by the current stack, but it is not a general Bevy render-graph emulator.

If the preview and dashboard differ, compare dimensions first. The dashboard
sets preview resolution from the canvas size; this script uses the width and
height passed on the command line.
