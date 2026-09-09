import {
  SceneLoader,
  type ISceneLoaderAsyncResult,
} from "@babylonjs/core/Loading/sceneLoader";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Quaternion, type Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import "@babylonjs/loaders/glTF";
import type { InstalledTraversalPart } from "@sidereal/content/construction-traversal";
import { constructionHash } from "@sidereal/sim/construction-transactions";
import { createEquipmentLighting } from "./equipment-lighting";

export interface ConstructionTraversalRenderInput {
  instanceId: string;
  selectedDeckId: string;
  lowerDeckId: string;
  upperDeckId: string;
  /** Exhaustive, exact server-compiled installation, including the native panels. */
  installation: readonly InstalledTraversalPart[];
  sources: Readonly<Record<string, { url: string; sha256: string }>>;
}
export interface ConstructionTraversalPresentation {
  selectedDeckId: string;
  /** Accepted traversal presence only; this never changes the actor's transform. */
  inTransit: boolean;
}
/** Narrow own-character projection; all coordinates are accepted ship-local
 * metres. Render presentation does not reconstruct movement from time. */
export interface ConstructionTraversalAcceptedState {
  instanceId: string;
  x: number;
  y: number;
  z: number;
  phase: string;
  sourceDeckId: string;
  destinationDeckId: string;
}
export function resolveConstructionTraversalFrame(
  fixture: Pick<
    ConstructionTraversalRenderInput,
    "instanceId" | "selectedDeckId" | "lowerDeckId" | "upperDeckId"
  >,
  occupiedDeckId: string | undefined,
  accepted: ConstructionTraversalAcceptedState | null | undefined,
) {
  const validDeck = (id: string | undefined) =>
    id === fixture.lowerDeckId || id === fixture.upperDeckId;
  const selectedDeckId = validDeck(occupiedDeckId)
    ? occupiedDeckId!
    : fixture.selectedDeckId;
  const active =
    !!accepted &&
    accepted.instanceId === fixture.instanceId &&
    ["approaching", "transit", "returning", "blocked"].includes(
      accepted.phase,
    ) &&
    validDeck(accepted.sourceDeckId) &&
    validDeck(accepted.destinationDeckId) &&
    accepted.sourceDeckId !== accepted.destinationDeckId &&
    [accepted.x, accepted.y, accepted.z].every(
      (n) => Number.isFinite(n) && Math.abs(n) <= 512,
    );
  return {
    selectedDeckId,
    inTransit: active,
    walkingElevation: selectedDeckId === fixture.lowerDeckId ? 0.1875 : 3.375,
    acceptedPositionM: active
      ? ([accepted!.x, accepted!.y, accepted!.z] as [number, number, number])
      : undefined,
  };
}
const selectorMatches = (name: string, prefix: string) =>
  name === prefix ||
  name.startsWith(prefix + "_") ||
  name.startsWith(prefix + ".");
function role(part: InstalledTraversalPart) {
  if (part.sourcePartId.startsWith("lower-floor-")) return "lower-floor";
  if (part.sourcePartId.startsWith("upper-floor-")) return "upper-floor";
  if (part.sourcePartId.startsWith("lower-roof-")) return "lower-roof";
  if (part.sourcePartId === "traversal-ladder") return "ladder";
  if (part.sourcePartId === "traversal-guard") return "guard";
  if (part.sourcePartId === "traversal-aperture-edge") return "edge";
  throw Error("Unknown native traversal placement role");
}

/** Render the complete fixed native fixture without a second generic floor/roof
 * pass. Body path, deck ownership and aperture permission remain authoritative. */
export async function loadConstructionTraversal(
  scene: Scene,
  parent: TransformNode,
  input: ConstructionTraversalRenderInput,
) {
  const validDeck = (id: string) =>
    id === input.lowerDeckId || id === input.upperDeckId;
  if (!scene.useRightHandedSystem || parent.getScene() !== scene)
    throw Error("Native traversal requires the declared right-handed frame");
  if (
    !validDeck(input.selectedDeckId) ||
    input.lowerDeckId === input.upperDeckId
  )
    throw Error("Native traversal deck mismatch");
  if (
    new Set(input.installation.map((p) => p.id)).size !==
      input.installation.length ||
    new Set(input.installation.map((p) => p.sourcePartId)).size !==
      input.installation.length
  )
    throw Error("Duplicate native traversal placement identity");
  const roles = input.installation.map(role);
  const expectedCounts = {
    "lower-floor": 9,
    "upper-floor": 8,
    "lower-roof": 8,
    ladder: 1,
    guard: 1,
    edge: 1,
  };
  for (const [name, count] of Object.entries(expectedCounts))
    if (roles.filter((r) => r === name).length !== count)
      throw Error("Native traversal installation is not exhaustive");
  const bytes = new Map<string, Uint8Array>();
  for (const sourceId of new Set(input.installation.map((p) => p.sourceId))) {
    const pin = input.sources[sourceId];
    if (
      !pin ||
      input.installation.some(
        (p) => p.sourceId === sourceId && p.sha256 !== pin.sha256,
      )
    )
      throw Error("Native traversal source pin mismatch");
    const response = await fetch(pin.url);
    if (!response.ok)
      throw Error("Native traversal source unavailable: " + sourceId);
    const data = new Uint8Array(await response.arrayBuffer());
    if (constructionHash(data) !== pin.sha256)
      throw Error("Native traversal GLB hash mismatch: " + sourceId);
    bytes.set(sourceId, data);
  }
  const imports: ISceneLoaderAsyncResult[] = [];
  const placements: {
    node: TransformNode;
    meshes: Mesh[];
    lighting: ReturnType<typeof createEquipmentLighting>;
  }[] = [];
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const p of placements) {
      p.lighting.dispose();
      p.node.dispose();
    }
    for (const imported of imports) {
      for (const mesh of imported.meshes) mesh.dispose(false, true);
      for (const node of imported.transformNodes) node.dispose();
    }
  };
  try {
    const prototypes = new Map<
      string,
      {
        meshes: Mesh[];
        matrices: Map<Mesh, ReturnType<Mesh["computeWorldMatrix"]>>;
      }
    >();
    for (const [sourceId, data] of bytes) {
      const imported = await SceneLoader.ImportMeshAsync(
        "",
        "",
        data,
        scene,
        undefined,
        ".glb",
      );
      imports.push(imported);
      const meshes = imported.meshes.filter(
        (m): m is Mesh => m instanceof Mesh && m.getTotalVertices() > 0,
      );
      prototypes.set(sourceId, {
        meshes,
        matrices: new Map(
          meshes.map((m) => [m, m.computeWorldMatrix(true).clone()]),
        ),
      });
      for (const mesh of imported.meshes) {
        mesh.isVisible = false;
        mesh.isPickable = false;
      }
    }
    for (const [i, part] of input.installation.entries()) {
      const source = prototypes.get(part.sourceId)!;
      const selected = source.meshes.filter((m) =>
        selectorMatches(m.name, part.nodePrefix),
      );
      if (!selected.length)
        throw Error("Missing native traversal selector " + part.nodePrefix);
      const node = new TransformNode("traversal-placement-" + part.id, scene);
      node.parent = parent;
      node.position.set(part.originM[0], part.originM[2], -part.originM[1]);
      node.rotation.y = (part.quarterTurns * Math.PI) / 2;
      node.metadata = {
        partId: part.id,
        assetId: part.sourceId + ":" + part.nodePrefix,
        sourcePartId: part.sourcePartId,
        instanceId: input.instanceId,
        nativeSource: part.sourceId,
        nativeSha256: part.sha256,
        nativeNodePrefix: part.nodePrefix,
        constructionTraversal: true,
        traversalRole: roles[i],
        deckId:
          roles[i] === "lower-floor" || roles[i] === "lower-roof"
            ? input.lowerDeckId
            : roles[i] === "ladder"
              ? undefined
              : input.upperDeckId,
        damageReady: false,
      };
      const meshes = selected.map((original) => {
        const mesh = original.clone(
          "GEO-" + part.id + "--native--" + original.name,
          node,
          true,
        )!;
        const rotation = new Quaternion();
        source.matrices
          .get(original)!
          .decompose(mesh.scaling, rotation, mesh.position);
        mesh.rotationQuaternion = rotation;
        mesh.isVisible = true;
        mesh.isPickable = false;
        mesh.receiveShadows = true;
        mesh.metadata = { ...node.metadata };
        return mesh;
      });
      const lighting = createEquipmentLighting(scene, node, []);
      lighting.setMeshes(meshes);
      placements.push({ node, meshes, lighting });
    }
    let presentation: ConstructionTraversalPresentation = {
      selectedDeckId: input.selectedDeckId,
      inTransit: false,
    };
    let interior = true;
    const applyView = () => {
      placements.forEach((p, i) => {
        const role = roles[i];
        const hideSlab =
          (presentation.inTransit ||
            (interior && presentation.selectedDeckId === input.lowerDeckId)) &&
          (role === "upper-floor" || role === "lower-roof");
        const hideUpperTrim =
          interior &&
          presentation.selectedDeckId === input.lowerDeckId &&
          !presentation.inTransit &&
          (role === "guard" || role === "edge");
        const visible = !hideSlab && !hideUpperTrim;
        if (p.node.isEnabled(false) !== visible) p.node.setEnabled(visible);
      });
    };
    applyView();
    return {
      cameraFrame: { centerX: 3, centerY: 3, halfExtent: 3 },
      placements,
      meshes: placements.flatMap((p) => p.meshes),
      get walkingElevation() {
        return presentation.selectedDeckId === input.lowerDeckId
          ? 0.1875
          : 3.375;
      },
      setDoors(
        _states: readonly {
          openingId: string;
          fraction: number;
          sealRetraction?: number;
        }[],
      ) {},
      setView(_cameraPosition: Vector3, isInterior: boolean) {
        interior = isInterior;
        applyView();
      },
      applyAcceptedTraversal(
        occupiedDeckId: string | undefined,
        accepted: ConstructionTraversalAcceptedState | null | undefined,
      ) {
        const frame = resolveConstructionTraversalFrame(
          input,
          occupiedDeckId,
          accepted,
        );
        presentation = {
          selectedDeckId: frame.selectedDeckId,
          inTransit: frame.inTransit,
        };
        applyView();
        return frame;
      },
      setTraversal(next: ConstructionTraversalPresentation) {
        if (
          !validDeck(next.selectedDeckId) ||
          typeof next.inTransit !== "boolean"
        )
          throw Error("Invalid native traversal presentation state");
        presentation = { ...next };
        applyView();
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
