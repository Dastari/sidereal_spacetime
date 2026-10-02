/** Independent verified asset staging; physical contacts require a qualified scene-owned placement. */
import type { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import type { Material } from "@babylonjs/core/Materials/material";
import { resolveCrewAppearance, type CrewAppearance } from "./appearance";
import { createVoxelCrewVisual } from "./voxel-crew";
import {
  createVoxelCrewOutfit,
  voxelArmorLoadout,
  type OperatorOutfitSources,
} from "./voxel-crew-outfit";
import sourceTable from "./operator-visual-sources.json";
import {
  crewHeadAssetUrl,
  crewFaceAtlasUrl,
  resolveHeadLoadout,
} from "@sidereal/content/crew-heads";
import {
  voxelHeadLoadoutFromAppearance,
  VOXEL_HELMET_VISUALS,
  VOXEL_VISOR_VISUALS,
} from "@sidereal/content/crew-voxel-appearance";
import {
  crewArmorPart,
  crewArmorAssetUrl,
  crewArmorFit,
} from "@sidereal/content/crew-armor";
import { crewWardrobeItem } from "@sidereal/content/crew-wardrobe";
import {
  crewItem,
  CREW_ITEM_CATALOG,
  type CrewItemSocketName,
} from "@sidereal/content/crew-items";
import { createVoxelHeldItem } from "./voxel-held-item";
import {
  fetchVerifiedCrewSource,
  type VerifiedCrewSource,
  type RequestedCrewSource,
} from "./crew-asset-cache";
import {
  VOXEL_CREW_ASSET_URL,
  VOXEL_CREW_SOCKETS,
  VOXEL_CREW_UPPER_BONES,
} from "@sidereal/content/crew-voxel-bundle";
import type { CompleteOperatorAssets } from "./operator-asset-transaction";
import {
  createOperatorContact,
  type OperatorContact,
  type OperatorContactPlacement,
} from "./operator-contact";

type Crew = Awaited<ReturnType<typeof createVoxelCrewVisual>>;
export interface OperatorEnsembleRequest {
  requestedKey: string;
  associationKey: string;
  bodySource: VerifiedCrewSource;
  appearance: CrewAppearance;
  outfitSources: OperatorOutfitSources;
  heldItem: string | null;
  heldSources?: NonNullable<
    Parameters<typeof createVoxelHeldItem>[2]
  >["operatorSources"];
  requiredBodyNodes: readonly string[];
  requiredBodyClips: readonly string[];
  /** Explicit measured baked face or an already decoded owned/reference-managed atlas. */
  faceAtlas: NonNullable<
    Parameters<typeof createVoxelCrewVisual>[3]
  >["faceAtlas"];
}

export interface OperatorEnsemblePlan extends Omit<
  OperatorEnsembleRequest,
  "bodySource" | "outfitSources" | "heldSources"
> {
  bodySource: RequestedCrewSource;
  outfitSources: {
    head: ReadonlyMap<string, RequestedCrewSource>;
    headAtlases: ReadonlyMap<string, RequestedCrewSource>;
    armor(
      partId: string,
      variant: string,
    ):
      | { source: RequestedCrewSource; requiredJoints: readonly string[] }
      | undefined;
  };
  heldSources?: {
    armedClips: RequestedCrewSource;
    item(id: string):
      | {
          source: RequestedCrewSource;
          requiredSockets: readonly import("@sidereal/content/crew-items").CrewItemSocketName[];
        }
      | undefined;
  };
}

/** Current measured resource identity, separate from late context registration or fit permission. */
export function currentOperatorEnsemblePlan(
  requested: { appearance: CrewAppearance; heldItem: string | null },
  associationKey: string,
  requestedKey: string,
): OperatorEnsemblePlan {
  if (
    sourceTable.schema !== "sidereal.navigation-operator-visual-sources.v1" ||
    sourceTable.selection !== "current-legacy"
  )
    throw new Error("Operator source table unavailable");
  const descriptor = (value: string, kind: string): RequestedCrewSource => {
    const url = value.split("?")[0];
    const pin = (
      sourceTable.sources as Readonly<
        Record<
          string,
          { kind: string; sha256: string; byteLength: number; variant: string }
        >
      >
    )[url];
    if (
      !pin ||
      pin.kind !== kind ||
      !/^[a-f0-9]{64}$/.test(pin.sha256) ||
      !Number.isSafeInteger(pin.byteLength) ||
      pin.byteLength <= 0
    )
      throw new Error("Operator measured source unavailable");
    return {
      url,
      sha256: pin.sha256,
      byteLength: pin.byteLength,
      variant: pin.variant,
    };
  };
  const appearance = {
    ...requested.appearance,
    equippedComponents: { ...requested.appearance.equippedComponents },
    headArtRevision: "legacy",
  };
  const resolved = resolveCrewAppearance(appearance);
  const loadout = voxelHeadLoadoutFromAppearance({
    ...resolved,
    bodyType: resolved.bodyType,
    equippedComponents: appearance.equippedComponents,
  });
  const armorLoadout = voxelArmorLoadout(appearance.equippedComponents);
  for (const [slot, id] of Object.entries(appearance.equippedComponents)) {
    if (!id) throw new Error("Operator requested worn visual unavailable");
    const wardrobe = crewWardrobeItem(id);
    if (slot === "helmet") {
      const expected =
        wardrobe?.slot === "helmet" && wardrobe.helmet
          ? { helmet: wardrobe.helmet }
          : VOXEL_HELMET_VISUALS[id.replace(/^crew-/, "")];
      if (
        !expected ||
        (expected.helmet && loadout.helmet !== expected.helmet) ||
        (expected.accessory &&
          !loadout.accessories?.includes(expected.accessory))
      )
        throw new Error("Operator requested helmet unavailable");
    } else if (slot === "visor") {
      const expected = VOXEL_VISOR_VISUALS[id.replace(/^crew-/, "")];
      if (
        !expected ||
        (loadout.helmet
          ? loadout.visor !== expected
          : !loadout.accessories?.includes("goggles_down"))
      )
        throw new Error("Operator requested visor unavailable");
    } else if (slot === "uniform") {
      if (wardrobe?.slot !== "uniform" || !wardrobe.suit)
        throw new Error("Operator requested uniform unavailable");
    } else if (!(slot in armorLoadout))
      throw new Error("Operator requested armor unavailable");
  }
  const head = resolveHeadLoadout(loadout);
  const headSources = new Map(
    [...new Set(head.nodes.map((node) => node.file))].map((file) => [
      file,
      descriptor(crewHeadAssetUrl(file), "legacy-head"),
    ]),
  );
  const atlasSources = new Map([
    [
      head.face.variant,
      descriptor(crewFaceAtlasUrl(head.face.variant), "legacy-face-map"),
    ],
  ]);
  const armor = new Map(
    Object.values(armorLoadout)
      .filter((part) => !!part)
      .map((want) => {
        const part = crewArmorPart(want.part);
        const fit = part?.fits.all
          ? "all"
          : resolved.bodyType === "female"
            ? "narrow"
            : "wide";
        if (
          !part ||
          !part.bones.length ||
          !part.fits[fit]?.mesh ||
          crewArmorFit(part, resolved.bodyType) !== fit
        )
          throw new Error("Operator body-specific armor unavailable");
        const source = descriptor(crewArmorAssetUrl(part), "armor");
        if (source.sha256 !== part.sha256)
          throw new Error("Operator armor source pin mismatch");
        return [
          JSON.stringify([part.id, resolved.bodyType]),
          { source, requiredJoints: [...part.bones] },
        ] as const;
      }),
  );
  const heldItem = requested.heldItem;
  if (heldItem === "shield-pack")
    throw new Error("Operator held resource unmeasured");
  const item = heldItem ? crewItem(heldItem) : null;
  const held = item && {
    source: descriptor(
      CREW_ITEM_CATALOG.assetBase + item.files.lod0,
      "held-item",
    ),
    requiredSockets: Object.keys(item.sockets) as CrewItemSocketName[],
  };
  return {
    requestedKey,
    associationKey,
    appearance,
    heldItem,
    bodySource: descriptor(VOXEL_CREW_ASSET_URL, "body"),
    faceAtlas: false,
    requiredBodyNodes: [
      "pelvis",
      ...VOXEL_CREW_UPPER_BONES,
      ...["L", "R"].flatMap((side) =>
        ["thigh", "shin", "foot", "toe"].map((name) => `${name}.${side}`),
      ),
    ],
    requiredBodyClips: ["idle", "walk", "sit", "sit_idle"],
    outfitSources: {
      head: headSources,
      headAtlases: atlasSources,
      armor: (part, variant) => armor.get(JSON.stringify([part, variant])),
    },
    heldSources: held
      ? {
          armedClips: descriptor(
            CREW_ITEM_CATALOG.assetBase + "armed-actions.glb",
            "armed-clips",
          ),
          item: (id) => (id === heldItem ? held : undefined),
        }
      : undefined,
  };
}

/** Actual source verification is part of the owner's pending generation, before any body is swapped. */
export async function verifyOperatorEnsemblePlan(
  scene: Scene,
  incoming: OperatorEnsemblePlan,
): Promise<OperatorEnsembleRequest> {
  const appearance = {
    ...incoming.appearance,
    equippedComponents: incoming.appearance.equippedComponents && {
      ...incoming.appearance.equippedComponents,
    },
  };
  const heldItem = incoming.heldItem,
    requestedKey = incoming.requestedKey,
    associationKey = incoming.associationKey;
  const bodyVariant = resolveCrewAppearance(appearance).bodyType;
  const head = [...incoming.outfitSources.head].map(
    ([name, source]) => [name, { ...source }] as const,
  );
  const atlases = [...incoming.outfitSources.headAtlases].map(
    ([name, source]) => [name, { ...source }] as const,
  );
  const armor = [
    ...Object.values(voxelArmorLoadout(appearance.equippedComponents ?? {})),
  ]
    .filter((part) => !!part)
    .map((part) => {
      const descriptor = incoming.outfitSources.armor(part.part, bodyVariant);
      if (!descriptor)
        throw new Error("Operator requested armor source unavailable");
      return {
        key: JSON.stringify([part.part, bodyVariant]),
        source: { ...descriptor.source },
        requiredJoints: [...descriptor.requiredJoints],
      };
    });
  const heldDescriptor = heldItem
    ? incoming.heldSources?.item(heldItem)
    : undefined;
  if (heldItem && (!heldDescriptor || !incoming.heldSources))
    throw new Error("Operator requested held source unavailable");
  const selectedHeld = heldDescriptor && {
    source: { ...heldDescriptor.source },
    requiredSockets: [...heldDescriptor.requiredSockets],
  };
  const body = { ...incoming.bodySource },
    armed = incoming.heldSources && { ...incoming.heldSources.armedClips };
  const requiredBodyNodes = [...incoming.requiredBodyNodes],
    requiredBodyClips = [...incoming.requiredBodyClips],
    faceAtlas = incoming.faceAtlas;
  if (head.length + atlases.length + armor.length + 3 > 96)
    throw new Error("Operator source request exceeds measured bounds");
  const bodySource = fetchVerifiedCrewSource(scene, body);
  const headSources = Promise.all(
    head.map(
      async ([name, source]) =>
        [name, await fetchVerifiedCrewSource(scene, source)] as const,
    ),
  );
  const faceSources = Promise.all(
    atlases.map(
      async ([name, source]) =>
        [name, await fetchVerifiedCrewSource(scene, source)] as const,
    ),
  );
  const armorSources = Promise.all(
    armor.map(
      async (descriptor) =>
        [
          descriptor.key,
          {
            source: await fetchVerifiedCrewSource(scene, descriptor.source),
            requiredJoints: descriptor.requiredJoints,
          },
        ] as const,
    ),
  );
  const itemSource = selectedHeld
    ? fetchVerifiedCrewSource(scene, selectedHeld.source)
    : undefined;
  const armedSource = armed ? fetchVerifiedCrewSource(scene, armed) : undefined;
  const [
    verifiedBody,
    verifiedHeads,
    verifiedFaces,
    verifiedArmor,
    verifiedItem,
    verifiedArmed,
  ] = await Promise.all([
    bodySource,
    headSources,
    faceSources,
    armorSources,
    itemSource,
    armedSource,
  ]);
  const byArmor = new Map(verifiedArmor);
  return {
    requestedKey,
    associationKey,
    appearance,
    heldItem,
    faceAtlas,
    requiredBodyNodes,
    requiredBodyClips,
    bodySource: verifiedBody,
    outfitSources: {
      head: new Map(verifiedHeads),
      headAtlases: new Map(verifiedFaces),
      armor: (part, variant) => byArmor.get(JSON.stringify([part, variant])),
    },
    heldSources: verifiedArmed && {
      armedClips: verifiedArmed,
      item: (id) =>
        id === heldItem && verifiedItem && selectedHeld
          ? {
              source: verifiedItem,
              requiredSockets: selectedHeld.requiredSockets,
            }
          : undefined,
    },
  };
}

function materials(mesh: AbstractMesh): Material[] {
  const material = mesh.material;
  return (
    material instanceof MultiMaterial ? material.subMaterials : [material]
  ).filter((value): value is Material => !!value);
}

/** Flags that affect the actual staged draw, including light/receiver changes after preparation. */
export function operatorMaterialKey(
  scene: Scene,
  meshes: readonly AbstractMesh[],
) {
  return JSON.stringify([
    [scene.lightsEnabled, scene.shadowsEnabled, scene.activeCamera?.layerMask],
    scene.lights.map((light) => [
      light.uniqueId,
      light.getTypeID(),
      light.isEnabled(),
      light.shadowEnabled,
      light.includeOnlyWithLayerMask,
      light.excludeWithLayerMask,
      light.includedOnlyMeshes.map((mesh) => mesh.uniqueId),
      light.excludedMeshes.map((mesh) => mesh.uniqueId),
      [...(light.getShadowGenerators()?.entries() ?? [])].map(
        ([camera, generator]) => [
          camera?.uniqueId,
          generator.serialize(),
          generator.getShadowMap()?.uniqueId,
          generator.getShadowMap()?.getSize(),
          generator.getShadowMap()?.renderList?.map((mesh) => mesh.uniqueId),
        ],
      ),
    ]),
    meshes.map((mesh) => [
      mesh.uniqueId,
      mesh.receiveShadows,
      mesh.layerMask,
      mesh.lightSources.map((light) => light.uniqueId),
      mesh.skeleton?.uniqueId,
      mesh.numBoneInfluencers,
      mesh.computeBonesUsingShaders,
      mesh.useVertexColors,
      mesh.hasVertexAlpha,
      mesh.skeleton?.useTextureToStoreBoneMatrices,
      mesh.skeleton?.isUsingTextureForMatrices,
      mesh.isAnInstance,
      "hasThinInstances" in mesh && mesh.hasThinInstances,
      mesh.subMeshes?.map((sub) => sub.materialIndex),
      materials(mesh).map((material) => [
        material.uniqueId,
        material.backFaceCulling,
        material.alpha,
        material
          .getActiveTextures()
          .map((texture) => [
            texture.uniqueId,
            texture.isReady(),
            texture.coordinatesIndex,
          ]),
        "maxSimultaneousLights" in material && material.maxSimultaneousLights,
        "disableLighting" in material && material.disableLighting,
      ]),
    ]),
  ]);
}

export function operatorDrawReady(
  scene: Scene,
  meshes: readonly AbstractMesh[],
) {
  if (scene.isDisposed || !meshes.length) return false;
  for (const mesh of meshes) {
    const instances = mesh.isAnInstance || mesh.hasThinInstances;
    if (!mesh.subMeshes?.length) return false;
    for (const sub of mesh.subMeshes) {
      const material = sub.getMaterial();
      if (!material) return false;
      const hotSwap = material.allowShaderHotSwapping;
      material.allowShaderHotSwapping = false;
      try {
        if (!material.isReadyForSubMesh(mesh, sub, instances)) return false;
      } finally {
        material.allowShaderHotSwapping = hotSwap;
      }
      if (scene.shadowsEnabled)
        for (const light of mesh.lightSources) {
          if (!light.shadowEnabled) continue;
          for (const generator of light.getShadowGenerators()?.values() ?? []) {
            const map = generator.getShadowMap();
            if (map?.renderList && !map.renderList.includes(mesh)) continue;
            if (
              !generator.isReady(
                sub,
                instances,
                material.needAlphaBlendingForMesh(mesh),
              )
            )
              return false;
          }
        }
    }
  }
  return true;
}

async function bounded<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error("Operator material preparation timed out")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function prepareOperatorMaterials(
  scene: Scene,
  meshes: readonly AbstractMesh[],
  timeoutMs = 15000,
) {
  const textures = [
    ...new Set(
      meshes.flatMap((mesh) =>
        materials(mesh).flatMap((material) => material.getActiveTextures()),
      ),
    ),
  ];
  const deadline = performance.now() + timeoutMs;
  while (textures.some((texture) => !texture.isReady())) {
    if (scene.isDisposed || performance.now() >= deadline)
      throw new Error("Operator material map unavailable");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  await bounded(
    Promise.all(
      meshes.flatMap((mesh) =>
        materials(mesh).map((material) =>
          material.forceCompilationAsync(mesh, {
            useInstances:
              mesh.isAnInstance ||
              ("hasThinInstances" in mesh && !!mesh.hasThinInstances),
          }),
        ),
      ),
    ),
    Math.max(1, deadline - performance.now()),
  );
  while (!operatorDrawReady(scene, meshes)) {
    if (scene.isDisposed || performance.now() >= deadline)
      throw new Error("Operator draw effects unavailable");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  if (scene.isDisposed) throw new Error("Operator scene withdrawn");
  return operatorMaterialKey(scene, meshes);
}

/** Optional ports let tests fail actual preparation branches without creating a production override. */
export interface OperatorEnsembleLoaders {
  body: typeof createVoxelCrewVisual;
  outfit: typeof createVoxelCrewOutfit;
  held: typeof createVoxelHeldItem;
  materials: typeof prepareOperatorMaterials;
}
const loaders: OperatorEnsembleLoaders = {
  body: createVoxelCrewVisual,
  outfit: createVoxelCrewOutfit,
  held: createVoxelHeldItem,
  materials: prepareOperatorMaterials,
};

export interface PreparedOperatorEnsemble extends CompleteOperatorAssets {
  readonly crew: Crew;
  readonly root: TransformNode;
  readonly outfit: ReturnType<typeof createVoxelCrewOutfit>;
  readonly held: ReturnType<typeof createVoxelHeldItem>;
  readonly contact?: OperatorContact;
  readonly ordinaryBaseline?: PreparedOperatorEnsemble;
  /** Separate handle ownership transfers only after ordinary activation/restoration succeeds. */
  releaseOrdinaryBaseline?(handle: PreparedOperatorEnsemble): void;
  checkActivation(): void;
  activationKey(): string;
  /** Recompile changed flags while still staged; activation itself never lowers render settings. */
  prepareActivation(): Promise<void>;
}

export async function prepareOperatorEnsemble(
  scene: Scene,
  parent: TransformNode,
  request: OperatorEnsembleRequest,
  ports: OperatorEnsembleLoaders = loaders,
  configureMeshes?: (meshes: readonly AbstractMesh[]) => void,
  contactPlacement?: OperatorContactPlacement,
): Promise<PreparedOperatorEnsemble> {
  contactPlacement = contactPlacement && {
    ...contactPlacement,
    navigationLocal: contactPlacement.navigationLocal.clone(),
  };
  // Canonical requests own their values before the first asynchronous load. A later wardrobe
  // edit must create a new generation rather than mutate the ensemble already being prepared.
  const incoming = request;
  const armor = new Map<string, ReturnType<OperatorOutfitSources["armor"]>>();
  const appearance = {
    ...incoming.appearance,
    equippedComponents: incoming.appearance.equippedComponents && {
      ...incoming.appearance.equippedComponents,
    },
  };
  const bodyVariant = resolveCrewAppearance(appearance).bodyType;
  for (const part of Object.values(
    voxelArmorLoadout(appearance.equippedComponents ?? {}),
  )) {
    if (!part) continue;
    const descriptor = incoming.outfitSources.armor(part.part, bodyVariant);
    armor.set(
      JSON.stringify([part.part, bodyVariant]),
      descriptor && {
        ...descriptor,
        requiredJoints: [...descriptor.requiredJoints],
      },
    );
  }
  const heldItem = incoming.heldItem;
  const selectedHeld = heldItem
    ? incoming.heldSources?.item(heldItem)
    : undefined;
  const heldDescriptor = selectedHeld && {
    ...selectedHeld,
    requiredSockets: [...selectedHeld.requiredSockets],
  };
  request = {
    ...incoming,
    appearance,
    requiredBodyNodes: [...incoming.requiredBodyNodes],
    requiredBodyClips: [...incoming.requiredBodyClips],
    outfitSources: {
      head: new Map(incoming.outfitSources.head),
      headAtlases: new Map(incoming.outfitSources.headAtlases),
      armor: (part, variant) => armor.get(JSON.stringify([part, variant])),
    },
    heldSources: incoming.heldSources && {
      armedClips: incoming.heldSources.armedClips,
      item: (id) => (id === heldItem ? heldDescriptor : undefined),
    },
  };
  const root = new TransformNode("operator-ensemble-stage", scene);
  root.parent = parent;
  root.setEnabled(false);
  let crew: Crew | undefined;
  let outfit: ReturnType<typeof createVoxelCrewOutfit> | undefined;
  let held: ReturnType<typeof createVoxelHeldItem> | undefined;
  let contact: OperatorContact | undefined;
  let ordinaryBaseline: PreparedOperatorEnsemble | undefined;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    try {
      ordinaryBaseline?.dispose();
    } finally {
      try {
        contact?.dispose();
      } finally {
        try {
          held?.dispose();
        } finally {
          try {
            outfit?.dispose();
          } finally {
            try {
              crew?.dispose();
            } finally {
              root.dispose();
            }
          }
        }
      }
    }
  };
  try {
    const coreNodes = [
      "pelvis",
      ...VOXEL_CREW_UPPER_BONES,
      ...["L", "R"].flatMap((side) =>
        ["thigh", "shin", "foot", "toe"].map((bone) => `${bone}.${side}`),
      ),
    ];
    const coreClips = ["idle", "walk", "sit", "sit_idle"];
    if (
      !request.requestedKey ||
      !request.associationKey ||
      request.faceAtlas === undefined ||
      coreNodes.some((name) => !request.requiredBodyNodes.includes(name)) ||
      coreClips.some((name) => !request.requiredBodyClips.includes(name))
    )
      throw new Error("Operator requested ensemble unavailable");
    crew = await ports.body(scene, root, request.bodySource, {
      shared: true,
      faceAtlas: request.faceAtlas,
    });
    if (
      !crew.skeleton?.bones.length ||
      VOXEL_CREW_SOCKETS.some((name) => !crew!.socketNodes[name]) ||
      request.requiredBodyNodes.some((name) => !crew!.joints.has(name)) ||
      request.requiredBodyClips.some((name) => !crew!.hasClip(name))
    )
      throw new Error("Operator body rig or clips unavailable");
    crew.customize(request.appearance);
    outfit = ports.outfit(scene, crew, {
      operatorSources: request.outfitSources,
    });
    outfit.apply(request.appearance);
    if (request.heldItem && !request.heldSources)
      throw new Error("Operator held source unavailable");
    held = ports.held(scene, crew, {
      operatorSources: request.heldSources,
      instant: () => true,
    });
    held.set(request.heldItem);
    const results = await Promise.allSettled([
      outfit.whenComplete(),
      held.whenComplete(),
    ]);
    if (results.some((result) => result.status === "rejected"))
      throw new Error("Operator requested ensemble incomplete");
    for (const [slot, part] of Object.entries(
      voxelArmorLoadout(request.appearance.equippedComponents ?? {}),
    ))
      if (outfit.armour[slot as keyof typeof outfit.armour] !== part?.part)
        throw new Error("Operator requested armor incomplete");
    const actualCrew = crew;
    if (contactPlacement) {
      ordinaryBaseline = await prepareOperatorEnsemble(
        scene,
        parent,
        request,
        ports,
        configureMeshes,
      );
      const actualItem =
        request.heldItem && request.heldSources?.item(request.heldItem);
      if (request.heldItem && !actualItem)
        throw new Error("Operator physical item source unavailable");
      contact = createOperatorContact(
        scene,
        root,
        actualCrew,
        held,
        contactPlacement,
        request.associationKey,
        request.heldItem && actualItem
          ? { id: request.heldItem, sha256: actualItem.source.sha256 }
          : null,
      );
    }
    const meshes = root
      .getChildMeshes()
      .filter((mesh) => mesh.getTotalVertices() > 0);
    if (!meshes.length || meshes.some((mesh) => !mesh.getIndices()?.length))
      throw new Error("Operator indexed ensemble unavailable");
    configureMeshes?.(meshes);
    let materialKey = await ports.materials(scene, meshes);
    await contact?.whenEvaluated();
    const checkActivation = () => {
      contact?.assertReady();
      if (disposed || materialKey !== operatorMaterialKey(scene, meshes))
        throw new Error("Operator activation configuration changed");
      const enabled = root.isEnabled(false);
      root.setEnabled(true);
      try {
        if (
          materialKey !== operatorMaterialKey(scene, meshes) ||
          !operatorDrawReady(
            scene,
            meshes.filter(
              (mesh) =>
                mesh.isEnabled() && mesh.isVisible && mesh.visibility > 0,
            ),
          )
        )
          throw new Error("Operator actual draw unavailable");
      } finally {
        root.setEnabled(enabled);
      }
    };
    return {
      state: "verified-complete",
      requestedKey: request.requestedKey,
      associationKey: request.associationKey,
      crew: actualCrew,
      root,
      outfit,
      held,
      contact,
      get ordinaryBaseline() {
        return ordinaryBaseline;
      },
      releaseOrdinaryBaseline(handle) {
        if (!ordinaryBaseline || ordinaryBaseline !== handle)
          throw new Error("Operator ordinary ownership mismatch");
        ordinaryBaseline = undefined;
      },
      checkActivation,
      activationKey: () => operatorMaterialKey(scene, meshes),
      async prepareActivation() {
        if (disposed) throw new Error("Operator ensemble withdrawn");
        await ordinaryBaseline?.prepareActivation();
        if (materialKey !== operatorMaterialKey(scene, meshes))
          materialKey = await ports.materials(scene, meshes);
      },
      activate() {
        ordinaryBaseline?.checkActivation();
        checkActivation();
        root.setEnabled(true);
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
