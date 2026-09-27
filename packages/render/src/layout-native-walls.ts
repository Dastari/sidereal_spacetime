import type { Scene } from "@babylonjs/core/scene";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Quaternion } from "@babylonjs/core/Maths/math.vector";
import "@babylonjs/loaders/glTF";
import {
  CONSTRUCTION_BOUNDARY_FAMILY_INTERFACES as kit,
  CONSTRUCTION_BOUNDARY_FAMILY_URL,
  CONSTRUCTION_BOUNDARY_FAMILY_GLB_SHA,
} from "@sidereal/content/construction-boundary-family";
import { transformPoint, type Point } from "@sidereal/content/ship-layout";
import { constructionHash } from "@sidereal/sim/construction-transactions";
import { onSegment } from "@sidereal/sim/layout-geometry";
import type { LayoutStructuralGuide } from "./layout-structural-guides";
import { registerReferencedSceneMaterial } from "./scene-material-registration";

export const LAYOUT_NATIVE_WALL_DATUM = Object.freeze({
  revision: "r004",
  floorTopM: kit.floorTopUnits / 32,
  wallTopM: kit.wallTopUnits / 32,
  coreThicknessM: kit.coreThicknessM,
  decorativeEnvelopeM: kit.decorativeEnvelopeWidthM,
  alignment: "centered-on-boundary" as const,
});
export interface LayoutNativeWallPlacement {
  key: string;
  partId: string;
  originUnits: Point;
  quarterTurns: number;
  kind: "node" | "span";
}
export interface LayoutNativeWallPlan {
  placements: LayoutNativeWallPlacement[];
  issues: { key: string; message: string }[];
  elevationUnits: number;
  deckId: string;
  /** Native fit preview never certifies arbitrary sealing, collision or publication. */
  fitApproved: false;
}
const pkey = (p: readonly number[]) => p.join(",");
const equal = (a: readonly number[], b: readonly number[]) =>
  pkey(a) === pkey(b);
function primitive(a: Point): Point {
  let x = Math.abs(a[0]),
    y = Math.abs(a[1]);
  while (y) [x, y] = [y, x % y];
  return [a[0] / x, a[1] / x];
}
const raysKey = (rays: readonly Point[]) => rays.map(pkey).sort().join(";");
const sorted = (a: Point, b: Point) => a[0] - b[0] || a[1] - b[1];

/** Place only exact native profiles. The authoring preview admits valid portions
 * of an unfinished draft while identifying gaps; it is deliberately NOT the
 * authoritative all-or-nothing family installation adapter. */
export function planLayoutNativeWalls(
  input?: LayoutStructuralGuide,
): LayoutNativeWallPlan {
  const plan: LayoutNativeWallPlan = {
    placements: [],
    issues: [],
    elevationUnits: input?.elevationUnits ?? 0,
    deckId: input?.deckId ?? "",
    fitApproved: false,
  };
  if (!input) return plan;
  const walls = input.walls.filter((w) => w.deckId === input.deckId);
  if (walls.some((w) => w.treatment)) {
    plan.issues.push({
      key: "treatment-family",
      message:
        "Boundary treatments require their qualified native family; legacy r004 cannot represent this design.",
    });
    return plan;
  }
  if (!walls.length) return plan;
  const issue = (key: string, message: string) =>
    plan.issues.push({ key, message });
  if (!Number.isFinite(input.elevationUnits) || walls.length > 1024) {
    issue(
      "invalid",
      "Native wall preview requires finite elevation and at most 1024 wall spans.",
    );
    return plan;
  }
  if (input.heightUnits !== kit.wallTopUnits)
    issue(
      "height",
      `Native walls retain their authored ${kit.wallTopUnits / 32} m top; this deck requests ${input.heightUnits / 32} m. Height fit is unqualified.`,
    );
  if (walls.some((w) => w.source === "perimeter"))
    issue(
      "exterior-alignment",
      "Native r004 walls straddle the floor boundary. The target inward 250 mm boundary wall interface is not yet qualified.",
    );
  const raw = walls.flatMap((w) => {
    if (
      ![...w.a, ...w.b].every(
        (n) => Number.isSafeInteger(n) && Math.abs(n) <= 8192,
      ) ||
      equal(w.a, w.b)
    ) {
      issue(w.key, "Invalid lattice wall retained as a guide.");
      return [];
    }
    const [a, b] = [w.a, w.b].sort(sorted);
    return [{ a, b }];
  });
  // Include floor/module seams and T endpoints, then split long orthogonal runs
  // into exact 2m modules. Never rescale a native mesh to bridge a remainder.
  const endpoints = new Map(
    raw.flatMap((s) => [s.a, s.b]).map((p) => [pkey(p), p]),
  );
  // A crossing is also a node, even when neither input has an endpoint there.
  // Four-way native junctions are unsupported and must leave a visible gap.
  for (let i = 0; i < raw.length; i++)
    for (let j = i + 1; j < raw.length; j++) {
      const a = raw[i],
        b = raw[j];
      const rx = a.b[0] - a.a[0],
        ry = a.b[1] - a.a[1];
      const sx = b.b[0] - b.a[0],
        sy = b.b[1] - b.a[1];
      const d = rx * sy - ry * sx;
      if (!d) continue;
      const qx = b.a[0] - a.a[0],
        qy = b.a[1] - a.a[1];
      const t = (qx * sy - qy * sx) / d,
        u = (qx * ry - qy * rx) / d;
      if (t <= 0 || t >= 1 || u <= 0 || u >= 1) continue;
      const point: Point = [a.a[0] + t * rx, a.a[1] + t * ry];
      if (point.every(Number.isSafeInteger)) endpoints.set(pkey(point), point);
      else
        issue(
          `cross:${i}:${j}`,
          "Off-lattice wall crossing is not a qualified native junction.",
        );
    }

  for (const s of raw) {
    if (s.a[0] !== s.b[0] && s.a[1] !== s.b[1]) continue;
    const axis = s.a[0] === s.b[0] ? 1 : 0;
    for (let value = s.a[axis] + 64; value < s.b[axis]; value += 64) {
      const p: Point = [...s.a];
      p[axis] = value;
      endpoints.set(pkey(p), p);
      if (endpoints.size > 4096) {
        issue(
          "budget",
          "Native wall preview exceeds its 4096-node work budget.",
        );
        return plan;
      }
    }
  }
  const segments = new Map<string, { a: Point; b: Point }>();
  for (const s of raw) {
    const points = [...endpoints.values()]
      .filter((p) => onSegment(p, s.a, s.b))
      .sort(sorted);
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i];
      segments.set(`${pkey(a)}:${pkey(b)}`, { a, b });
    }
  }
  if (segments.size > 2048) {
    issue("budget", "Native wall preview exceeds its 2048-span work budget.");
    return plan;
  }
  const nodes = new Map<
    string,
    { point: Point; rays: Map<string, Point>; cutback: number }
  >();
  for (const s of segments.values())
    for (const [p, other] of [
      [s.a, s.b],
      [s.b, s.a],
    ]) {
      const key = pkey(p),
        n = nodes.get(key) ?? { point: p, rays: new Map(), cutback: 0.0625 };
      const ray = primitive([other[0] - p[0], other[1] - p[1]]);
      n.rays.set(pkey(ray), ray);
      nodes.set(key, n);
    }
  for (const [key, n] of nodes) {
    const wanted = raysKey([...n.rays.values()]);
    let matched = false;
    for (const candidate of kit.grammar.nodeSignatures) {
      for (let q = 0; q < 4 && !matched; q++) {
        if (
          raysKey(
            candidate.rays.map((p) => transformPoint([p[0], p[1]], q)),
          ) !== wanted
        )
          continue;
        n.cutback = candidate.cutbackM;
        plan.placements.push({
          key: `${input.deckId}:node:${key}`,
          partId: candidate.partId,
          originUnits: n.point,
          quarterTurns: q,
          kind: "node",
        });
        matched = true;
      }
      if (matched) break;
    }
    if (!matched)
      issue(
        `node:${key}`,
        "Native junction/end profile unavailable; keep guide visible. Door ends are not native frame installations.",
      );
  }
  for (const [key, s] of segments) {
    let matched = false;
    for (const [a, b] of [
      [s.a, s.b],
      [s.b, s.a],
    ]) {
      const delta: Point = [b[0] - a[0], b[1] - a[1]];
      for (const candidate of kit.grammar.spanSignatures) {
        if (
          candidate.startCutbackM !== nodes.get(pkey(a))!.cutback ||
          candidate.endCutbackM !== nodes.get(pkey(b))!.cutback
        )
          continue;
        for (let q = 0; q < 4 && !matched; q++) {
          if (
            !equal(
              transformPoint(
                [candidate.deltaUnits[0], candidate.deltaUnits[1]],
                q,
              ),
              delta,
            )
          )
            continue;
          plan.placements.push({
            key: `${input.deckId}:span:${key}`,
            partId: candidate.partId,
            originUnits: a,
            quarterTurns: q,
            kind: "span",
          });
          matched = true;
        }
        if (matched) break;
      }
      if (matched) break;
    }
    if (!matched)
      issue(
        `span:${key}`,
        `No exact native span for delta [${s.b[0] - s.a[0]}, ${s.b[1] - s.a[1]}] units with ${nodes.get(pkey(s.a))!.cutback} / ${nodes.get(pkey(s.b))!.cutback} m end cutbacks. Wireframe retained; authored panels are not stretched.`,
      );
  }
  plan.placements.sort((a, b) => a.key.localeCompare(b.key));
  return plan;
}

async function loadKit(scene: Scene) {
  const response = await fetch(CONSTRUCTION_BOUNDARY_FAMILY_URL);
  if (!response.ok) throw Error("Native wall kit unavailable");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (constructionHash(bytes) !== CONSTRUCTION_BOUNDARY_FAMILY_GLB_SHA)
    throw Error("Native wall kit hash mismatch");
  return SceneLoader.LoadAssetContainerAsync(
    "",
    bytes,
    scene,
    undefined,
    ".glb",
  );
}

/** A single retained GLB library per viewport, no per-frame imports or lights.
 * Meshes are non-pickable semantic previews; draft IDs/assembly stay untouched. */
export function createLayoutNativeWalls(
  scene: Scene,
  report: (message: string) => void = () => {},
  loader: (scene: Scene) => Promise<AssetContainer> = loadKit,
) {
  if (!scene.useRightHandedSystem)
    throw Error("Native wall preview requires right-handed coordinates");
  const root = new TransformNode("layout-native-walls", scene);
  let disposed = false,
    signature = "",
    pending: Promise<void> = Promise.resolve();
  let library: Promise<AssetContainer> | undefined,
    container: AssetContainer | undefined;
  let requested: LayoutNativeWallPlan | undefined;
  let meshes: Mesh[] = [];
  let placementNodes: TransformNode[] = [];
  const clear = () => {
    for (const node of placementNodes) node.dispose(false, false);
    placementNodes = [];
    meshes = [];
  };
  async function rebuild(plan: LayoutNativeWallPlan) {
    try {
      library ??= loader(scene);
      const loaded = await library;
      if (disposed) {
        loaded.dispose();
        return;
      }
      container = loaded;
      if (requested !== plan) return;
      const sources = loaded.meshes.filter(
        (m): m is Mesh => m instanceof Mesh && m.getTotalVertices() > 0,
      );
      const matrices = new Map(
        sources.map((m) => [m, m.computeWorldMatrix(true).clone()]),
      );
      clear();
      for (const p of plan.placements) {
        const definition = kit.parts.find((d) => d.id === p.partId)!;
        const prefix = definition.native.nodePrefix;
        const selected = sources.filter(
          (m) =>
            m.name === prefix ||
            m.name.startsWith(prefix + "_") ||
            m.name.startsWith(prefix + "."),
        );
        if (!selected.length)
          throw Error("Missing native wall selector " + prefix);
        const node = new TransformNode("layout-wall-" + p.key, scene);
        node.parent = root;
        node.position.set(
          p.originUnits[0] / 32,
          plan.elevationUnits / 32,
          -p.originUnits[1] / 32,
        );
        node.rotation.y = (p.quarterTurns * Math.PI) / 2;
        node.metadata = {
          role: "wall",
          authoringPreview: true,
          semanticKey: p.key,
          nativeRevision: "r004",
          fitApproved: false,
        };
        placementNodes.push(node);
        for (const source of selected) {
          const mesh = source.clone(
            "layout-wall-" + p.key + "--" + source.name,
            node,
            true,
          )!;
          const rotation = new Quaternion();
          matrices
            .get(source)!
            .decompose(mesh.scaling, rotation, mesh.position);
          mesh.rotationQuaternion = rotation;
          mesh.isVisible = true;
          mesh.isPickable = false;
          mesh.receiveShadows = true;
          mesh.metadata = node.metadata;
          registerReferencedSceneMaterial(scene, mesh.material);
          meshes.push(mesh);
        }
      }
      report(
        `${plan.placements.length} native wall pieces${plan.issues.length ? ` · ${plan.issues.length} wall fit notes` : ""}`,
      );
    } catch (error) {
      if (!disposed && requested === plan) {
        clear();
        report(
          error instanceof Error ? error.message : "Native wall preview failed",
        );
      }
    }
  }
  return {
    get meshes() {
      return meshes;
    },
    get plan() {
      return requested;
    },
    update(
      input: LayoutStructuralGuide | undefined,
      visible: boolean,
      origin: readonly number[] = [0, 0, 0],
    ) {
      if (disposed) return;
      root.position.set(-origin[0], -origin[1], -origin[2]);
      root.setEnabled(visible);
      const next = planLayoutNativeWalls(input);
      const nextSignature = JSON.stringify(next);
      if (nextSignature === signature) return;
      signature = nextSignature;
      requested = next;
      clear();
      if (!next.placements.length) {
        pending = Promise.resolve();
        report(
          `0 native wall pieces${next.issues.length ? ` · ${next.issues.length} wall fit notes` : ""}`,
        );
        return;
      }
      pending = rebuild(next);
    },
    // Clearing the draft can replace `pending` while the shared GLB is still
    // importing. Keep viewport teardown waiting for that import as well.
    ready: async () => {
      await Promise.allSettled([pending, ...(library ? [library] : [])]);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      requested = undefined;
      clear();
      root.dispose();
      container?.dispose();
    },
  };
}
