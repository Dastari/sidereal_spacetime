import { expect, test, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { chooseRenderEngine } from "./render-engine";
import {
  createRenderBackendPreference,
  readRenderBackend,
  RENDER_BACKEND_STORAGE_KEY,
} from "./render-backend";

test("backend preference defaults to WebGL and separates selection, active fallback and reload", () => {
  const data = new Map<string, string>(),
    storage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => {
        data.set(k, v);
      },
    };
  expect(readRenderBackend(storage)).toBe("webgl");
  const pref = createRenderBackendPreference("webgl", "webgl", storage);
  pref.set("webgpu");
  expect(pref.snapshot()).toMatchObject({
    requested: "webgpu",
    active: "webgl",
    reloadRequired: true,
  });
  expect(data.get(RENDER_BACKEND_STORAGE_KEY)).toBe("webgpu");
  const fallback = createRenderBackendPreference(
    "webgl",
    readRenderBackend(storage),
    storage,
    "Unavailable",
  );
  expect(fallback.snapshot().reloadRequired).toBe(false);
  fallback.set("webgl");
  expect(fallback.snapshot().reloadRequired).toBe(false);
});
test("engine selection loads WebGPU only on request and falls back without retaining a failed engine", async () => {
  const engine = new NullEngine(),
    webgpu = vi.fn(async () => undefined),
    webgl = vi.fn(() => engine);
  const defaults = await chooseRenderEngine("webgl", { webgl, webgpu });
  expect(webgpu).not.toHaveBeenCalled();
  expect(defaults.engine).toBe(engine);
  const fallback = await chooseRenderEngine("webgpu", { webgl, webgpu });
  expect(fallback.active).toBe("webgl");
  const scene = new Scene(fallback.engine!);
  expect(scene.getEngine()).toBe(engine);
  const selected = await chooseRenderEngine("webgpu", {
    webgl,
    webgpu: async () => engine,
  });
  expect(selected.active).toBe("webgpu");
  const locked = await chooseRenderEngine("webgpu", {
    webgpu: async () => {
      throw Error("device failed");
    },
    webgl: () => {
      throw Error("context locked");
    },
  });
  expect(locked).toMatchObject({
    engine: undefined,
    reloadWithWebGL: true,
    active: "webgl",
  });
  scene.dispose();
  engine.dispose();
});
