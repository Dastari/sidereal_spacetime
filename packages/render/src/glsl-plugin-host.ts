import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import type { Material } from "@babylonjs/core/Materials/material";

type Internals = {
  _forceGLSL: boolean;
  _shaderLanguage: ShaderLanguage;
  _createUniformBuffer(): void;
};

/**
 * On WebGPU, Babylon builds PBR/standard materials in WGSL unless they were created with
 * `forceGLSL`. Our GLSL-only material plugins would then throw ("not compatible with the
 * shader language"), so their host keeps the GLSL path, which WebGPU compiles through
 * glslang + twgsl. Materials we construct pass `forceGLSL` directly; this covers materials
 * created by loaders (glTF). Must run before the material's first effect is built.
 * Covered by webgpu-shaders.test.ts, which fails if Babylon's internals change.
 */
export function glslPluginHost<T extends Material>(material: T): T {
  if (material.shaderLanguage === ShaderLanguage.GLSL) return material;
  const internals = material as unknown as Internals;
  internals._forceGLSL = true;
  internals._createUniformBuffer();
  internals._shaderLanguage = ShaderLanguage.GLSL;
  return material;
}
