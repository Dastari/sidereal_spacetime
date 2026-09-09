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

export interface NativePressureRoomRenderInput {
  instanceId: string;
  deckId: string;
  openingId: string;
  /** Exact installation returned by the trusted, fixed-room compiler. */
  installation: readonly NativeRoomInstalledPart[];
  elevationM: number;
  sources: Readonly<Record<string, { url: string; sha256: string }>>;
}
export interface NativePressureRoomDoorState {
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
export async function loadConstructionPressureRoom(
  scene: Scene,
  parent: TransformNode,
  input: NativePressureRoomRenderInput,
) {
  if (!scene.useRightHandedSystem || !Number.isFinite(input.elevationM))
    throw Error("Native pressure room requires a right-handed deck frame");
  const ids = new Set(input.installation.map((p) => p.id));
  if (ids.size !== input.installation.length)
    throw Error("Duplicate native pressure room placement");
  const leaf = input.installation.filter(
    (p) => p.source === "door" && p.nodePrefix === leafPrefix,
  );
  const gaskets = input.installation.filter((p) => p.source === "gasket");
  if (
    leaf.length !== 1 ||
    gaskets.length !== 2 ||
    !gaskets.some((p) => p.nodePrefix === ringPrefix) ||
    !gaskets.some((p) => p.nodePrefix === seatPrefix) ||
    gaskets.some(
      (p) =>
        p.quarterTurns !== leaf[0].quarterTurns ||
        p.originM.some((v, i) => v !== leaf[0].originM[i]),
    )
  )
    throw Error("Native pressure room requires exact shared door/seal frame");
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
      throw Error("Native pressure room source pin mismatch: " + source);
    const response = await fetch(pin.url);
    if (!response.ok)
      throw Error("Native pressure room source unavailable: " + source);
    const data = new Uint8Array(await response.arrayBuffer());
    if (constructionHash(data) !== pin.sha256)
      throw Error("Native pressure room GLB hash mismatch: " + source);
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
      const meshes = result.meshes.filter(
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
    let hinge: TransformNode | undefined;
    let doorFrame: TransformNode | undefined;
    const metadata = (p: NativeRoomInstalledPart) => ({
      partId: p.id,
      instanceId: input.instanceId,
      deckId: input.deckId,
      nativeSource: p.source,
      nativeSha256: p.sha256,
      nativeNodePrefix: p.nodePrefix,
      constructionPressureRoom: true,
      constructionRoof: p.source === "roof",
      openingId:
        p.source === "door" || p.source === "gasket"
          ? input.openingId
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
        throw Error("Missing native pressure selector " + p.nodePrefix);
      const node = new TransformNode("pressure-placement-" + p.id, scene);
      node.parent = parent;
      node.position.set(
        p.originM[0],
        p.originM[2] + input.elevationM,
        -p.originM[1],
      );
      node.rotation.y = (p.quarterTurns * Math.PI) / 2;
      let primitiveParent = node;
      let inverseBind = Matrix.Identity();
      if (p === leaf[0]) {
        doorFrame = node;
        hinge = new TransformNode("pressure-hinge-" + input.openingId, scene);
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
    seals = await loadConstructionDoorSeals(scene, bytes.get("gasket")!, [
      { openingId: input.openingId, frame: doorFrame!, hinge: hinge! },
    ]);
    const entry = seals.entries[0];
    for (const p of gaskets) {
      const mesh = p.nodePrefix === ringPrefix ? entry.ring : entry.seats;
      add(p, mesh, [mesh]);
    }
    // Authored room footprint is fixed at 4 x 2m. Determine wall-facing normals
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
        if (maxX - minX < 0.6 && Math.abs(x - 4) < 0.3) normals.push([1, 0]);
        if (maxY - minY < 0.6 && Math.abs(y) < 0.3) normals.push([0, -1]);
        if (maxY - minY < 0.6 && Math.abs(y - 2) < 0.3) normals.push([0, 1]);
        return { placement, x, y, normals };
      });
    return {
      cameraFrame: { centerX: 2, centerY: 1, halfExtent: 2 },
      placements: input.installation.map((p) => byId.get(p.id)!),
      meshes: placements.flatMap((p) => p.meshes),
      walkingElevation: input.elevationM + 0.1875,
      setDoors(states: readonly NativePressureRoomDoorState[]) {
        const state = states.find((s) => s.openingId === input.openingId);
        const fraction = state?.fraction;
        const valid =
          fraction !== undefined &&
          Number.isFinite(fraction) &&
          fraction >= 0 &&
          fraction <= 1;
        hinge!.rotation.y = valid ? (-fraction * Math.PI) / 2 : 0;
        seals!.setStates(
          state && valid
            ? [
                {
                  openingId: input.openingId,
                  hingeFraction: fraction,
                  sealRetraction: state.sealRetraction ?? NaN,
                },
              ]
            : [],
        );
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
