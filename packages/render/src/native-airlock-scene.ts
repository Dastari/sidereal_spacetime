import { setMeshRole } from './mesh-roles';
import {
  SceneLoader,
  type ISceneLoaderAsyncResult,
} from "@babylonjs/core/Loading/sceneLoader";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import "@babylonjs/loaders/glTF";
import type { NativeRoomInstalledPart } from "@sidereal/sim/construction-native-room";
import { constructionHash } from "@sidereal/sim/construction-transactions";
import { createEquipmentLighting } from "./equipment-lighting";
import { loadConstructionDoorSeals } from "./construction-door-seals";

export interface NativeAirlockRenderInput {
  instanceId: string;
  deckId: string;
  doors: readonly { openingId: string; originM: [number, number, number]; quarterTurns: number }[];
  /** Exact installation returned by the trusted, fixed-room compiler. */
  installation: readonly NativeRoomInstalledPart[];
  elevationM: number;
  sources: Readonly<Record<string, { url: string; sha256: string }>>;
}
export interface NativeAirlockDoorState {
  openingId: string;
  fraction: number;
  /** Missing state must never display a deployed seal. */
  sealRetraction?: number;
}
const leafPrefix = "GEO-door-leaf--surface";
const ringPrefix = "GEO-door-perimeter-seal--surface";
const seatPrefix = "GEO-door-frame-seal-seat--surface";
const matches = (name: string, prefix: string) =>
  name === prefix ||
  name.startsWith(prefix + "_") ||
  name.startsWith(prefix + ".");

/** Native visual installation only: no collision, gas or authoritative state is
 * derived from visibility. The audited floor datum is already inside the GLBs. */
export async function loadNativeAirlockScene(
  scene: Scene,
  parent: TransformNode,
  input: NativeAirlockRenderInput,
) {
  if (!scene.useRightHandedSystem || !Number.isFinite(input.elevationM))
    throw Error("Native airlock requires a right-handed deck frame");
  const ids = new Set(input.installation.map((p) => p.id));
  if (ids.size !== input.installation.length)
    throw Error("Duplicate native airlock room placement");
  const leaf = input.installation.filter(
    (p) => p.source === "door" && p.nodePrefix === leafPrefix,
  );
  const gaskets = input.installation.filter((p) => p.source === "gasket");
  const frameKey = (p: { originM: readonly number[]; quarterTurns: number }) => JSON.stringify([p.originM, p.quarterTurns]);
  const doorByFrame = new Map(input.doors.map(d => [frameKey(d), d]));
  if (input.doors.length !== 2 || doorByFrame.size !== 2 || new Set(input.doors.map(d => d.openingId)).size !== 2 || leaf.length !== 2 || gaskets.length !== 4 ||
    input.doors.some(d => {
      const same = input.installation.filter(p => frameKey(p) === frameKey(d));
      return [leafPrefix, ringPrefix, seatPrefix, "GEO-door-frame-2m--surface"].some(prefix => same.filter(p => p.nodePrefix === prefix).length !== 1);
    }) || [...leaf, ...gaskets].some(p => !doorByFrame.has(frameKey(p))))
    throw Error("Native airlock requires two exact shared door/seal frames");
  const bytes = new Map<string, Uint8Array>();
  // Fetch each used source once. In particular the superseded strip is not used.
  for (const source of new Set(input.installation.map((p) => p.source))) {
    const pin = input.sources[source];
    if (
      !pin ||
      input.installation.some(
        (p) => p.source === source && p.sha256 !== pin.sha256,
      )
    )
      throw Error("Native airlock source pin mismatch: " + source);
    const response = await fetch(pin.url);
    if (!response.ok)
      throw Error("Native airlock source unavailable: " + source);
    const data = new Uint8Array(await response.arrayBuffer());
    if (constructionHash(data) !== pin.sha256)
      throw Error("Native airlock GLB hash mismatch: " + source);
    bytes.set(source, data);
  }
  const imported: ISceneLoaderAsyncResult[] = [];
  const prototypes = new Map<
    string,
    { meshes: Mesh[]; matrices: Map<Mesh, Matrix> }
  >();
  type Placement = {
    node: TransformNode;
    meshes: Mesh[];
    lighting: ReturnType<typeof createEquipmentLighting>;
  };
  const placements: Placement[] = [];
  const byId = new Map<string, Placement>();
  let seals: Awaited<ReturnType<typeof loadConstructionDoorSeals>> | undefined;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const placement of placements) placement.lighting.dispose();
    seals?.dispose();
    for (const placement of placements)
      if (!placement.node.isDisposed()) placement.node.dispose();
    for (const result of imported) {
      for (const mesh of result.meshes) mesh.dispose(false, true);
      for (const node of result.transformNodes) node.dispose();
    }
  };
  try {
    for (const [source, data] of bytes) {
      if (source === "gasket") continue;
      const result = await SceneLoader.ImportMeshAsync(
        "",
        "",
        data,
        scene,
        undefined,
        ".glb",
      );
      imported.push(result);
      const meshes = result.meshes.map(m => setMeshRole(m, "wall")).filter(
        (m): m is Mesh => m instanceof Mesh && m.getTotalVertices() > 0,
      );
      prototypes.set(source, {
        meshes,
        matrices: new Map(
          meshes.map((m) => [m, m.computeWorldMatrix(true).clone()]),
        ),
      });
      for (const mesh of result.meshes) {
        mesh.isVisible = false;
        mesh.isPickable = false;
      }
    }
    const mechanisms = new Map<string, { openingId: string; frame: TransformNode; hinge: TransformNode }>();
    const metadata = (p: NativeRoomInstalledPart) => ({
      partId: p.id,
      role: p.source === 'roof' ? 'roof' : p.source === 'floor' ? 'floor' : 'wall',
      instanceId: input.instanceId,
      deckId: input.deckId,
      nativeSource: p.source,
      nativeSha256: p.sha256,
      nativeNodePrefix: p.nodePrefix,
      constructionAirlock: true,
      constructionRoof: p.source === "roof",
      openingId:
        p.source === "door" || p.source === "gasket"
          ? doorByFrame.get(frameKey(p))?.openingId
          : undefined,
      damageMode: "voxel",
      damageReady: false,
    });
    const add = (
      p: NativeRoomInstalledPart,
      node: TransformNode,
      meshes: Mesh[],
    ) => {
      node.metadata = { ...node.metadata, ...metadata(p) };
      for (const mesh of meshes)
        mesh.metadata = { ...mesh.metadata, ...metadata(p) };
      const lighting = createEquipmentLighting(scene, node, []);
      lighting.setMeshes(meshes);
      const placement = { node, meshes, lighting };
      placements.push(placement);
      byId.set(p.id, placement);
    };
    for (const p of input.installation) {
      if (p.source === "gasket") continue;
      const prototype = prototypes.get(p.source)!;
      const selected = prototype.meshes.filter((m) =>
        matches(m.name, p.nodePrefix),
      );
      if (!selected.length)
        throw Error("Missing native airlock selector " + p.nodePrefix);
      const node = new TransformNode("airlock-placement-" + p.id, scene);
      node.parent = parent;
      node.position.set(
        p.originM[0],
        p.originM[2] + input.elevationM,
        -p.originM[1],
      );
      node.rotation.y = (p.quarterTurns * Math.PI) / 2;
      let primitiveParent = node;
      let inverseBind = Matrix.Identity();
      if (leaf.includes(p)) {
        const openingId = doorByFrame.get(frameKey(p))!.openingId;
        const hinge = new TransformNode("airlock-hinge-" + openingId, scene);
        mechanisms.set(openingId, { openingId, frame: node, hinge });
        hinge.parent = node;
        hinge.position.set(0.3125, 0, 0.0625);
        primitiveParent = hinge;
        inverseBind = Matrix.Translation(-0.3125, 0, -0.0625);
      }
      const meshes = selected.map((source) => {
        const mesh = source.clone(
          "GEO-" + p.id + "--native--" + source.name,
          primitiveParent,
          true,
        )!;
        const rotation = new Quaternion();
        prototype.matrices
          .get(source)!
          .multiply(inverseBind)
          .decompose(mesh.scaling, rotation, mesh.position);
        mesh.rotationQuaternion = rotation;
        mesh.isVisible = true;
        mesh.isPickable = false;
        mesh.receiveShadows = true;
        return mesh;
      });
      add(p, node, meshes);
    }
    seals = await loadConstructionDoorSeals(scene, bytes.get("gasket")!, [...mechanisms.values()]);
    for (const p of gaskets) {
      const openingId = doorByFrame.get(frameKey(p))!.openingId;
      const entry = seals.entries.find(e => e.openingId === openingId)!;
      const mesh = p.nodePrefix === ringPrefix ? entry.ring : entry.seats;
      add(p, mesh, [mesh]);
    }
    // Audited enclosure ends at X=6; the unroofed landing extends to X=8. Determine wall-facing normals
    // from complete native mesh bounds, including elbow/T primitives.
    const inverseParent = Matrix.Invert(parent.computeWorldMatrix(true));
    const cuts = input.installation
      .filter((p) => p.source === "wall")
      .map((p) => {
        const placement = byId.get(p.id)!;
        const corners = placement.meshes.flatMap((mesh) => {
          mesh.computeWorldMatrix(true);
          return mesh
            .getBoundingInfo()
            .boundingBox.vectorsWorld.map((v) =>
              Vector3.TransformCoordinates(v, inverseParent),
            );
        });
        const minX = Math.min(...corners.map((v) => v.x)),
          maxX = Math.max(...corners.map((v) => v.x));
        const minY = Math.min(...corners.map((v) => -v.z)),
          maxY = Math.max(...corners.map((v) => -v.z));
        const x = (minX + maxX) / 2,
          y = (minY + maxY) / 2;
        const normals: [number, number][] = [];
        if (maxX - minX < 0.6 && Math.abs(x) < 0.3) normals.push([-1, 0]);
        if (maxX - minX < 0.6 && Math.abs(x - 6) < 0.3) normals.push([1, 0]);
        if (maxY - minY < 0.6 && Math.abs(y) < 0.3) normals.push([0, -1]);
        if (maxY - minY < 0.6 && Math.abs(y - 2) < 0.3) normals.push([0, 1]);
        return { placement, x, y, normals };
      });
    return {
      cameraFrame: { centerX: 4, centerY: 1, halfExtent: 4 },
      placements: input.installation.map((p) => byId.get(p.id)!),
      meshes: placements.flatMap((p) => p.meshes),
      walkingElevation: input.elevationM + 0.1875,
      setDoors(states: readonly NativeAirlockDoorState[]) {
        // Presentation consumes accepted states only; interlocks remain server-owned.
        const accepted = [];
        for (const mechanism of mechanisms.values()) {
          const state = states.find(s => s.openingId === mechanism.openingId);
          const fraction = state?.fraction;
          const valid = fraction !== undefined && Number.isFinite(fraction) && fraction >= 0 && fraction <= 1;
          mechanism.hinge.rotation.y = valid ? (-fraction * Math.PI) / 2 : 0;
          if (state && valid) accepted.push({ openingId: mechanism.openingId, hingeFraction: fraction, sealRetraction: state.sealRetraction ?? NaN });
        }
        seals!.setStates(accepted);
      },
      setView(cameraPosition: Vector3, interior: boolean) {
        const local = Vector3.TransformCoordinates(
          cameraPosition,
          Matrix.Invert(parent.computeWorldMatrix(true)),
        );
        for (const p of input.installation)
          if (p.source === "roof") byId.get(p.id)!.node.setEnabled(!interior);
        for (const cut of cuts)
          cut.placement.node.setEnabled(
            !interior ||
              !cut.normals.some(
                ([x, y]) =>
                  x * (local.x - cut.x) + y * (-local.z - cut.y) > 1e-6,
              ),
          );
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
