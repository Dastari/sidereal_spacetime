import { readFileSync } from "node:fs";
import { afterEach, expect, test, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { NATIVE_STAIR_ROOM_DELIVERY } from "@sidereal/content/construction-stairs-room";
import {
  createNativeStairRoomDocument,
  nativeStairRoomInstallation,
} from "@sidereal/sim/construction-stairs-document";
import {
  loadNativeStairScene,
  loadNativeStairConstruction,
  loadNativeStairEgress,
  resolveNativeStairFrame,
  type NativeStairRenderInput,
} from "./native-stair-scene";
function setup() {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const parent = new TransformNode("native-stair-test", scene);
  const d = createNativeStairRoomDocument(),
    native = nativeStairRoomInstallation(d, 1n, 1n);
  const input: NativeStairRenderInput = {
    instanceId: d.layout.id,
    visitId: "visit-a",
    selectedDeckId: native.lowerDeckId,
    lowerDeckId: native.lowerDeckId,
    upperDeckId: native.upperDeckId,
    installation: native.parts,
    sources: Object.fromEntries(
      Object.entries(NATIVE_STAIR_ROOM_DELIVERY.sources).map(([id, p]) => [
        id,
        { url: "/native/" + id + ".glb", sha256: p.sha256 },
      ]),
    ),
  };
  const fetcher = vi.fn(async (url: string) => {
    const id = url.slice("/native/".length, -4),
      p =
        NATIVE_STAIR_ROOM_DELIVERY.sources[
          id as keyof typeof NATIVE_STAIR_ROOM_DELIVERY.sources
        ],
      b = readFileSync(p.path);
    return {
      ok: true,
      arrayBuffer: async () =>
        b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
    };
  });
  vi.stubGlobal("fetch", fetcher);
  return {
    engine,
    scene,
    parent,
    input,
    fetcher,
    dispose: () => {
      scene.dispose();
      engine.dispose();
    },
  };
}
afterEach(() => vi.unstubAllGlobals());

test("loads exact60 authored placements from3 source GLBs and preserves native materials/shared geometry/world transforms", async () => {
  const f = setup();
  try {
    f.parent.position.set(9, 2, -5);
    f.parent.rotation.y = Math.PI / 2;
    const r = await loadNativeStairScene(f.scene, f.parent, f.input);
    expect(f.fetcher).toHaveBeenCalledTimes(3);
    expect(r.placements).toHaveLength(60);
    expect(r.cameraFrame).toEqual({ centerX: 4, centerY: 5, halfExtent: 5 });
    for (const p of r.placements) {
      expect(p.meshes.length).toBeGreaterThan(0);
      for (const m of p.meshes) {
        const original = f.scene.meshes.find(
          (o) =>
            o !== m &&
            o.geometry === m.geometry &&
            o.name.startsWith(m.metadata.nativeNodePrefix),
        );
        expect(original).toBeTruthy();
        expect(m.material).toBe(original!.material);
        expect(m.isPickable).toBe(false);
        expect(m.receiveShadows).toBe(true);
        const bind = m
          .computeWorldMatrix(true)
          .multiply(Matrix.Invert(p.node.computeWorldMatrix(true)));
        bind
          .asArray()
          .forEach((v, i) =>
            expect(v).toBeCloseTo(
              original!.computeWorldMatrix(true).asArray()[i],
              5,
            ),
          );
      }
    }
    expect(
      r.placements.filter((p) => p.node.metadata.stairRole === "lower-floor"),
    ).toHaveLength(20);
    const upper = r.placements.filter(
        (p) => p.node.metadata.stairRole === "upper-floor",
      ),
      roofs = r.placements.filter(
        (p) => p.node.metadata.stairRole === "lower-roof",
      );
    expect(upper).toHaveLength(16);
    expect(roofs).toHaveLength(16);
    for (const p of [...upper, ...roofs])
      expect(
        [2, 4].includes(p.node.position.x) &&
          [-4, -6].includes(p.node.position.z),
      ).toBe(false);
    expect(upper.every((p) => p.node.position.y === 3.1875)).toBe(true);
    expect(roofs.every((p) => p.node.position.y === 3)).toBe(true);
    r.dispose();
    r.dispose();
    expect(f.scene.meshes).toHaveLength(0);
    expect(f.scene.transformNodes).toEqual([f.parent]);
  } finally {
    f.dispose();
  }
});

test("cutaway keeps both flights/guards and actual upper landing visible through accepted stair motion", async () => {
  const f = setup();
  try {
    const r = await loadNativeStairScene(f.scene, f.parent, f.input),
      part = (id: string) =>
        r.placements.find((p) => p.node.metadata.sourcePartId === id)!.node;
    const before = r.placements.map((p) => [
      ...p.node.computeWorldMatrix(true).asArray(),
    ]);
    expect(part("upper-floor-4-2").isEnabled()).toBe(true);
    expect(part("upper-floor-0-0").isEnabled()).toBe(false);
    expect(part("stair-enclosure").isEnabled()).toBe(false);
    const accepted = {
      instanceId: f.input.instanceId,
      visitId: "visit-a",
      x: 3,
      y: 6.5,
      z: 1.875,
      phase: "walking",
      sourceDeckId: f.input.lowerDeckId,
    };
    const frame = r.applyAcceptedStair(f.input.lowerDeckId, accepted);
    expect(frame.acceptedPositionM).toEqual([3, 6.5, 1.875]);
    for (const id of [
      "stair-flight-a",
      "stair-flight-b",
      "stair-guard",
      "stair-upper-guard",
      "stair-midlanding",
      "upper-floor-4-2",
    ])
      expect(part(id).isEnabled()).toBe(true);
    expect(part("lower-roof-0-0").isEnabled()).toBe(false);
    r.applyAcceptedStair(f.input.upperDeckId, null);
    expect(r.walkingElevation).toBe(3.375);
    expect(part("upper-floor-0-0").isEnabled()).toBe(true);
    r.setView(new Vector3(1, 2, 3), false);
    expect(part("stair-enclosure").isEnabled()).toBe(true);
    r.placements.forEach((p, i) =>
      expect([...p.node.computeWorldMatrix(true).asArray()]).toEqual(before[i]),
    );
    r.dispose();
  } finally {
    f.dispose();
  }
});

test.each(["instance", "visit", "phase", "position", "deck"] as const)(
  "rejects stale/wrong accepted %s without moving geometry",
  (kind) => {
    const fixture = {
        instanceId: "i",
        visitId: "v",
        selectedDeckId: "lower",
        lowerDeckId: "lower",
        upperDeckId: "upper",
      },
      state = {
        instanceId: "i",
        visitId: "v",
        phase: "stepping",
        sourceDeckId: "lower",
        x: 3,
        y: 4,
        z: 0.7,
      };
    if (kind === "instance") state.instanceId = "other";
    if (kind === "visit") state.visitId = "old";
    if (kind === "phase") state.phase = "exited";
    if (kind === "position") state.z = NaN;
    if (kind === "deck") state.sourceDeckId = "unknown";
    expect(
      resolveNativeStairFrame(fixture, "lower", state).acceptedPositionM,
    ).toBeUndefined();
  },
);

test.each(["transform", "selector", "missing", "duplicate", "hash"] as const)(
  "rejects changed native %s before GPU loading",
  async (kind) => {
    const f = setup();
    try {
      const parts = f.input.installation.map((p) => ({
        ...p,
        originM: [...p.originM] as [number, number, number],
      }));
      if (kind === "transform") parts[0].originM[0]++;
      if (kind === "selector") parts[0].nodePrefix += "wrong";
      if (kind === "missing") parts.pop();
      if (kind === "duplicate") parts[1].id = parts[0].id;
      if (kind === "hash") parts[0].sha256 = "0".repeat(64);
      await expect(
        loadNativeStairScene(f.scene, f.parent, {
          ...f.input,
          installation: parts,
        }),
      ).rejects.toThrow();
      expect(f.scene.meshes).toHaveLength(0);
    } finally {
      f.dispose();
    }
  },
);

test("rejects corrupt complete source bytes and leaves no scene resource leak", async () => {
  const f = setup();
  try {
    vi.stubGlobal("fetch", async () => ({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    }));
    await expect(
      loadNativeStairScene(f.scene, f.parent, f.input),
    ).rejects.toThrow("hash");
    expect(f.scene.meshes).toHaveLength(0);
  } finally {
    f.dispose();
  }
});

test("construction loader uses installed runtime bytes through validated stair dispatch", async () => {
  const f = setup();
  try {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        expect(url.startsWith("/assets/construction/stairs-r000-a003/")).toBe(
          true,
        );
        const bytes = readFileSync(
          "assets/runtime/" + url.slice("/assets/".length),
        );
        return {
          ok: true,
          arrayBuffer: async () =>
            bytes.buffer.slice(
              bytes.byteOffset,
              bytes.byteOffset + bytes.byteLength,
            ),
        };
      }),
    );
    const d = createNativeStairRoomDocument();
    const result = await loadNativeStairConstruction(f.scene, f.parent, {
      instanceId: d.layout.id,
      documentJson: JSON.stringify(d),
      deckId: d.stairRoom.upperDeckId,
      visitId: "actual-visit",
    });
    expect(result).toBeDefined();
    expect(result!.placements).toHaveLength(60);
    expect(result!.walkingElevation).toBe(3.375);
    result!.dispose();
    expect(f.scene.meshes).toHaveLength(0);
  } finally {
    f.dispose();
  }
});

test("construction dispatch preserves non-stair loaders and rejects an invalid native document", async () => {
  const f = setup();
  try {
    expect(
      await loadNativeStairConstruction(f.scene, f.parent, {
        instanceId: "other",
        documentJson: "{}",
        deckId: "other",
      }),
    ).toBeUndefined();
    const d = createNativeStairRoomDocument();
    await expect(
      loadNativeStairConstruction(f.scene, f.parent, {
        instanceId: "wrong",
        documentJson: JSON.stringify(d),
        deckId: d.stairRoom.lowerDeckId,
      }),
    ).rejects.toThrow("mismatch");
    d.layout.decks[1].elevation++;
    await expect(
      loadNativeStairConstruction(f.scene, f.parent, {
        instanceId: d.layout.id,
        documentJson: JSON.stringify(d),
        deckId: d.stairRoom.lowerDeckId,
      }),
    ).rejects.toThrow();
    expect(f.fetcher).not.toHaveBeenCalled();
  } finally {
    f.dispose();
  }
});

test("minimum egress pin loads only stair kit and two landings without an instance document", async () => {
  const f = setup();
  try {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const b = readFileSync(
          "assets/runtime/" + url.slice("/assets/".length),
        );
        return {
          ok: true,
          arrayBuffer: async () =>
            b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
        };
      }),
    );
    const r = await loadNativeStairEgress(f.scene, f.parent, {
      characterId: "actor",
      instanceId: "i",
      stairId: "s",
      visitId: "v",
      lowerDeckId: "l",
      upperDeckId: "u",
      sourceDeckId: "l",
      adapterId: NATIVE_STAIR_ROOM_DELIVERY.adapterId,
      adapterRevision: NATIVE_STAIR_ROOM_DELIVERY.revision,
      auditSha256: NATIVE_STAIR_ROOM_DELIVERY.auditSha256,
      proofHash: "a".repeat(64),
    });
    expect(r.placements).toHaveLength(10);
    expect(
      new Set(r.placements.map((p) => p.node.metadata.nativeSource)),
    ).toEqual(new Set(["floor", "stair-kit"]));
    expect(
      r.placements.every((p) => p.node.metadata.egressPresentationOnly),
    ).toBe(true);
    expect(
      r.placements.every((p) => p.meshes.every((m) => !m.isPickable)),
    ).toBe(true);
    expect(
      r.placements
        .filter((p) => p.node.metadata.nativeSource === "floor")
        .map((p) => p.node.metadata.sourcePartId)
        .sort(),
    ).toEqual(["lower-floor-2-2", "upper-floor-4-2"]);
    r.dispose();
  } finally {
    f.dispose();
  }
});
