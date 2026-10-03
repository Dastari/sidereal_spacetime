import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { prefabById } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import { loadAuthoredStudy } from "./wayfarer-authored-study";
import { createWayfarerLiveView } from "./wayfarer-live-view";

// Actual view lifecycle with deterministic mesh imports. Source byte/geometry admission
// is independently exercised against every shipped GLB by content and loader tests.
vi.mock("./wayfarer-authored-study", async (original) => {
  const actual = await original<typeof import("./wayfarer-authored-study")>();
  return {
    ...actual,
    loadAuthoredStudy: vi.fn(
      async (
        ...[scene, pieces, instances, , , , options]: Parameters<
          typeof actual.loadAuthoredStudy
        >
      ) => {
        const regions = new Set(options?.batchRegions?.values());
        const meshes = [...regions].map((region) => {
          const mesh = new Mesh(region, scene),
            material = new PBRMaterial(region, scene);
          material.emissiveColor = Color3.FromHexString("#2288cc");
          mesh.material = material;
          mesh.metadata = { authoredStudy: { receiverRegion: region } };
          return mesh;
        });
        let disposed = false;
        return {
          meshes,
          report: {
            pieces: pieces.length,
            instances: instances.length,
            importedPrimitives: 0,
            uniqueTriangles: 0,
            placedTriangles: 0,
            batches: meshes.length,
            vertexBufferBytes: 0,
            ownedImportedTextures: 0,
            materialPolicy: [],
            placementRanges: [],
            presentationOnly: true,
          },
          dispose() {
            for (const mesh of meshes) mesh.dispose(false, true);
            disposed = true;
          },
          get disposed() {
            return disposed;
          },
        };
      },
    ),
  };
});
const engines: NullEngine[] = [];
afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
  vi.unstubAllGlobals();
  vi.mocked(loadAuthoredStudy).mockClear();
});
function setup() {
  const engine = new NullEngine();
  engines.push(engine);
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const data = readFileSync(
        new URL(
          `../../../../assets/runtime/${url.replace("/assets/", "")}`,
          import.meta.url,
        ),
      );
      return {
        ok: true,
        arrayBuffer: async () => Uint8Array.from(data).buffer,
      };
    }),
  );
  return scene;
}
it("switches whole cohorts, room fixtures and emissive admission together, then restores the deck", async () => {
  const scene = setup(),
    view = await createWayfarerLiveView(scene, prefabById("fed.m.wayfarer")!, {
      catalog: defaultPrefabComponentCatalog(),
      view: "deck",
    });
  expect(vi.mocked(loadAuthoredStudy)).toHaveBeenCalledTimes(2);
  const [deck, flight] = vi
    .mocked(loadAuthoredStudy)
    .mock.results.map((r) => r.value);
  const deckBank = await deck,
    flightBank = await flight;
  expect(deckBank.meshes.every((mesh: Mesh) => mesh.isEnabled())).toBe(true);
  expect(flightBank.meshes.every((mesh: Mesh) => !mesh.isEnabled())).toBe(true);
  const fixtures = scene.lights.filter((light) =>
    light.name.startsWith("wayfarer:"),
  );
  expect(fixtures).toHaveLength(8);
  const originalDeckRevision = view.metrics().visualRevision;
  view.setView("flight");
  expect(deckBank.meshes.every((mesh: Mesh) => !mesh.isEnabled())).toBe(true);
  expect(flightBank.meshes.every((mesh: Mesh) => mesh.isEnabled())).toBe(true);
  expect(fixtures.every((light) => !light.isEnabled())).toBe(true);
  expect(view.emissiveMeshes()).toEqual(flightBank.meshes);
  expect(view.metrics().visualRevision).toBe("wayfarer-dorsal-r001-live");
  view.setView("deck");
  expect(view.metrics().visualRevision).toBe(originalDeckRevision);
  expect(view.emissiveMeshes()).toEqual(deckBank.meshes);
  expect(fixtures.every((light) => light.isEnabled())).toBe(true);
  view.dispose();
  expect(deckBank.disposed && flightBank.disposed).toBe(true);
  expect(scene.lights.some((light) => light.name.startsWith("wayfarer:"))).toBe(
    false,
  );
});
it("remote ships load only the closed exterior and cannot reveal private rooms", async () => {
  const scene = setup(),
    view = await createWayfarerLiveView(scene, prefabById("fed.m.wayfarer")!, {
      catalog: defaultPrefabComponentCatalog(),
      view: "deck",
      exteriorOnly: true,
    });
  expect(vi.mocked(loadAuthoredStudy)).toHaveBeenCalledTimes(1);
  const input = vi.mocked(loadAuthoredStudy).mock.calls[0];
  expect(
    input[2].some((row) => row.role === "room-content" || row.role === "floor"),
  ).toBe(false);
  expect(input[2].filter((row) => row.object.startsWith("RCS_"))).toHaveLength(
    4,
  );
  view.setView("deck");
  expect(view.root.getChildMeshes().every((mesh) => mesh.isEnabled())).toBe(
    true,
  );
  expect(scene.lights.some((light) => light.name.startsWith("wayfarer:"))).toBe(
    false,
  );
  view.dispose();
});
it("cleans the completed deck import if its dorsal bank fails to load", async () => {
  const scene = setup();
  vi.mocked(loadAuthoredStudy)
    .mockImplementationOnce(
      vi.mocked(loadAuthoredStudy).getMockImplementation()!,
    )
    .mockRejectedValueOnce(Error("stopped import"));
  await expect(
    createWayfarerLiveView(scene, prefabById("fed.m.wayfarer")!, {
      catalog: defaultPrefabComponentCatalog(),
      view: "deck",
    }),
  ).rejects.toThrow("stopped import");
  expect(
    (await vi.mocked(loadAuthoredStudy).mock.results[0].value).disposed,
  ).toBe(true);
  expect(
    scene.transformNodes.some((node) => node.name.startsWith("prefab-ship:")),
  ).toBe(false);
});
