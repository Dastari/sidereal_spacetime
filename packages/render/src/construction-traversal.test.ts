import { readFileSync } from "node:fs";
import { afterEach, expect, test, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { NativeTraversalAudit } from "@sidereal/content/construction-traversal";
import {
  loadConstructionTraversal,
  type ConstructionTraversalRenderInput,
} from "./construction-traversal";
const base =
  "assets/art-library/designs/shipyard.structure.traversal-ladder/revisions/r000/a003/";
const audit = JSON.parse(
  readFileSync(base + "traversal-audit.json", "utf8"),
) as NativeTraversalAudit;
const delivery = JSON.parse(readFileSync(base + "delivery.json", "utf8")) as {
  sources: Record<string, { path: string; sha256: string }>;
};
function setup() {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const parent = new TransformNode("room-a", scene);
  const input: ConstructionTraversalRenderInput = {
    instanceId: "room-a",
    selectedDeckId: "lower-a",
    lowerDeckId: "lower-a",
    upperDeckId: "upper-a",
    installation: audit.parts.map((p) => ({
      ...p,
      id: "actual:" + p.id,
      sourcePartId: p.id,
      sha256: delivery.sources[p.sourceId].sha256,
    })),
    sources: Object.fromEntries(
      Object.entries(delivery.sources).map(([name, pin]) => [
        name,
        { url: "/native/" + name + ".glb", sha256: pin.sha256 },
      ]),
    ),
  };
  const fetcher = vi.fn(async (url: string) => {
    const source = url.slice("/native/".length, -4);
    const bytes = readFileSync(delivery.sources[source].path);
    return {
      ok: true,
      arrayBuffer: async () =>
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ),
    };
  });
  vi.stubGlobal("fetch", fetcher);
  return {
    engine,
    scene,
    parent,
    input,
    fetcher,
    dispose() {
      scene.dispose();
      engine.dispose();
    },
  };
}
afterEach(() => vi.unstubAllGlobals());

test("all 28 exact native placements load from three checked GLBs with shared geometry and unchanged material/transform binds", async () => {
  const s = setup();
  try {
    s.parent.position.set(12, 2, -9);
    s.parent.rotation.y = Math.PI / 2;
    const result = await loadConstructionTraversal(s.scene, s.parent, s.input);
    expect(s.fetcher).toHaveBeenCalledTimes(3);
    expect(result.placements.map((p) => p.node.metadata.partId)).toEqual(
      s.input.installation.map((p) => p.id),
    );
    expect(result.placements).toHaveLength(28);
    for (const placement of result.placements) {
      expect(placement.meshes.length).toBeGreaterThan(0);
      for (const mesh of placement.meshes) {
        expect(mesh.isPickable).toBe(false);
        const source = s.scene.meshes.find(
          (m) =>
            m !== mesh &&
            m.geometry === mesh.geometry &&
            m.name.startsWith(mesh.metadata.nativeNodePrefix),
        );
        expect(source).toBeTruthy();
        expect(mesh.material).toBe(source!.material);
        expect(mesh.material!.backFaceCulling).toBe(true);
        const bind = mesh
          .computeWorldMatrix(true)
          .multiply(Matrix.Invert(placement.node.computeWorldMatrix(true)));
        bind
          .asArray()
          .forEach((v, i) =>
            expect(v).toBeCloseTo(
              source!.computeWorldMatrix(true).asArray()[i],
              5,
            ),
          );
      }
    }
    const lower = result.placements.filter(
      (p) => p.node.metadata.traversalRole === "lower-floor",
    );
    const upper = result.placements.filter(
      (p) => p.node.metadata.traversalRole === "upper-floor",
    );
    const roof = result.placements.filter(
      (p) => p.node.metadata.traversalRole === "lower-roof",
    );
    expect(lower).toHaveLength(9);
    expect(upper).toHaveLength(8);
    expect(roof).toHaveLength(8);
    expect(lower[0].meshes[0].geometry).toBe(upper[0].meshes[0].geometry);
    expect(upper.every((p) => p.node.position.y === 3.1875)).toBe(true);
    expect(roof.every((p) => p.node.position.y === 3)).toBe(true);
    expect(
      upper.some((p) => p.node.position.x === 2 && p.node.position.z === -2),
    ).toBe(false);
    expect(
      roof.some((p) => p.node.position.x === 2 && p.node.position.z === -2),
    ).toBe(false);
    expect(
      lower.some((p) => p.node.position.x === 2 && p.node.position.z === -2),
    ).toBe(true);
    result.dispose();
    result.dispose();
    expect(s.scene.meshes).toHaveLength(0);
    expect(s.scene.transformNodes).toEqual([s.parent]);
  } finally {
    s.dispose();
  }
});

test("selected-deck and transit cutaway expose the accepted path without changing any placed transforms", async () => {
  const s = setup();
  try {
    const result = await loadConstructionTraversal(s.scene, s.parent, s.input);
    const visible = (role: string) =>
      result.placements
        .filter((p) => p.node.metadata.traversalRole === role)
        .every((p) => p.node.isEnabled());
    const matrices = result.placements.map((p) => [
      ...p.node.computeWorldMatrix(true).asArray(),
    ]);
    expect(result.walkingElevation).toBe(0.1875);
    expect(visible("lower-floor")).toBe(true);
    expect(visible("ladder")).toBe(true);
    expect(visible("upper-floor")).toBe(false);
    expect(visible("lower-roof")).toBe(false);
    expect(visible("guard")).toBe(false);
    result.setTraversal({ selectedDeckId: "lower-a", inTransit: true });
    expect(visible("guard")).toBe(true);
    expect(visible("edge")).toBe(true);
    expect(visible("upper-floor")).toBe(false);
    expect(visible("lower-roof")).toBe(false);
    result.setTraversal({ selectedDeckId: "upper-a", inTransit: false });
    expect(result.walkingElevation).toBe(3.375);
    expect(result.placements.every((p) => p.node.isEnabled())).toBe(true);
    result.setTraversal({ selectedDeckId: "upper-a", inTransit: true });
    expect(visible("upper-floor")).toBe(false);
    expect(visible("ladder")).toBe(true);
    result.setView(new Vector3(10, 8, -10), false);
    expect(visible("upper-floor")).toBe(false);
    expect(visible("ladder")).toBe(true);
    result.setTraversal({ selectedDeckId: "upper-a", inTransit: false });
    expect(result.placements.every((p) => p.node.isEnabled())).toBe(true);
    result.setTraversal({ selectedDeckId: "upper-a", inTransit: true });
    expect(() =>
      result.setTraversal({ selectedDeckId: "foreign", inTransit: false }),
    ).toThrow(/presentation/);
    result.setView(new Vector3(10, 8, -10), true);
    expect(visible("upper-floor")).toBe(false);
    result.placements.forEach((p, i) =>
      expect([...p.node.computeWorldMatrix(true).asArray()]).toEqual(
        matrices[i],
      ),
    );
    result.dispose();
  } finally {
    s.dispose();
  }
});

test("changed source bytes, incomplete installs and missing selectors fail and clean imported resources", async () => {
  const s = setup();
  try {
    await expect(
      loadConstructionTraversal(s.scene, s.parent, {
        ...s.input,
        installation: s.input.installation.slice(1),
      }),
    ).rejects.toThrow(/exhaustive/);
    await expect(
      loadConstructionTraversal(s.scene, s.parent, {
        ...s.input,
        selectedDeckId: "foreign",
      }),
    ).rejects.toThrow(/deck/);
    vi.stubGlobal("fetch", async () => ({
      ok: true,
      arrayBuffer: async () => new Uint8Array([0]).buffer,
    }));
    await expect(
      loadConstructionTraversal(s.scene, s.parent, s.input),
    ).rejects.toThrow(/hash/);
    expect(s.scene.meshes).toHaveLength(0);
    vi.stubGlobal("fetch", s.fetcher);
    const invalid = structuredClone(s.input);
    invalid.installation[1].nodePrefix += "-absent";
    await expect(
      loadConstructionTraversal(s.scene, s.parent, invalid),
    ).rejects.toThrow(/selector/);
    expect(s.scene.meshes).toHaveLength(0);
    expect(s.scene.transformNodes).toEqual([s.parent]);
  } finally {
    s.dispose();
  }
});

test("accepted own traversal coordinates and occupied deck update one loaded fixture; absent or foreign state clears the override", async () => {
  const s = setup();
  try {
    const result = await loadConstructionTraversal(s.scene, s.parent, s.input);
    const accepted = {
      instanceId: "room-a",
      x: 3,
      y: 2.5,
      z: 1.625,
      phase: "transit",
      sourceDeckId: "lower-a",
      destinationDeckId: "upper-a",
    };
    const meshCount = s.scene.meshes.length;
    const midway = result.applyAcceptedTraversal("lower-a", accepted);
    expect(midway).toMatchObject({
      selectedDeckId: "lower-a",
      inTransit: true,
      walkingElevation: 0.1875,
      acceptedPositionM: [3, 2.5, 1.625],
    });
    const returning = result.applyAcceptedTraversal("lower-a", {
      ...accepted,
      phase: "returning",
      z: 0.75,
    });
    expect(returning.acceptedPositionM).toEqual([3, 2.5, 0.75]);
    const blocked = result.applyAcceptedTraversal("lower-a", {
      ...accepted,
      phase: "blocked",
    });
    expect(blocked.acceptedPositionM).toEqual([3, 2.5, 1.625]);
    for (const invalid of [
      null,
      undefined,
      { ...accepted, instanceId: "foreign" },
      { ...accepted, z: NaN },
      { ...accepted, sourceDeckId: "foreign" },
      { ...accepted, destinationDeckId: "lower-a" },
    ]) {
      const clear = result.applyAcceptedTraversal("lower-a", invalid);
      expect(clear.inTransit).toBe(false);
      expect(clear.acceptedPositionM).toBeUndefined();
    }
    const arrived = result.applyAcceptedTraversal("upper-a", null);
    expect(arrived).toMatchObject({
      selectedDeckId: "upper-a",
      inTransit: false,
      walkingElevation: 3.375,
    });
    expect(result.walkingElevation).toBe(3.375);
    expect(result.placements.every((p) => p.node.isEnabled())).toBe(true);
    expect(s.scene.meshes).toHaveLength(meshCount);
    expect(s.fetcher).toHaveBeenCalledTimes(3);
    result.dispose();
  } finally {
    s.dispose();
  }
});

test("normal construction loader delegates the native two-deck fixture and keeps it loaded across occupied-deck updates", async () => {
  const { createNativeTraversalRoomDocument, nativeTraversalRoomInstallation } =
    await import("@sidereal/sim/construction-traversal-document");
  const { NATIVE_TRAVERSAL_ROOM_SOURCES } =
    await import("@sidereal/content/construction-traversal-room");
  const { loadConstructionInstance } = await import("./construction-instance");
  const document = createNativeTraversalRoomDocument();
  const native = nativeTraversalRoomInstallation(document, 1n, 1n);
  const s = setup();
  try {
    const fetcher = vi.fn(async (url: string) => {
      const id = Object.entries(NATIVE_TRAVERSAL_ROOM_SOURCES).find(
        ([, source]) => source.url === url,
      )?.[0];
      if (!id) throw Error("Unexpected duplicate legacy asset fetch " + url);
      const bytes = readFileSync(delivery.sources[id].path);
      return {
        ok: true,
        arrayBuffer: async () =>
          bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          ),
      };
    });
    vi.stubGlobal("fetch", fetcher);
    const result = await loadConstructionInstance(s.scene, s.parent, {
      instanceId: document.layout.id,
      deckId: native.lower.deckId,
      documentJson: JSON.stringify(document),
    });
    expect(result.placements.map((p) => p.node.metadata.partId)).toEqual(
      native.parts.map((p) => p.id),
    );
    expect(result.placements).toHaveLength(28);
    expect(fetcher).toHaveBeenCalledTimes(3);
    if (!("applyAcceptedTraversal" in result))
      throw Error("Native traversal adapter was not selected");
    result.applyAcceptedTraversal(native.upper.deckId, null);
    expect(result.walkingElevation).toBe(3.375);
    expect(fetcher).toHaveBeenCalledTimes(3);
    result.dispose();
    expect(s.scene.meshes).toHaveLength(0);
  } finally {
    s.dispose();
  }
});
