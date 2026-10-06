import { afterEach, expect, it, vi } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { prefabById } from "@sidereal/content/prefabs";
import { getAuthoredAssetLightSources } from "../authored-asset-lighting";
import { loadDeferredExterior } from "./deferred-exteriors";
import { publishedShipAccessBytes } from "./wayfarer-access-assets";
import {
  createRemoteShipExteriors,
  resolvePublishedExterior,
  type RemoteShipSnapshot,
  type RemoteShipExteriorsOptions,
} from "./remote-exteriors";
const runtime = fileURLToPath(
  new URL("../../../../assets/runtime/", import.meta.url),
);
const engines: NullEngine[] = [];
afterEach(() => {
  for (const e of engines.splice(0)) e.dispose();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function assets() {
  const requests: string[] = [];
  let gate: Promise<void> | undefined;
  let release: (() => void) | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown) => {
      const name = String(url);
      requests.push(name);
      if (name.endsWith(".glb") && gate) await gate;
      const path = join(runtime, name.slice(8));
      if (!name.startsWith("/assets/") || !existsSync(path))
        return { ok: false };
      const b = readFileSync(path);
      return {
        ok: true,
        json: async () => JSON.parse(b.toString()),
        arrayBuffer: async () =>
          b.buffer.slice(b.byteOffset, b.byteOffset + b.length),
      };
    }),
  );
  const stub: object = new Proxy(() => stub, {
    get: (_, k) =>
      k === "then" ? undefined : k === Symbol.toPrimitive ? () => 0 : stub,
    apply: () => stub,
  });
  vi.stubGlobal(
    "OffscreenCanvas",
    class {
      constructor(
        public width: number,
        public height: number,
      ) {}
      getContext() {
        return stub;
      }
    },
  );
  return {
    requests,
    hold() {
      gate = new Promise<void>((r) => {
        release = r;
      });
    },
    release() {
      const r = release;
      gate = undefined;
      r?.();
    },
  };
}
function scene() {
  const e = new NullEngine();
  engines.push(e);
  const s = new Scene(e);
  s.useRightHandedSystem = true;
  return s;
}
const resolved = () => {
  const doc = prefabById("fed.s.wren-fleet")!;
  return resolvePublishedExterior(`prefab:${doc.id}`, BigInt(doc.revision))!;
};
it("starts without native requests, streams derivative detail and shares source banks with independent instances", async () => {
  const a = assets(),
    s = scene(),
    p = await loadDeferredExterior(s, resolved());
  expect(a.requests).toEqual([]);
  const first = p.instantiate(new TransformNode("first", s), "first"),
    second = p.instantiate(new TransformNode("second", s), "second");
  expect(first.proxy.getChildMeshes().length).toBeGreaterThan(0);
  expect(first.full.getChildMeshes()).toHaveLength(0);
  const pending = p.ensureDetail!(3);
  expect(p.ensureDetail!(3)).toBe(pending);
  expect(await pending).toBe(true);
  first.prepareIntermediate!();
  second.prepareIntermediate!();
  expect(first.intermediate!.getChildMeshes().length).toBeGreaterThan(0);
  expect(second.intermediate!.getChildMeshes().length).toBe(
    first.intermediate!.getChildMeshes().length,
  );
  expect(
    a.requests.some(
      (u) => u.includes("template-lod-r001/") && u.endsWith(".glb"),
    ),
  ).toBe(true);
  expect(
    a.requests.some(
      (u) => u.includes("template-authored-r001/") && u.endsWith(".glb"),
    ),
  ).toBe(false);
  expect(a.requests.some((u) => u.includes("prop.props_"))).toBe(false);
  expect(getAuthoredAssetLightSources(s)).toHaveLength(0);
  expect(p.sources.every((m) => m.isEnabled() && !m.isVisible)).toBe(true);
  const native = first.intermediate!.getChildMeshes();
  expect(native.every((m) => m.metadata?.remoteShipId === "first")).toBe(true);
  first.releaseIntermediate!();
  expect(first.intermediate!.getChildMeshes()).toHaveLength(0);
  expect(second.intermediate!.getChildMeshes().length).toBeGreaterThan(0);
  const material = second.proxy.getChildMeshes()[0].material;
  p.dispose();
  expect(material?.getScene()).toBe(s);
}, 30000);
it("finishes pending detail after disposal without resurrecting source geometry or light owners", async () => {
  const a = assets(),
    s = scene(),
    p = await loadDeferredExterior(s, resolved());
  a.hold();
  const pending = p.ensureDetail!(3);
  for (let i = 0; i < 200 && !a.requests.some((u) => u.endsWith(".glb")); i++)
    await new Promise((r) => setTimeout(r, 5));
  expect(a.requests.some((u) => u.endsWith(".glb"))).toBe(true);
  p.dispose();
  a.release();
  expect(await pending).toBe(false);
  expect(p.detailReady!(3)).toBe(false);
  expect(s.meshes.filter((m) => m.metadata?.authoredStudy)).toHaveLength(0);
  expect(getAuthoredAssetLightSources(s)).toHaveLength(0);
  expect(
    s.transformNodes.filter((n) => n.name.startsWith("deferred-exterior:")),
  ).toHaveLength(0);
}, 30000);
it("keeps ready full detail through a pending intermediate request and removes deleted contacts", async () => {
  const a = assets(),
    s = scene();
  const pub = resolved();
  let row: RemoteShipSnapshot = {
    epoch: 1,
    shipMotion: [{ shipId: "remote" }],
    shipDescription: [
      {
        shipId: "remote",
        publishedExteriorAssetId: `prefab:${pub.doc.id}`,
        appearanceRevision: BigInt(pub.doc.revision),
      },
    ],
  };
  const listeners = new Set<() => void>();
  const store = {
    getSnapshot: () => row,
    subscribeTable: (_: string, l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    sampleShip: () => ({ x: 0, y: 0, heading: 0 }),
  };
  const p = await loadDeferredExterior(s, pub);
  expect(await p.ensureDetail!(0)).toBe(true);
  const options: RemoteShipExteriorsOptions = {
    localShipId: () => undefined,
    accessResolver: publishedShipAccessBytes,
    load: async () => p,
  };
  const remote = createRemoteShipExteriors(s, store, options);
  await remote.settled();
  const camera = new FreeCamera("camera", new Vector3(0, 30, 30), s);
  camera.setTarget(Vector3.Zero());
  const tick = () => {
    camera.getViewMatrix(true);
    remote.update({ x: 0, y: 0 }, 0, camera, 800);
  };
  tick();
  // Native accepted access starts pending; full representation is admitted only after it settles.
  for (let i = 0; i < 300 && remote.diagnostics().ships[0].accessPending; i++) {
    await new Promise((r) => setTimeout(r, 5));
    tick();
  }
  expect(remote.diagnostics().ships[0].tier).toBe("exterior");
  camera.position.set(0, 90, 90);
  tick();
  expect(remote.diagnostics().ships[0].requestedTier).toBe(0);
  expect(remote.diagnostics().ships[0].tier).toBe("exterior");
  options.intermediateExteriors = true;
  a.hold();
  tick();
  const d = remote.diagnostics().ships[0];
  expect(d.requestedTier).toBe(3);
  expect(d.tier).toBe("exterior");
  expect(d.detailReady).toBe(false);
  row = { ...row, shipMotion: [], shipDescription: [] };
  for (const l of listeners) l();
  expect(remote.count).toBe(0);
  a.release();
  await p.ensureDetail!(3);
  tick();
  expect(remote.count).toBe(0);
  expect(s.meshes.some((m) => m.metadata?.remoteShipId === "remote")).toBe(
    false,
  );
  remote.dispose();
}, 30000);
it("keeps ready intermediate hulls during near-detail loading and applies independent accepted doors", async () => {
  const a = assets(),
    s = scene(),
    pub = resolved(),
    p = await loadDeferredExterior(s, pub);
  expect(await p.ensureDetail!(3)).toBe(true);
  const row: RemoteShipSnapshot = {
    epoch: 1,
    shipMotion: [{ shipId: "a" }, { shipId: "b" }],
    shipDescription: ["a", "b"].map((shipId) => ({
      shipId,
      publishedExteriorAssetId: `prefab:${pub.doc.id}`,
      appearanceRevision: BigInt(pub.doc.revision),
    })),
  };
  const store = {
    getSnapshot: () => row,
    subscribeTable: () => () => {},
    sampleShip: () => ({ x: 0, y: 0, heading: 0 }),
  };
  const remote = createRemoteShipExteriors(s, store, {
    localShipId: () => undefined,
    intermediateExteriors: true,
    accessResolver: publishedShipAccessBytes,
    load: async () => p,
  });
  await remote.settled();
  const camera = new FreeCamera("camera", new Vector3(0, 90, 90), s);
  camera.setTarget(Vector3.Zero());
  const logic = new Map([
    ["a", { doors: new Map([["personnel-outer", true]]), panels: new Map() }],
    ["b", { doors: new Map([["personnel-outer", false]]), panels: new Map() }],
  ]);
  const tick = () => {
    camera.getViewMatrix(true);
    remote.update({ x: 0, y: 0 }, 0, camera, 800, undefined, 100, logic);
  };
  tick();
  expect(
    remote
      .diagnostics()
      .ships.every((x) => x.tier === "proxy" && x.accessPending),
  ).toBe(true);
  for (
    let i = 0;
    i < 300 && remote.diagnostics().ships.some((x) => x.accessPending);
    i++
  ) {
    await new Promise((r) => setTimeout(r, 5));
    tick();
  }
  expect(
    remote.diagnostics().ships.every((x) => x.tier === "intermediate"),
  ).toBe(true);
  const leaf = (id: string) =>
    s
      .getTransformNodeByName(`remote-ship-${id}:access`)!
      .getChildTransformNodes(false)
      .find((n) => n.name === "access-door:personnel-outer:leaf")!;
  const before = [leaf("a").position.clone(), leaf("b").position.clone()];
  expect(Vector3.Distance(before[0], before[1])).toBeGreaterThan(0.1);
  a.hold();
  camera.position.set(0, 30, 30);
  tick();
  expect(
    remote
      .diagnostics()
      .ships.every(
        (x) =>
          x.requestedTier === 0 && x.tier === "intermediate" && !x.detailReady,
      ),
  ).toBe(true);
  const pending = p.ensureDetail!(0);
  a.release();
  expect(await pending).toBe(true);
  tick();
  expect(
    remote
      .diagnostics()
      .ships.every((x) => x.tier === "exterior" && x.detailReady),
  ).toBe(true);
  expect([leaf("a").position, leaf("b").position]).toEqual(before);
  remote.dispose();
}, 30000);
