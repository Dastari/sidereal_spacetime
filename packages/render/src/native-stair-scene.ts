import { setMeshRole } from "./mesh-roles";
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
import {
  constructionHash,
  compileConstruction,
} from "@sidereal/sim/construction-transactions";
import {
  nativeStairRoomInstallation,
  type NativeStairRoomDocument,
} from "@sidereal/sim/construction-stairs-document";
import { NATIVE_STAIR_ROOM_SOURCES } from "@sidereal/content/construction-stairs-room";
import { createEquipmentLighting } from "./equipment-lighting";
import {
  NATIVE_STAIR_ROOM_AUDIT_TEXT,
  NATIVE_STAIR_ROOM_DELIVERY,
} from "@sidereal/content/construction-stairs-room";
import type { NativeStairAudit } from "@sidereal/content/construction-stairs";
const nativeAudit = JSON.parse(
  NATIVE_STAIR_ROOM_AUDIT_TEXT,
) as NativeStairAudit;

export interface NativeStairRenderInput {
  instanceId: string;
  selectedDeckId: string;
  visitId?: string;
  /** Minimum own rescue geometry; presentation only, never full instance access. */
  egressOnly?: boolean;
  lowerDeckId: string;
  upperDeckId: string;
  /** Exhaustive, exact server-compiled installation, including the native panels. */
  installation: readonly InstalledTraversalPart[];
  sources: Readonly<Record<string, { url: string; sha256: string }>>;
}
export interface NativeStairPresentation {
  selectedDeckId: string;
  /** Accepted stair presence only; this never changes the actor's transform. */
  inTransit: boolean;
}
/** Narrow own-character projection; all coordinates are accepted ship-local
 * metres. Render presentation does not reconstruct movement from time. */
export interface NativeStairAcceptedState {
  instanceId: string;
  x: number;
  y: number;
  z: number;
  phase: string;
  sourceDeckId: string;
  /** Current persisted visit, when supplied by the shared caller. */
  visitId?: string;
}
export function resolveNativeStairFrame(
  fixture: Pick<
    NativeStairRenderInput,
    "instanceId" | "selectedDeckId" | "lowerDeckId" | "upperDeckId" | "visitId"
  >,
  occupiedDeckId: string | undefined,
  accepted: NativeStairAcceptedState | null | undefined,
) {
  const validDeck = (id: string | undefined) =>
    id === fixture.lowerDeckId || id === fixture.upperDeckId;
  const selectedDeckId = validDeck(occupiedDeckId)
    ? occupiedDeckId!
    : fixture.selectedDeckId;
  const active =
    !!accepted &&
    accepted.instanceId === fixture.instanceId &&
    ["walking", "stopped", "stepping", "returning", "blocked"].includes(
      accepted.phase,
    ) &&
    validDeck(accepted.sourceDeckId) &&
    (!fixture.visitId || accepted.visitId === fixture.visitId) &&
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
  if (part.sourcePartId === "stair-enclosure") return "enclosure";
  if (part.sourcePartId.startsWith("stair-")) return "stair";
  throw Error("Unknown native stair placement role");
}

/** Render the complete fixed native fixture without a second generic floor/roof
 * pass. Body path, deck ownership and aperture permission remain authoritative. */
export async function loadNativeStairScene(
  scene: Scene,
  parent: TransformNode,
  input: NativeStairRenderInput,
) {
  const validDeck = (id: string) =>
    id === input.lowerDeckId || id === input.upperDeckId;
  if (!scene.useRightHandedSystem || parent.getScene() !== scene)
    throw Error("Native stair requires the declared right-handed frame");
  if (
    !validDeck(input.selectedDeckId) ||
    input.lowerDeckId === input.upperDeckId
  )
    throw Error("Native stair deck mismatch");
  if (
    new Set(input.installation.map((p) => p.id)).size !==
      input.installation.length ||
    new Set(input.installation.map((p) => p.sourcePartId)).size !==
      input.installation.length
  )
    throw Error("Duplicate native stair placement identity");
  const expectedParts = input.egressOnly
    ? nativeAudit.parts.filter(
        (p) =>
          p.sourceId === "stair-kit" ||
          p.id === "lower-floor-2-2" ||
          p.id === "upper-floor-4-2",
      )
    : nativeAudit.parts;
  if (input.installation.length !== expectedParts.length)
    throw Error("Native stair fixture requires its exact placement set");
  for (const part of input.installation) {
    const source = expectedParts.find((p) => p.id === part.sourcePartId);
    const hash =
      NATIVE_STAIR_ROOM_DELIVERY.sources[
        part.sourceId as keyof typeof NATIVE_STAIR_ROOM_DELIVERY.sources
      ]?.sha256;
    if (
      !source ||
      part.sourceId !== source.sourceId ||
      part.nodePrefix !== source.nodePrefix ||
      part.quarterTurns !== source.quarterTurns ||
      JSON.stringify(part.originM) !== JSON.stringify(source.originM) ||
      part.sha256 !== hash
    )
      throw Error("Native stair placement differs from pinned fixture");
  }
  const roles = input.installation.map(role);
  const expectedCounts = {
    "lower-floor": input.egressOnly ? 1 : 20,
    "upper-floor": input.egressOnly ? 1 : 16,
    "lower-roof": input.egressOnly ? 0 : 16,
    stair: 7,
    enclosure: 1,
  };
  for (const [name, count] of Object.entries(expectedCounts))
    if (roles.filter((r) => r === name).length !== count)
      throw Error("Native stair installation is not exhaustive");
  const bytes = new Map<string, Uint8Array>();
  for (const sourceId of new Set(input.installation.map((p) => p.sourceId))) {
    const pin = input.sources[sourceId];
    if (
      !pin ||
      input.installation.some(
        (p) => p.sourceId === sourceId && p.sha256 !== pin.sha256,
      )
    )
      throw Error("Native stair source pin mismatch");
    const response = await fetch(pin.url);
    if (!response.ok)
      throw Error("Native stair source unavailable: " + sourceId);
    const data = new Uint8Array(await response.arrayBuffer());
    if (constructionHash(data) !== pin.sha256)
      throw Error("Native stair GLB hash mismatch: " + sourceId);
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
      const meshes = imported.meshes
        .map((m) => setMeshRole(m, "floor"))
        .filter(
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
        throw Error("Missing native stair selector " + part.nodePrefix);
      const node = new TransformNode("stair-placement-" + part.id, scene);
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
        nativeStair: true,
        egressPresentationOnly: !!input.egressOnly,
        stairRole: roles[i],
        role:
          roles[i] === "lower-roof"
            ? "roof"
            : roles[i] === "enclosure"
              ? "wall"
              : "floor",
        deckId:
          roles[i] === "lower-floor" || roles[i] === "lower-roof"
            ? input.lowerDeckId
            : roles[i] === "stair" || roles[i] === "enclosure"
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
    let presentation: NativeStairPresentation = {
      selectedDeckId: input.selectedDeckId,
      inTransit: false,
    };
    let interior = true;
    const applyView = () => {
      placements.forEach((p, i) => {
        const role = roles[i];
        const part = input.installation[i];
        const upperLanding = part.sourcePartId === "upper-floor-4-2";
        const hideSlab =
          (presentation.inTransit ||
            (interior && presentation.selectedDeckId === input.lowerDeckId)) &&
          (role === "upper-floor" || role === "lower-roof") &&
          !upperLanding;
        // Native support, both flights and all guards remain present. Only the
        // outer enclosure is cut away so its wall does not obscure the stairs.
        const hideEnclosure =
          role === "enclosure" && (interior || presentation.inTransit);
        const visible = !hideSlab && !hideEnclosure;
        if (p.node.isEnabled(false) !== visible) p.node.setEnabled(visible);
      });
    };
    applyView();
    return {
      cameraFrame: {
        centerX: 4,
        centerY: 5,
        halfExtent: input.egressOnly ? 3 : 5,
      },
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
      applyAcceptedStair(
        occupiedDeckId: string | undefined,
        accepted: NativeStairAcceptedState | null | undefined,
      ) {
        const frame = resolveNativeStairFrame(input, occupiedDeckId, accepted);
        presentation = {
          selectedDeckId: frame.selectedDeckId,
          inTransit: frame.inTransit,
        };
        applyView();
        return frame;
      },
      setStair(next: NativeStairPresentation) {
        if (
          !validDeck(next.selectedDeckId) ||
          typeof next.inTransit !== "boolean"
        )
          throw Error("Invalid native stair presentation state");
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

/** Integrated construction dispatcher. Returns undefined for existing non-stair
 * fixtures so their established loaders stay unchanged. */
export async function loadNativeStairConstruction(
  scene: Scene,
  parent: TransformNode,
  input: {
    instanceId: string;
    documentJson: string;
    deckId: string;
    visitId?: string;
  },
) {
  if (new TextEncoder().encode(input.documentJson).length > 262144)
    throw Error("Native stair construction document byte cap");
  const candidate = JSON.parse(input.documentJson);
  if (!candidate?.stairRoom) return undefined;
  const document = JSON.parse(
    compileConstruction(input.documentJson).canonical,
  ) as NativeStairRoomDocument;
  if (
    document.layout.id !== input.instanceId ||
    !document.layout.decks.some((d) => d.id === input.deckId)
  )
    throw Error("Native stair construction instance/deck mismatch");
  const native = nativeStairRoomInstallation(document, 1n, 1n);
  parent.metadata = { ...parent.metadata, instanceId: input.instanceId };
  return loadNativeStairScene(scene, parent, {
    instanceId: input.instanceId,
    selectedDeckId: input.deckId,
    visitId: input.visitId,
    lowerDeckId: native.lowerDeckId,
    upperDeckId: native.upperDeckId,
    installation: native.parts,
    sources: NATIVE_STAIR_ROOM_SOURCES,
  });
}

export interface NativeStairEgressGeometry {
  characterId: string;
  instanceId: string;
  stairId: string;
  visitId: string;
  lowerDeckId: string;
  upperDeckId: string;
  sourceDeckId: string;
  adapterId: string;
  adapterRevision: string;
  auditSha256: string;
  proofHash: string;
}
/** Render the server-authorized own immutable egress pin without retaining or
 * fetching a private instance document. IDs here are explicitly non-pickable
 * presentation keys, not authoritative placed-object identities. */
export async function loadNativeStairEgress(
  scene: Scene,
  parent: TransformNode,
  input: NativeStairEgressGeometry,
) {
  const ids = [
    input.characterId,
    input.instanceId,
    input.stairId,
    input.visitId,
    input.lowerDeckId,
    input.upperDeckId,
  ];
  if (
    ids.some(
      (id) => typeof id !== "string" || !/^[a-zA-Z0-9:_./-]{1,128}$/.test(id),
    ) ||
    input.lowerDeckId === input.upperDeckId ||
    ![input.lowerDeckId, input.upperDeckId].includes(input.sourceDeckId) ||
    input.adapterId !== NATIVE_STAIR_ROOM_DELIVERY.adapterId ||
    input.adapterRevision !== NATIVE_STAIR_ROOM_DELIVERY.revision ||
    input.auditSha256 !== NATIVE_STAIR_ROOM_DELIVERY.auditSha256 ||
    !/^[a-f0-9]{64}$/.test(input.proofHash)
  )
    throw Error("Unqualified native stair egress context");
  const parts = nativeAudit.parts.filter(
    (p) =>
      p.sourceId === "stair-kit" ||
      p.id === "lower-floor-2-2" ||
      p.id === "upper-floor-4-2",
  );
  return loadNativeStairScene(scene, parent, {
    instanceId: input.instanceId,
    visitId: input.visitId,
    selectedDeckId: input.sourceDeckId,
    lowerDeckId: input.lowerDeckId,
    upperDeckId: input.upperDeckId,
    egressOnly: true,
    installation: parts.map((p) => ({
      ...p,
      id: `egress:${input.characterId}:${p.id}`,
      sourcePartId: p.id,
      sha256:
        NATIVE_STAIR_ROOM_DELIVERY.sources[
          p.sourceId as keyof typeof NATIVE_STAIR_ROOM_DELIVERY.sources
        ].sha256,
    })),
    sources: NATIVE_STAIR_ROOM_SOURCES,
  });
}
