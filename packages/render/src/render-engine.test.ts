import { expect, test, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { chooseRenderEngine } from "./render-engine";
import {
  createRenderBackendPreference,
  readRenderBackend,
  readWebGPUFailure,
  recordWebGPUFailure,
  resolveRenderBackend,
  RENDER_BACKEND_STORAGE_KEY,
  WEBGPU_COMPAT_REVISION,
  WEBGPU_FAILURE_STORAGE_KEY,
} from "./render-backend";

test("backend preference defaults to Auto and separates selection, active fallback and reload", () => {
  const data = new Map<string, string>(),
    storage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => {
        data.set(k, v);
      },
    };
  expect(readRenderBackend(storage)).toBe("auto");
  data.set(RENDER_BACKEND_STORAGE_KEY, "nonsense");
  expect(readRenderBackend(storage)).toBe("auto");
  // Auto rendered WebGPU; choosing WebGL2 needs a reload, returning to Auto does not.
  const pref = createRenderBackendPreference("webgpu", "auto", storage);
  pref.set("webgl");
  expect(pref.snapshot()).toMatchObject({
    requested: "webgl",
    active: "webgpu",
    reloadRequired: true,
  });
  expect(data.get(RENDER_BACKEND_STORAGE_KEY)).toBe("webgl");
  pref.set("auto");
  expect(pref.snapshot().reloadRequired).toBe(false);
  // Explicit WebGPU fell back to WebGL2 (unavailable): WebGL2 or Auto need no reload.
  const fallback = createRenderBackendPreference(
    "webgl",
    "webgpu",
    storage,
    "Unavailable",
    "webgl",
  );
  expect(fallback.snapshot().reloadRequired).toBe(false);
  fallback.set("webgl");
  expect(fallback.snapshot().reloadRequired).toBe(false);
  fallback.set("auto");
  expect(fallback.snapshot().reloadRequired).toBe(false);
  fallback.set("webgpu");
  expect(fallback.snapshot().reloadRequired).toBe(true);
});
test("a runtime WebGPU failure is remembered per compatibility revision and steers Auto to WebGL2", () => {
  const data = new Map<string, string>(),
    storage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => {
        data.set(k, v);
      },
    };
  const now = 1_000_000_000;
  expect(resolveRenderBackend("auto", readWebGPUFailure(storage, now))).toEqual(
    {
      target: "webgpu",
    },
  );
  expect(
    recordWebGPUFailure(storage, "fragment shader compilation failed", now),
  ).toBe(true);
  const failure = readWebGPUFailure(storage, now + 1000);
  expect(failure).toBe("fragment shader compilation failed");
  expect(resolveRenderBackend("auto", failure).target).toBe("webgl");
  expect(resolveRenderBackend("auto", failure).reason).toContain(
    "choose WebGPU to retry",
  );
  // An explicit choice is honoured regardless.
  expect(resolveRenderBackend("webgpu", failure).target).toBe("webgpu");
  // Expired, or recorded by a client with different WebGPU compatibility: retry WebGPU.
  expect(
    readWebGPUFailure(storage, now + 4 * 24 * 3600 * 1000),
  ).toBeUndefined();
  const stale = JSON.parse(data.get(WEBGPU_FAILURE_STORAGE_KEY)!);
  data.set(
    WEBGPU_FAILURE_STORAGE_KEY,
    JSON.stringify({ ...stale, revision: WEBGPU_COMPAT_REVISION - 1 }),
  );
  expect(readWebGPUFailure(storage, now)).toBeUndefined();
  data.set(WEBGPU_FAILURE_STORAGE_KEY, "{not json");
  expect(readWebGPUFailure(storage, now)).toBeUndefined();
  // Active WebGPU that fails: Auto now resolves to WebGL2, so a reload is offered.
  const pref = createRenderBackendPreference("webgpu", "auto", storage);
  expect(pref.snapshot().reloadRequired).toBe(false);
  pref.fail("WebGPU failed (GPU device lost).");
  expect(pref.snapshot()).toMatchObject({
    reloadRequired: true,
    reason: "WebGPU failed (GPU device lost).",
  });
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
