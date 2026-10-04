/**
 * Z-fighting and orientation regressions for the prefab ship the game draws (owner feedback on the
 * first Wren release, 2026-09-28). Builds the real ship view with the published runtime GLBs
 * (assets/runtime, served to a NullEngine through a fetch stub) and inspects the world-space
 * triangles every visible mesh would draw.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { prefabById } from "@sidereal/content/prefabs";
import {
  readShipPrefab,
  type ShipPrefabDocumentV1,
} from "@sidereal/content/ship-prefab";
import {
  defaultPrefabComponentCatalog,
  prefabComponentCatalogAt,
} from "@sidereal/content/ship-prefab-catalog";
import {
  createLegacyPrefabShipView as createPrefabShipView,
  type PrefabShipView,
} from "./ship-view";
import { findCoplanarOverlaps, type TriangleSource } from "./coplanar";

const repo = fileURLToPath(new URL("../../../..", import.meta.url));
const runtime = join(repo, "assets/runtime");
/** Git LFS pointers (a checkout without `git lfs pull`) are not GLBs; skip rather than test stand-ins. */
const published = (() => {
  const probe = join(runtime, "ship-components/r004/ion-drive.sm.glb");
  return (
    existsSync(probe) &&
    readFileSync(probe).subarray(0, 4).toString("latin1") === "glTF"
  );
})();
/** Frozen Wren revisions still flown by live instances until an operator upgrades them. */
const legacyWren = (revision: 2 | 3) =>
  readShipPrefab(
    JSON.parse(
      readFileSync(
        join(
          repo,
          `packages/world/src/fixtures/fed-s-wren-r${revision}.prefab.json`,
        ),
        "utf8",
      ),
    ),
  );
/** Wren revision 2, the ship the first release assigned (legacy live instances). */
const LEGACY_WREN = legacyWren(2);
/** Wren revision 3 (11 x 6 m, four small ion drives), live until the r4 in-place upgrade. */
const LEGACY_WREN_R3 = legacyWren(3);

const engines: NullEngine[] = [];
afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
  vi.unstubAllGlobals();
});

/** Serve `/assets/...` from assets/runtime (the published runtime tree the client loads). */
function stubAssets() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const path = join(runtime, String(url).replace(/^\/assets\//, ""));
      if (!String(url).startsWith("/assets/") || !existsSync(path))
        return { ok: false };
      const bytes = readFileSync(path);
      return {
        ok: true,
        json: async () => JSON.parse(bytes.toString("utf8")),
        arrayBuffer: async () =>
          bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length),
      };
    }),
  );
  const stub: object = new Proxy(() => stub, {
    get: (_t, key) =>
      key === "then" ? undefined : key === Symbol.toPrimitive ? () => 0 : stub,
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
}

async function view(
  doc: ShipPrefabDocumentV1,
  catalog = defaultPrefabComponentCatalog(),
  batch = true,
) {
  stubAssets();
  const engine = new NullEngine();
  engines.push(engine);
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  return createPrefabShipView(scene, doc, { catalog, view: "deck", batch });
}

/** Visible opaque geometry, one source per mesh and thin instance, in world space. */
function visibleSources(v: PrefabShipView): TriangleSource[] {
  return meshSources(v.root.getChildMeshes());
}

function meshSources(meshes: readonly unknown[]): TriangleSource[] {
  const out: TriangleSource[] = [];
  for (const m of meshes) {
    if (!(m instanceof Mesh) || !m.isEnabled() || !m.getTotalIndices())
      continue;
    // Labels, light pools, plumes and contact shadows are intended overlays (depth-write off).
    if ((m.metadata as { role?: string } | null)?.role === "effect") continue;
    if (m.name.includes(":decal")) continue;
    const local = m.getVerticesData(VertexBuffer.PositionKind)!;
    const world = m.computeWorldMatrix(true);
    const matrices: Matrix[] = m.hasThinInstances
      ? m.thinInstanceGetWorldMatrices().map((d) => d.multiply(world))
      : [world];
    matrices.forEach((mat, i) => {
      const positions = new Float32Array(local.length);
      const p = new Vector3();
      for (let k = 0; k < local.length; k += 3) {
        Vector3.TransformCoordinatesFromFloatsToRef(
          local[k],
          local[k + 1],
          local[k + 2],
          mat,
          p,
        );
        positions.set([p.x, p.y, p.z], k);
      }
      out.push({
        source: matrices.length > 1 ? `${m.name}#${i}` : m.name,
        positions,
        indices: m.getIndices()!,
        material: m.material?.name,
      });
    });
  }
  return out;
}

const describeGlb = published ? describe : describe.skip;

describeGlb("prefab ship presentation (published GLBs)", () => {
  for (const [label, doc, catalog] of [
    ["Wren r4", prefabById("fed.s.wren")!, defaultPrefabComponentCatalog()],
    ["Wren r3 (live legacy)", LEGACY_WREN_R3, prefabComponentCatalogAt(2)],
    ["Wren r2 (live legacy)", LEGACY_WREN, prefabComponentCatalogAt(1)],
  ] as const)
    it(
      `${label}: no exposed coplanar faces of different materials in deck or flight view`,
      { timeout: 120_000 },
      async () => {
        const v = await view(doc, catalog);
        for (const presentation of ["deck", "flight"] as const) {
          v.setView(presentation);
          const found = findCoplanarOverlaps(visibleSources(v));
          expect(
            found.map(
              (f) =>
                `${f.a} <> ${f.b} ${f.area.toFixed(3)} m2 @ ${f.at.map((c) => c.toFixed(2))}`,
            ),
            presentation,
          ).toEqual([]);
        }
      },
    );

  it(
    "the helm seat faces the bow: the pilot sits aft of the screens",
    {
      timeout: 120_000,
    },
    async () => {
      // Unbatched, so the helm console's primitives stay separate meshes.
      const v = await view(
        prefabById("fed.s.wren")!,
        defaultPrefabComponentCatalog(),
        false,
      );
      const centre = (suffix: string) => {
        const m = v.root
          .getChildMeshes()
          .find(
            (x): x is Mesh =>
              x instanceof Mesh &&
              x.name.endsWith(`console.navigation.sm.glb:${suffix}`),
          );
        expect(m, suffix).toBeTruthy();
        const P = meshSources([m])[0].positions;
        let z = 0;
        for (let k = 2; k < P.length; k += 3) z += P[k];
        return z / (P.length / 3);
      };
      // Babylon ship frame: game +Y (fore) is Babylon -Z. The seat post (metal) and seat back must
      // be aft (+Z) of the upper screen (emit_b), so a seated pilot looks toward the bow.
      const seat = centre("slot4_metal");
      const screen = centre("slot7_emit_b");
      expect(seat).toBeGreaterThan(screen + 0.2);
    },
  );
});
