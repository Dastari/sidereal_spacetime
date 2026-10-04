import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import {
  SHIP_ACCESS_DOOR_PACK,
  type ShipAccessDoorPiece,
} from "@sidereal/content/ship-access-doors";
import { prefabById } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import { prefabDoorSpecs } from "./doors";
import {
  accessDoorMatrix,
  accessDoorPlacements,
  loadAuthoredAccessDoors,
} from "./authored-access-doors";

const read = (piece: ShipAccessDoorPiece) =>
  Promise.resolve(
    new Uint8Array(
      readFileSync(
        new URL(
          `../../../../assets/runtime/ship-access/r002/${piece.file}`,
          import.meta.url,
        ),
      ),
    ),
  );
const place = {
  id: "cargo",
  variant: "cargo.4m" as const,
  center: [2, 3] as [number, number],
  normal: [1, 0] as [number, number],
  floorM: 0.1875,
};
function scene() {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  return {
    scene,
    root: new TransformNode("root", scene),
    dispose: () => engine.dispose(),
  };
}

describe("authored access door pack", () => {
  it("keeps every exported byte pin, dimensions and native material identity", () => {
    expect(SHIP_ACCESS_DOOR_PACK.schema).toBe("sidereal.ship-access-doors/v1");
    expect(SHIP_ACCESS_DOOR_PACK.revision).toBe("ship-access-r002");
    for (const variant of SHIP_ACCESS_DOOR_PACK.variants) {
      for (const value of [
        variant.spanM,
        variant.clearWidthM,
        variant.clearHeightM,
        variant.outerHeightM,
        variant.depthM,
        variant.strokeM,
        variant.requiresPocketReservationM,
      ]) {
        expect(Number.isFinite(value) && value > 0).toBe(true);
      }
      expect(variant.clearWidthM).toBeLessThanOrEqual(variant.spanM);
      expect(variant.clearHeightM).toBeLessThanOrEqual(variant.outerHeightM);
    }
    for (const piece of SHIP_ACCESS_DOOR_PACK.pieces) {
      const data = readFileSync(
        new URL(
          `../../../../assets/runtime/ship-access/r002/${piece.file}`,
          import.meta.url,
        ),
      );
      expect(createHash("sha256").update(data).digest("hex")).toBe(
        piece.sha256,
      );
      const doc = JSON.parse(
        data.subarray(20, 20 + data.readUInt32LE(12)).toString(),
      );
      expect(
        doc.materials.every(
          (m: { name: string }) => m.name in SHIP_ACCESS_DOOR_PACK.palette,
        ),
      ).toBe(true);
      expect(
        doc.meshes.reduce(
          (n: number, m: { primitives: { indices: number }[] }) =>
            n +
            m.primitives.reduce(
              (s, p) => s + doc.accessors[p.indices].count / 3,
              0,
            ),
          0,
        ),
      ).toBe(piece.triangles);
    }
    for (const variant of SHIP_ACCESS_DOOR_PACK.variants) {
      const partIds =
        variant.motion === "single-sliding"
          ? [variant.parts.leaf]
          : [variant.parts.left, variant.parts.right];
      for (const [index, id] of partIds.entries()) {
        const leaf = SHIP_ACCESS_DOOR_PACK.pieces.find((p) => p.id === id)!;
        if (index === 0) {
          expect(leaf.boundsMax[0] - variant.strokeM).toBeLessThanOrEqual(
            -variant.clearWidthM / 2,
          );
          expect(leaf.boundsMin[0]).toBeCloseTo(-variant.clearWidthM / 2);
        } else {
          expect(leaf.boundsMin[0] + variant.strokeM).toBeGreaterThanOrEqual(
            variant.clearWidthM / 2,
          );
          expect(leaf.boundsMax[0]).toBeCloseTo(variant.clearWidthM / 2);
        }
      }
    }
  });
  it("proves aperture dimensions from exported vertices after native node transforms", async () => {
    const env = scene();
    try {
      for (const piece of SHIP_ACCESS_DOOR_PACK.pieces) {
        const container = await LoadAssetContainerAsync(
          await read(piece),
          env.scene,
          { pluginExtension: ".glb" },
        );
        const minimum = [Infinity, Infinity, Infinity];
        const maximum = [-Infinity, -Infinity, -Infinity];
        for (const mesh of container.meshes) {
          if (!mesh.getTotalVertices()) continue;
          mesh.computeWorldMatrix(true);
          for (const vertex of mesh.getBoundingInfo().boundingBox
            .vectorsWorld) {
            const author = [vertex.x, -vertex.z, vertex.y];
            author.forEach((value, axis) => {
              minimum[axis] = Math.min(minimum[axis], value);
              maximum[axis] = Math.max(maximum[axis], value);
            });
          }
        }
        for (let axis = 0; axis < 3; axis++) {
          expect(minimum[axis]).toBeCloseTo(piece.boundsMin[axis], 4);
          expect(maximum[axis]).toBeCloseTo(piece.boundsMax[axis], 4);
        }
        container.dispose();
      }
    } finally {
      env.dispose();
    }
  });
  it("uses the game frame with positive determinant in every orientation", () => {
    for (const normal of [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
    ] as [number, number][]) {
      const matrix = accessDoorMatrix({ ...place, normal });
      expect(matrix.determinant()).toBeCloseTo(1);
      const origin = Vector3.TransformCoordinates(Vector3.Zero(), matrix);
      expect(origin.asArray()).toEqual([2, 0.1875, -3]);
      const into = Vector3.TransformNormal(new Vector3(0, 0, 1), matrix);
      expect(into.asArray()).toEqual([-normal[0] + 0, 0, normal[1] + 0]);
    }
    expect(() => accessDoorMatrix({ ...place, normal: [0, 0] })).toThrow();
    for (const bad of [
      { center: [2], normal: [1] },
      { center: [2, 3, 4] },
      { normal: [1, 0, 0] },
      { center: [NaN, 3] },
      { floorM: Infinity },
    ])
      expect(() =>
        accessDoorMatrix({ ...place, ...bad } as typeof place),
      ).toThrow();
  });
  it("maps existing personnel and cargo apertures without mislabeling all EVA entries airlocks", () => {
    const placements = accessDoorPlacements(
      prefabDoorSpecs(
        prefabById("fed.m.crest")!,
        defaultPrefabComponentCatalog(),
      ),
    );
    expect(placements.find((p) => p.id === "lock")?.variant).toBe("personnel");
    expect(placements.find((p) => p.id === "cargo-door")?.variant).toBe(
      "cargo.2m",
    );
  });
  it("fails closed on missing state, isolates IDs, honours a locked command and disposes clones", async () => {
    const env = scene();
    const doors = await loadAuthoredAccessDoors(
      env.scene,
      env.root,
      [place, { ...place, id: "other", center: [8, 3] }],
      { fetchBytes: read },
    );
    const inputs = new Map([["cargo", { open: true }]]);
    doors.update(inputs, 0.7);
    expect(doors.states()).toEqual([
      { id: "cargo", open: 1 },
      { id: "other", open: 0 },
    ]);
    expect(inputs.get("cargo")).toEqual({ open: true });
    doors.update(new Map([["cargo", { open: true, locked: true }]]), 0.7);
    expect(doors.states()[0].open).toBe(0);
    doors.update(inputs, 0.7);
    doors.update(undefined, 0);
    expect(doors.states().every((d) => d.open === 0)).toBe(true);
    const meshes = doors.meshes();
    doors.dispose();
    doors.dispose();
    expect(meshes.every((m) => m.isDisposed())).toBe(true);
    env.dispose();
  });
  it("animates one personnel seal independently of split cargo leaves", async () => {
    const env = scene();
    try {
      const doors = await loadAuthoredAccessDoors(
        env.scene,
        env.root,
        [{ ...place, id: "eva", variant: "personnel" }, place],
        { fetchBytes: read },
      );
      const parts = new Set(
        doors
          .meshes()
          .filter((m) => m.metadata?.authoredAccessDoor?.id === "eva")
          .map((m) => m.metadata.authoredAccessDoor.part),
      );
      expect([...parts].sort()).toEqual(["frame", "leaf"]);
      doors.update(new Map([["eva", { open: true }]]), 0.7);
      expect(doors.states()).toEqual([
        { id: "eva", open: 1 },
        { id: "cargo", open: 0 },
      ]);
      const leaves = env.root
        .getDescendants()
        .filter((n) => n.name === "access-door:eva:leaf");
      expect(leaves).toHaveLength(1);
      expect((leaves[0] as TransformNode).position.x).toBeCloseTo(-1.225);
      doors.update(new Map([["eva", { open: true, locked: true }]]), 0.7);
      expect(doors.states()[0].open).toBe(0);
      doors.dispose();
    } finally {
      env.dispose();
    }
  });
  it("rejects scaled and reflected ancestors before fetching source bytes", async () => {
    const env = scene();
    let reads = 0;
    const fetchBytes = async (url: ShipAccessDoorPiece) => {
      reads++;
      return read(url);
    };
    try {
      for (const scale of [
        new Vector3(2, 1, 1),
        new Vector3(-1, 1, 1),
        new Vector3(2, 0.5, 1),
      ]) {
        env.root.scaling.copyFrom(scale);
        await expect(
          loadAuthoredAccessDoors(env.scene, env.root, [place], { fetchBytes }),
        ).rejects.toThrow("rigid");
      }
      expect(reads).toBe(0);
    } finally {
      env.dispose();
    }
  });
  it("requires explicit proposal bytes and never fetches a default HTTP path", async () => {
    const env = scene();
    const implicitFetch = vi.fn(() =>
      Promise.reject(Error("Implicit fetch forbidden")),
    );
    vi.stubGlobal("fetch", implicitFetch);
    try {
      await expect(
        loadAuthoredAccessDoors(
          env.scene,
          env.root,
          [place],
          undefined as never,
        ),
      ).rejects.toThrow("explicit byte resolver");
      const doors = await loadAuthoredAccessDoors(
        env.scene,
        env.root,
        [place],
        { fetchBytes: read },
      );
      expect(implicitFetch).not.toHaveBeenCalled();
      doors.dispose();
    } finally {
      vi.unstubAllGlobals();
      env.dispose();
    }
  });
  it("prevents resolver metadata tampering and rejects different bytes against the captured pin", async () => {
    const env = scene();
    const before = JSON.stringify(SHIP_ACCESS_DOOR_PACK);
    const substituted = SHIP_ACCESS_DOOR_PACK.pieces.find(
      (p) => p.id === "personnel.leaf",
    )!;
    const bytes = await read(substituted);
    const mutated: boolean[] = [];
    try {
      await expect(
        loadAuthoredAccessDoors(env.scene, env.root, [place], {
          fetchBytes: async (piece) => {
            mutated.push(Reflect.set(piece, "sha256", substituted.sha256));
            mutated.push(Reflect.set(piece.boundsMin, "0", NaN));
            mutated.push(Reflect.set(piece.boundsMax, "0", Infinity));
            await Promise.resolve();
            return bytes;
          },
        }),
      ).rejects.toThrow("hash mismatch");
      expect(mutated.length).toBeGreaterThan(0);
      expect(mutated.every((result) => !result)).toBe(true);
      expect(JSON.stringify(SHIP_ACCESS_DOOR_PACK)).toBe(before);
      expect(env.root.getChildMeshes()).toEqual([]);
    } finally {
      env.dispose();
    }
  });
  it("rejects changed bytes before importing an untrusted asset and cleans partial loads", async () => {
    const env = scene();
    await expect(
      loadAuthoredAccessDoors(env.scene, env.root, [place], {
        fetchBytes: async (url) => {
          const data = await read(url);
          data[data.length - 1] ^= 1;
          return data;
        },
      }),
    ).rejects.toThrow();
    expect(env.root.getChildMeshes()).toEqual([]);
    env.dispose();
  });
});
