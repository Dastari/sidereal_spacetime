/**
 * Test-only harness: runs Babylon's real WebGPUEngine shader path in Node without a GPU.
 *
 * The engine processes every effect exactly as in the browser (WebGPUShaderProcessorGLSL,
 * WebGPU global defines, #version 450) and compiles it with the pinned glslang and twgsl
 * wasm builds from @babylonjs/core. Only the GPUDevice is a recording stub, so rendering is
 * never exercised; shader failures are captured with their full source and compiler log.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { runInNewContext } from "node:vm";
import { WebGPUEngine } from "@babylonjs/core/Engines/webgpuEngine";
import "@babylonjs/core/Engines/WebGPU/Extensions/engine.multiRender";

export interface ShaderFailure {
  stage: string;
  log: string;
  source: string;
}
export interface WebGPUShaderHarness {
  engine: WebGPUEngine;
  failures: ShaderFailure[];
  /** WGSL modules handed to the stub device (native WGSL, or GLSL after twgsl). */
  modules: string[];
  /** GLSL stages compiled by glslang. */
  glslStages: { count: number };
  dispose(): void;
}

const babylonAssets = join(
  dirname(
    createRequire(import.meta.url).resolve("@babylonjs/core/package.json"),
  ),
  "assets",
);

type Emscripten = (wasmPath: string) => Promise<Record<string, unknown>>;
/** The loaders are browser UMD scripts; evaluate them as CommonJS and serve the wasm bytes. */
function loadCompiler(name: "glslang" | "twgsl", log: (line: string) => void) {
  const module: { exports: unknown } = { exports: {} };
  const wasm = readFileSync(join(babylonAssets, name, `${name}.wasm`));
  const quiet = { log, warn: log, error: log, info: log, debug: log };
  runInNewContext(
    readFileSync(join(babylonAssets, name, `${name}.js`), "utf8"),
    {
      module,
      exports: module.exports,
      console: quiet,
      fetch: async () =>
        new Response(wasm, { headers: { "content-type": "application/wasm" } }),
      WebAssembly,
      Response,
      TextDecoder,
      TextEncoder,
      performance,
      setTimeout,
      clearTimeout,
    },
    { filename: `${name}.js` },
  );
  return (module.exports as Emscripten)(`${name}.wasm`);
}

const LIMITS: Record<string, number> = {
  maxTextureDimension1D: 8192,
  maxTextureDimension2D: 8192,
  maxTextureDimension3D: 2048,
  maxTextureArrayLayers: 256,
  maxBindGroups: 4,
  maxBindingsPerBindGroup: 1000,
  maxDynamicUniformBuffersPerPipelineLayout: 8,
  maxDynamicStorageBuffersPerPipelineLayout: 4,
  maxSampledTexturesPerShaderStage: 16,
  maxSamplersPerShaderStage: 16,
  maxStorageBuffersPerShaderStage: 8,
  maxStorageTexturesPerShaderStage: 4,
  // The browser default; the engine clamps light counts against it like on real devices.
  maxUniformBuffersPerShaderStage: 12,
  maxUniformBufferBindingSize: 65536,
  maxStorageBufferBindingSize: 134217728,
  minUniformBufferOffsetAlignment: 256,
  minStorageBufferOffsetAlignment: 256,
  maxVertexBuffers: 8,
  maxBufferSize: 268435456,
  maxVertexAttributes: 16,
  maxVertexBufferArrayStride: 2048,
  maxInterStageShaderVariables: 16,
  maxColorAttachments: 8,
  maxColorAttachmentBytesPerSample: 32,
  maxComputeWorkgroupStorageSize: 16384,
  maxComputeInvocationsPerWorkgroup: 256,
  maxComputeWorkgroupSizeX: 256,
  maxComputeWorkgroupSizeY: 256,
  maxComputeWorkgroupSizeZ: 64,
  maxComputeWorkgroupsPerDimension: 65535,
};

const PLACEHOLDER = {
  vertex: "#version 450\nvoid main(){gl_Position=vec4(0.);}",
  fragment:
    "#version 450\nlayout(location=0) out vec4 color;void main(){color=vec4(0.);}",
};

/** A permissive GPU object: every method returns another stub, never a thenable. */
function stub(overrides: Record<PropertyKey, unknown> = {}): unknown {
  const target = function () {} as unknown as Record<PropertyKey, unknown>;
  return new Proxy(target, {
    get(_t, key) {
      if (key in overrides) return overrides[key];
      if (key === "then" || typeof key === "symbol") return undefined;
      return () => stub();
    },
    set: () => true,
    apply: () => stub(),
  });
}

function stubDevice(modules: string[]) {
  const buffer = (d: { size?: number }) =>
    stub({
      size: d?.size ?? 0,
      getMappedRange: () => new ArrayBuffer(d?.size ?? 0),
      mapAsync: () => Promise.resolve(),
    });
  return stub({
    limits: LIMITS,
    features: new Set<string>(),
    lost: new Promise(() => {}),
    queue: stub(),
    addEventListener: () => {},
    createBuffer: buffer,
    createShaderModule: (d: { code: string }) => {
      modules.push(d.code);
      return stub({
        getCompilationInfo: () => Promise.resolve({ messages: [] }),
      });
    },
    popErrorScope: () => Promise.resolve(null),
    createRenderPipelineAsync: () => Promise.resolve(stub()),
  });
}

/** Creates a real WebGPUEngine over a stub device with the bundled compilers. */
export async function createWebGPUShaderHarness(): Promise<WebGPUShaderHarness> {
  const failures: ShaderFailure[] = [];
  const modules: string[] = [];
  const glslStages = { count: 0 };
  let compilerLog: string[] = [];
  const log = (line: string) => compilerLog.push(line);
  const [glslang, twgsl] = await Promise.all([
    loadCompiler("glslang", log),
    loadCompiler("twgsl", log),
  ]);
  const device = stubDevice(modules);
  const adapter = stub({
    features: new Set<string>(),
    limits: LIMITS,
    info: { vendor: "sidereal-test", architecture: "stub" },
    requestDevice: () => Promise.resolve(device),
  });
  const gpu = {
    requestAdapter: () => Promise.resolve(adapter),
    getPreferredCanvasFormat: () => "bgra8unorm",
    wgslLanguageFeatures: new Set<string>(),
  };
  const previousNavigator = Object.getOwnPropertyDescriptor(
    globalThis,
    "navigator",
  );
  Object.defineProperty(globalThis, "navigator", {
    value: { gpu, userAgent: "node" },
    configurable: true,
    writable: true,
  });
  const canvas = stub({
    width: 640,
    height: 360,
    clientWidth: 640,
    clientHeight: 360,
    style: {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 360 }),
    getContext: () =>
      stub({ getCurrentTexture: () => stub({ width: 640, height: 360 }) }),
  }) as HTMLCanvasElement;
  const engine = new WebGPUEngine(canvas, {
    antialias: true,
    stencil: true,
    useLargeWorldRendering: true,
  });
  // Babylon expects a pending glslang instance and a resolved twgsl instance.
  const convert = twgsl.convertSpirV2WGSL as (
    code: Uint32Array,
    noUniformity: boolean,
  ) => string;
  const tint = {
    convertSpirV2WGSL(code: Uint32Array, noUniformity: boolean) {
      compilerLog = [];
      const wgsl = convert(code, noUniformity);
      if (!wgsl?.includes("fn main"))
        failures.push({
          stage: "twgsl",
          source: wgsl ?? "",
          log: compilerLog.join("\n"),
        });
      return wgsl;
    },
  };
  await engine.initAsync(
    { glslang: Promise.resolve(glslang) } as never,
    { twgsl: tint } as never,
  );
  const internals = engine as unknown as {
    _compileRawShaderToSpirV(source: string, stage: string): unknown;
  };
  const compile = internals._compileRawShaderToSpirV.bind(engine);
  internals._compileRawShaderToSpirV = (source, stage) => {
    compilerLog = [];
    glslStages.count++;
    try {
      return compile(source, stage);
    } catch (error) {
      failures.push({
        stage,
        source,
        log: compilerLog.join("\n") || String(error),
      });
      // Record and continue with a trivial module so Babylon's async pipeline does not
      // reject unobserved; the failure list is what the tests assert on.
      return compile(
        PLACEHOLDER[stage === "vertex" ? "vertex" : "fragment"],
        stage,
      );
    }
  };
  return {
    engine,
    failures,
    modules,
    glslStages,
    dispose() {
      engine.dispose();
      if (previousNavigator)
        Object.defineProperty(globalThis, "navigator", previousNavigator);
      else delete (globalThis as { navigator?: unknown }).navigator;
    },
  };
}

/** Numbered source with the glslang log, for readable test failures. */
export function describeShaderFailure(failure: ShaderFailure) {
  const lines = failure.source.split("\n");
  const at = /ERROR: 0:(\d+):/.exec(failure.log);
  const line = at ? Number(at[1]) : 0;
  const context = lines
    .map(
      (text, i) =>
        `${String(i + 1).padStart(4)}${i + 1 === line ? ">" : " "} ${text}`,
    )
    .slice(Math.max(0, line - 6), line ? line + 3 : 40)
    .join("\n");
  return `${failure.stage} shader:\n${failure.log}\n${context}`;
}
