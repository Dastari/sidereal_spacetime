import { expect, test } from "vitest";
import { ShaderStore } from "@babylonjs/core/Engines/shaderStore";
import { guardNeutralToneMapping, TONE_MAP_GUARDS } from "./tone-map-guard";

test("clamps the pinned GLSL and WGSL neutral tone mapping exactly once", () => {
  expect(guardNeutralToneMapping()).toBe(true);
  expect(guardNeutralToneMapping()).toBe(true);
  for (const { store, from, to } of TONE_MAP_GUARDS) {
    const source = store.imageProcessingFunctions;
    expect(source.split(to)).toHaveLength(2);
    expect(source).not.toContain(from);
  }
  expect(ShaderStore.IncludesShadersStore.imageProcessingFunctions).toContain(
    "result.rgb=toGammaSpace(result.rgb)",
  );
});

test("reports a changed upstream shader instead of silently skipping it", () => {
  const { store, to } = TONE_MAP_GUARDS[0];
  const patched = store.imageProcessingFunctions;
  store.imageProcessingFunctions = patched.replace(to, "result.rgb=other();");
  try {
    expect(guardNeutralToneMapping()).toBe(false);
  } finally {
    store.imageProcessingFunctions = patched;
  }
});
