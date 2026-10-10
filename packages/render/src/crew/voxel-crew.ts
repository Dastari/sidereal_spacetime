import { studyCrewPalette, studyMaterials } from "./crew-study-materials";
import {
  CREW_STUDY,
  CREW_STUDY_SCALE,
  crewStudyUrl,
} from "@sidereal/content/crew-study";
import { loadStudyAnimations } from "./crew-study-assets";
import { setPbrLightBudget, GAME_PBR_LIGHT_LIMIT } from "../pbr-light-budget";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import "@babylonjs/loaders/glTF";
import {
  VOXEL_CREW_ANKLE_HEIGHT_M,
  VOXEL_CREW_DEFAULT_OUTFIT,
  voxelCrewOutfitFor,
  VOXEL_CREW_FACE_ATLAS_URL,
  VOXEL_CREW_FACE_IMAGE_URL,
  VOXEL_CREW_SOCKETS,
  VOXEL_CREW_UPPER_BONES,
  voxelCrewExpressionAt,
  voxelCrewHiddenRegions,
  type VoxelCrewAction,
  type VoxelCrewOutfit,
  type VoxelCrewRegion,
  type VoxelCrewSocket,
  type VoxelCrewVariant,
  VOXEL_CREW_CLIP_FALLBACK,
} from "@sidereal/content/crew-voxel-bundle";
import {
  hexToRgb,
  type FaceAtlas,
  type FaceAtlasImage,
} from "@sidereal/content/crew-voxel-face";
import { createVoxelFace, loadVoxelFaceAtlas } from "./voxel-face";
import { createFootPlanting, solveTwoBone, leanSeatSpine } from "./voxel-ik";
import { setMeshRole } from "../mesh-roles";
import { resolveCrewAppearance, type CrewAppearance } from "./appearance";
import { crewWardrobeItem } from "@sidereal/content/crew-wardrobe";
import type { CrewArmorSlot } from "@sidereal/content/crew-armor";
import {
  createCrewRegionalLayers,
  createStudyBaseCoverage,
  crewArmorClothRegions,
} from "./voxel-crew-regions";
import {
  selectVoxelCrewLayers,
  voxelCrewActionLayer,
  voxelCrewBlendDuration,
  voxelCrewLoops,
  voxelCrewSpeedRatio,
  voxelCrewWeapon,
  type VoxelCrewLayers,
  type VoxelCrewMotion,
} from "./voxel-crew-clips";
import { blendProgress } from "./animation";
import {
  instantiateSharedCrewBody,
  type CrewBodyAssets,
} from "./crew-asset-cache";

type Mask = "full" | "upper" | "lower";
export type VoxelCrewBodyRegion = VoxelCrewRegion;
type Track = {
  group: AnimationGroup;
  weight: number;
  from: number;
  target: number;
};

const UPPER = new Set<string>([
  ...VOXEL_CREW_UPPER_BONES,
  "hair.1",
  "hair.2",
  ...["L", "R"].flatMap((side) =>
    ["thumb", "index", "fingers", "prop"].map((bone) => `${bone}.${side}`),
  ),
]);
/**
 * Legacy crew emission cap. Study materials preserve their exported ratios through
 * STUDY_EMISSIVE_SCALE instead.
 */
export const CREW_EMISSIVE_INTENSITY = 0.9;

/** Map legacy appearance roles onto the voxel material slots (colour only, never geometry). */
export function voxelCrewSlotColors(
  appearance: CrewAppearance,
): Record<string, string> {
  const r = resolveCrewAppearance(appearance);
  const darker = (hex: string, k: number) => {
    const c = Color3.FromHexString(hex);
    return new Color3(c.r * k, c.g * k, c.b * k).toHexString();
  };
  // An equipped department uniform (wardrobe item) tints the suit layer; appearance otherwise.
  const uniformId = appearance.equippedComponents?.uniform;
  const uniform = uniformId ? crewWardrobeItem(uniformId)?.suit : undefined;
  return {
    skin: r.skin,
    hair: r.hair,
    suit_primary: uniform?.primary ?? r.suit,
    suit_secondary: uniform?.secondary ?? darker(r.suit, 0.6),
    accent: uniform?.accent ?? r.accent,
    metal: r.trim,
    emit: r.light,
    glass: r.visor,
  };
}

/** A body parsed for one crew only (previews, tests, in-memory assets). */
async function loadOwnedCrewBody(
  scene: Scene,
  assetUrl: string | ArrayBufferView,
): Promise<CrewBodyAssets> {
  const container: AssetContainer = await SceneLoader.LoadAssetContainerAsync(
    "",
    assetUrl,
    scene,
    undefined,
    ".glb",
  );
  container.addAllToScene();
  return {
    meshes: container.meshes,
    materials: container.materials,
    transformNodes: container.transformNodes,
    rootNodes: container.rootNodes as TransformNode[],
    animationGroups: container.animationGroups,
    skeletons: container.skeletons,
    dispose: () => container.dispose(),
  };
}

export function voxelCrewVariant(appearance: CrewAppearance): VoxelCrewVariant {
  const body = resolveCrewAppearance(appearance).bodyType as string;
  return body === "female" || body === "neutral" ? body : "male";
}

/**
 * Presentation only: pinned provisional crew-study v2 by default, with source animations
 * retargeted onto the existing gameplay state mapper. Explicit legacy assets retain their
 * original assembly and scale for compatibility tests/review.
 */
export async function createVoxelCrewVisual(
  scene: Scene,
  parent: TransformNode,
  assetUrl: string | ArrayBufferView = crewStudyUrl(CREW_STUDY.body.file),
  options: {
    /** Face atlas; omitted = fetch the default atlas (browser); false = keep the GLB's baked face. */
    faceAtlas?: { atlas: FaceAtlas; image: FaceAtlasImage } | false;
    random?: () => number;
    /**
     * Clone the body from one per-scene parsed GLB (shared vertex/index buffers; per-body skeleton,
     * clips and tinted materials). Used by the game for the local character and every crewmate.
     * Requires a URL; an in-memory asset always loads its own copy.
     */
    shared?: boolean;
    /** In-memory test/review animation bytes; URL loads share a scene cache. */
    studyAnimation?: ArrayBufferView;
  } = {},
) {
  const container: CrewBodyAssets =
    options.shared && typeof assetUrl === "string"
      ? await instantiateSharedCrewBody(scene, assetUrl)
      : await loadOwnedCrewBody(scene, assetUrl);
  const root = new TransformNode("crew-placement", scene);
  root.parent = parent;
  const visual = new TransformNode("crew-model", scene);
  visual.parent = root;
  const study = container.skeletons[0]?.bones.length === 32;
  const modelScale = study ? CREW_STUDY_SCALE : 1;
  visual.scaling.setAll(modelScale);
  // crew_rig faces Blender +Y, exported as glTF -Z, which is already gameplay forward.
  for (const mesh of container.meshes) setMeshRole(mesh, "crew");
  for (const node of container.rootNodes) node.parent = visual;
  const nodes = new Map(container.transformNodes.map((n) => [n.name, n]));
  const clips = new Map<string, AnimationGroup>(
    container.animationGroups.map((g) => [g.name, g]),
  );
  for (const g of clips.values()) g.stop();

  // ------------------------------------------------------------------ sockets
  const socketNodes = {} as Record<VoxelCrewSocket, TransformNode>;
  for (const name of VOXEL_CREW_SOCKETS) {
    const node = nodes.get(name);
    if (node) socketNodes[name] = node;
  }
  /** Legacy equipment grips: the r008 hand frame is this rig's hand frame turned PI about the bone. */
  const legacyHand = (side: "R" | "L") => {
    const turn = new TransformNode(`crew-socket-legacy-turn-${side}`, scene);
    turn.parent = nodes.get(`hand.${side}`) ?? visual;
    turn.rotation.y = Math.PI;
    const socket = new TransformNode(`crew-socket-hand${side}`, scene);
    socket.parent = turn;
    socket.rotation.x = Math.PI / 2;
    socket.position.y = 0.055;
    return socket;
  };
  const sockets = {
    handR: legacyHand("R"),
    handL: legacyHand("L"),
    back: socketNodes["socket.back"] ?? visual,
    hip: socketNodes["socket.hip.R"] ?? visual,
  };
  /** CHAR-WEAPONS item frame (origin grip, Blender +Y barrel, +Z up) -> socket.hand.* (+X barrel). */
  const itemSocket = (side: "R" | "L") => {
    const node = new TransformNode(`crew-item-socket-${side}`, scene);
    node.parent = socketNodes[`socket.hand.${side}`] ?? visual;
    node.rotationQuaternion = Quaternion.RotationAxis(
      Vector3.Up(),
      -Math.PI / 2,
    );
    return node;
  };
  const itemSockets = { R: itemSocket("R"), L: itemSocket("L") };
  /** Joint nodes by crew_rig bone name (armour / heads re-link their skins to these). */
  const joints = new Map<string, TransformNode>();
  for (const bone of container.skeletons[0]?.bones ?? []) {
    const node = bone.getTransformNode();
    if (node) joints.set(bone.name, node);
  }
  let studyAnimationSource: AssetContainer | undefined;
  if (study) {
    visual.setEnabled(false);
    try {
      studyAnimationSource = options.studyAnimation
        ? await SceneLoader.LoadAssetContainerAsync(
            "",
            options.studyAnimation,
            scene,
            undefined,
            ".glb",
          )
        : await loadStudyAnimations(scene);
    } catch (error) {
      container.dispose();
      root.dispose();
      throw error;
    }
  }
  const attached = new Set<AssetContainer>();
  // support-hand IK: after animations, pin socket.hand.L onto the held item's support socket
  let supportTarget: TransformNode | null = null;
  let supportError = 0;
  const rigRoot = nodes.get("crew_rig") ?? visual;
  // foot planting on the deck (presentation only): ground clamp + stance lock in the ship frame
  const legChain = (side: "L" | "R") =>
    joints.get(`thigh.${side}`) &&
    joints.get(`shin.${side}`) &&
    joints.get(`foot.${side}`)
      ? {
          root: rigRoot,
          upper: joints.get(`thigh.${side}`)!,
          lower: joints.get(`shin.${side}`)!,
          end: joints.get(`foot.${side}`)!,
          effector: joints.get(`foot.${side}`)!,
        }
      : undefined;
  const legs = [legChain("L"), legChain("R")].filter((l) => !!l);
  const footPlanting =
    legs.length === 2
      ? createFootPlanting(visual, parent, legs, {
          restAnkle: VOXEL_CREW_ANKLE_HEIGHT_M,
          maxDrift: 0.12 * modelScale,
        })
      : undefined;
  let seatContact:
    | { lift: number; lean: number; footSupport: number; footForward?: number }
    | undefined;
  let footIk = true;
  let footSettleS = 0;
  let seatSpineOriginal: Quaternion | undefined;
  const seatResetObserver = scene.onBeforeAnimationsObservable.add(() => {
    const spine = joints.get("spine");
    if (spine && seatSpineOriginal)
      spine.rotationQuaternion = seatSpineOriginal;
    seatSpineOriginal = undefined;
  });
  const ikObserver = scene.onAfterAnimationsObservable.add(() => {
    const m = lastMotion;
    if (m.seated && seatContact && !m.dead) {
      const spine = joints.get("spine");
      if (spine && seatContact.lean) {
        seatSpineOriginal =
          spine.rotationQuaternion?.clone() ??
          Quaternion.FromEulerVector(spine.rotation);
        leanSeatSpine(visual, spine, seatContact.lean);
      }
      const inverse = root.computeWorldMatrix(true).clone().invert();
      for (const leg of legs) {
        const goal = leg.end.computeWorldMatrix(true).clone();
        const at = Vector3.TransformCoordinates(goal.getTranslation(), inverse);
        at.y =
          VOXEL_CREW_ANKLE_HEIGHT_M * modelScale +
          seatContact.footSupport -
          seatContact.lift;
        if (study && seatContact.footForward !== undefined)
          at.z = -seatContact.footForward;
        goal.setTranslation(
          Vector3.TransformCoordinates(at, root.getWorldMatrix()),
        );
        solveTwoBone(leg, goal);
      }
    }
    const onDeck =
      footIk &&
      !disposed &&
      !m.eva &&
      !m.seated &&
      !m.dead &&
      !m.downed &&
      !m.climbing &&
      !m.hovering;
    if (footPlanting) {
      if (onDeck) {
        const dt = scene.getEngine().getDeltaTime() / 1000;
        footSettleS = Math.max(0, footSettleS - dt);
        footPlanting.step(dt, footSettleS === 0);
      } else footPlanting.reset();
    }
    if (!supportTarget || !joints.get("upper_arm.L")) return;
    supportError = solveTwoBone(
      {
        root: rigRoot,
        upper: joints.get("upper_arm.L")!,
        lower: joints.get("forearm.L")!,
        end: joints.get("hand.L")!,
        effector:
          (study ? joints.get("prop.L") : socketNodes["socket.hand.L"]) ??
          joints.get("hand.L")!,
      },
      supportTarget.computeWorldMatrix(true),
    );
  });
  /**
   * Attach a part container exported with a copy of crew_rig (rigid per-bone skin): its skeleton
   * bones are re-linked to this body's joints so it follows every action. Unskinned roots are
   * parented to `socket` (default: the visual root).
   */
  const attachPart = (part: AssetContainer, socket?: VoxelCrewSocket) => {
    part.addAllToScene();
    for (const skeleton of part.skeletons)
      for (const bone of skeleton.bones) {
        const joint = joints.get(bone.name);
        if (joint) bone.linkTransformNode(joint);
      }
    for (const mesh of part.meshes) setMeshRole(mesh, "crew");
    for (const rootNode of part.rootNodes)
      rootNode.parent = socket ? (socketNodes[socket] ?? visual) : visual;
    attached.add(part);
    return () => {
      if (!attached.delete(part)) return;
      part.dispose();
    };
  };

  // ------------------------------------------------------------------ layered playback
  const masked = new Map<string, AnimationGroup>();
  const owned: AnimationGroup[] = [];
  const studyClips = new Map(
    studyAnimationSource?.animationGroups.map((group) => [group.name, group]) ??
      [],
  );
  const hasClip = (name: string) => clips.has(name) || studyClips.has(name);
  const ensureClip = (name: string) => {
    const existing = clips.get(name);
    if (existing) return existing;
    const source = studyClips.get(name);
    if (!source) return undefined;
    const clone = source.clone(
      source.name,
      (target: { name?: string }) =>
        (target?.name && (joints.get(target.name) ?? nodes.get(target.name))) ||
        target,
    );
    clone.stop();
    clips.set(name, clone);
    owned.push(clone);
    return clone;
  };
  const groupFor = (clip: VoxelCrewAction, mask: Mask) => {
    const source = ensureClip(clip);
    if (!source) return undefined;
    if (mask === "full") return source;
    const key = `${clip}|${mask}`;
    let g = masked.get(key);
    if (!g) {
      g = new AnimationGroup(`${clip}:${mask}`, scene);
      for (const ta of source.targetedAnimations) {
        const name = (ta.target as { name?: string })?.name ?? "";
        if (UPPER.has(name) === (mask === "upper"))
          g.addTargetedAnimation(ta.animation, ta.target);
      }
      g.normalize(source.from, source.to);
      masked.set(key, g);
      owned.push(g);
    }
    return g;
  };
  const resolveClip = (clip: VoxelCrewAction): VoxelCrewAction =>
    hasClip(clip) ? clip : (VOXEL_CREW_CLIP_FALLBACK[clip] ?? clip);
  const tracks = new Map<string, Track>();
  let blendElapsed = 0;
  let blendDuration = 0.2;
  let lastKey = "";
  let footPoseKey = "";
  const setDesired = (
    wanted: {
      clip: VoxelCrewAction;
      mask: Mask;
      loop: boolean;
      speed: number;
      restart?: boolean;
    }[],
    reducedMotion: boolean,
  ) => {
    // EVA clips authored in parallel: play the fallback while the bundle lacks one.
    wanted = wanted.map((w) => ({ ...w, clip: resolveClip(w.clip) }));
    const keys = new Set(wanted.map((w) => `${w.clip}|${w.mask}`));
    const signature = [...keys].sort().join(",");
    for (const w of wanted) {
      const g = groupFor(w.clip, w.mask);
      if (!g) continue;
      const key = `${w.clip}|${w.mask}`;
      let t = tracks.get(key);
      const fresh = !t;
      if (!t) {
        t = { group: g, weight: 0, from: 0, target: 1 };
        tracks.set(key, t);
      }
      // Non-looping base clips (death) play once and hold; loops restart if something stopped them.
      if (fresh || w.restart || (w.loop && !g.isPlaying)) {
        g.start(w.loop, w.speed, g.from, g.to);
        g.setWeightForAllAnimatables(t.weight);
      }
      g.speedRatio = w.speed;
      if (reducedMotion) {
        g.goToFrame(g.from);
        g.pause();
      }
    }
    if (signature === lastKey) return;
    const next = wanted.map((w) => w.clip).join("+");
    blendDuration =
      reducedMotion || !lastKey ? 0 : voxelCrewBlendDuration(lastKey, next);
    // Ground anchors from a gait or full-body action may be unreachable in the next pose.
    // Keep the clamp through the actual lower-body blend, then plant fresh stance contacts.
    const nextFootPose = wanted
      .filter((w) => w.mask !== "upper")
      .map((w) => `${w.clip}|${w.mask}`)
      .sort()
      .join(",");
    if (nextFootPose !== footPoseKey) {
      footPoseKey = nextFootPose;
      footSettleS = blendDuration;
      footPlanting?.reset();
    }
    lastKey = signature;
    blendElapsed = 0;
    for (const [key, t] of tracks) {
      t.from = t.weight;
      t.target = keys.has(key) ? 1 : 0;
    }
    if (blendDuration === 0) applyBlend(1);
  };
  const applyBlend = (progress: number) => {
    for (const [key, t] of tracks) {
      t.weight = t.from + (t.target - t.from) * progress;
      t.group.setWeightForAllAnimatables(t.weight);
      if (t.weight <= 0.0001 && t.target === 0) {
        t.group.stop();
        tracks.delete(key);
      }
    }
  };
  const blendObserver = scene.onBeforeRenderObservable.add(() => {
    if (blendElapsed >= blendDuration) return;
    // Keep pace with the clips, which advance by wall time: with the old 0.1 s cap, a slow frame
    // let a short hold clip (death) finish while still fading in and freeze the body in a partial
    // blend instead of the held final pose.
    const frameMs = Math.max(
      scene.getEngine().getDeltaTime(),
      (scene.deltaTime ?? 0) * (scene.animationTimeScale ?? 1),
    );
    blendElapsed += Math.min(Scene.MaxDeltaTime, frameMs) / 1000;
    applyBlend(blendProgress(blendElapsed, blendDuration));
  });

  // ------------------------------------------------------------------ state
  let disposed = false;
  let appearance: CrewAppearance = {};
  let lastMotion: VoxelCrewMotion = { moving: false, seated: false };
  let lastShot: number | bigint | undefined;
  let lastAction: number | undefined;
  let oneShot:
    | { clip: VoxelCrewAction; layer: "upper" | "full"; group: AnimationGroup }
    | undefined;
  let layers: VoxelCrewLayers | undefined;
  let variant: VoxelCrewVariant = "male";
  let armedClass: string | null = null;
  const armedLoops = (clip: string) =>
    /\.(idle_armed|walk_armed|run_armed|aim)$/.test(clip);
  const loops = (clip: VoxelCrewAction) =>
    clip.includes(".") ? armedLoops(clip) : voxelCrewLoops(clip);
  let outfit: VoxelCrewOutfit = { ...VOXEL_CREW_DEFAULT_OUTFIT };
  // Review harnesses may force a layer; the game derives the outfit from equipment.
  let outfitOverride: Partial<VoxelCrewOutfit> = {};
  const regionalLayers = study
    ? undefined
    : createCrewRegionalLayers(container.meshes);
  const studyCoverage = study
    ? createStudyBaseCoverage(container.meshes)
    : undefined;
  let studyCovered = new Set<string>();
  let armourCloth = crewArmorClothRegions([]);
  const face = createVoxelFace(
    scene,
    container.materials.find(
      (m): m is PBRMaterial =>
        m instanceof PBRMaterial && /^crew\.face(\.\d+)?$/.test(m.name),
    ),
    options.random,
    { flipRows: !study },
  );

  const studyRegistry = study ? studyMaterials(container.materials) : undefined;
  const customize = (next: CrewAppearance) => {
    if (disposed) return;
    appearance = { ...appearance, ...next };
    const colors = study
      ? studyCrewPalette(appearance)
      : voxelCrewSlotColors(appearance);
    studyRegistry?.setPalette(colors);
    for (const material of container.materials) {
      if (!(material instanceof PBRMaterial)) continue;
      setPbrLightBudget(material, GAME_PBR_LIGHT_LIMIT);
      if (studyRegistry) continue;
      const slot = material.name.replace(/^crew\./, "").replace(/\.\d+$/, "");
      if (slot === "face") continue;
      const hex = colors[slot];
      if (hex && /^#[0-9a-f]{6}$/i.test(hex)) {
        const linear = Color3.FromHexString(hex).toLinearSpace();
        material.albedoColor = linear;
        if (slot === "emit") material.emissiveColor = linear;
      }
      if (material.emissiveIntensity > CREW_EMISSIVE_INTENSITY)
        material.emissiveIntensity = CREW_EMISSIVE_INTENSITY;
    }
    face.setTints({ skin: hexToRgb(colors.skin), hair: hexToRgb(colors.hair) });
    variant = voxelCrewVariant(appearance);
    const r = resolveCrewAppearance(appearance);
    outfit = {
      ...voxelCrewOutfitFor(appearance.equippedComponents),
      ...outfitOverride,
    };
    const hairHidden = r.hairStyle === "none" || !!r.equippedComponents?.helmet;
    refreshRegions(hairHidden);
  };
  const hiddenRegions = new Set<VoxelCrewBodyRegion>();
  // the runtime bundle ships masculine + feminine meshes; neutral renders the masculine build
  const hasNeutral = container.meshes.some((m) => m.name.includes("-neutral"));
  const meshVariant = () =>
    variant === "neutral" && !hasNeutral ? "male" : variant;
  let hairHiddenByLook = false;
  const refreshRegions = (hairHidden = hairHiddenByLook) => {
    hairHiddenByLook = hairHidden;
    const byOutfit = new Set(voxelCrewHiddenRegions(outfit));
    for (const mesh of container.meshes) {
      const match =
        /^GEO-crew-(base|hands|head_low|head|suit|gear|hair-default)-(male|female|neutral)/.exec(
          mesh.name,
        );
      if (!match) continue;
      const region = (
        match[1] === "hair-default" ? "hair" : match[1]
      ) as VoxelCrewBodyRegion;
      const hidden =
        (!study && byOutfit.has(region)) ||
        (study &&
          (region as string) === "head_low" &&
          !studyCovered.has("scalp")) ||
        (study && region === "head" && studyCovered.has("scalp")) ||
        (study &&
          (region as string) === "head_low" &&
          hiddenRegions.has("head")) ||
        hiddenRegions.has(region) ||
        (region === "hair" && (hairHidden || hiddenRegions.has("head")));
      mesh.setEnabled(match[2] === meshVariant() && !hidden);
    }
    const uniform = appearance.equippedComponents?.uniform;
    const eva = !!uniform && crewWardrobeItem(uniform)?.eva === "suit";
    studyCoverage?.refresh(meshVariant(), studyCovered);
    regionalLayers?.refresh(
      meshVariant(),
      outfit.suit,
      armourCloth,
      eva,
      hiddenRegions,
    );
  };
  // face: the driving clip's expression track each frame, plus the blink timer
  const faceObserver = scene.onBeforeRenderObservable.add(() => {
    const dt = Math.min(0.1, scene.getEngine().getDeltaTime() / 1000);
    const driver =
      oneShot?.clip ??
      (layers ? ("full" in layers ? layers.full : layers.upper) : undefined);
    if (driver) {
      const g = oneShot?.group ?? clips.get(driver);
      const frame = g?.animatables[0]?.masterFrame ?? 0;
      const authoredFrame = study
        ? ((frame - (g?.from ?? 0)) * 24) /
          (g?.targetedAnimations[0]?.animation.framePerSecond ?? 60)
        : frame - (g?.from ?? 0);
      const expression = study
        ? CREW_STUDY.clips[driver]?.expressionTrack
            ?.filter(([at, id]) => at <= authoredFrame && id !== "blink")
            .at(-1)?.[1]
        : voxelCrewExpressionAt(driver, authoredFrame);
      face.setTrackExpression(expression);
    }
    face.tick(dt);
  });
  if (options.faceAtlas)
    face.setAtlas(options.faceAtlas.atlas, options.faceAtlas.image);
  else if (
    !study &&
    options.faceAtlas === undefined &&
    typeof fetch === "function" &&
    typeof OffscreenCanvas !== "undefined"
  )
    loadVoxelFaceAtlas(VOXEL_CREW_FACE_ATLAS_URL, VOXEL_CREW_FACE_IMAGE_URL)
      .then(({ atlas, image }) => {
        if (!disposed) face.setAtlas(atlas, image);
      })
      .catch(() => {
        // keep the GLB's baked neutral face
      });

  let override: Partial<VoxelCrewMotion> | undefined;
  let lastInput: VoxelCrewMotion = { moving: false, seated: false };
  const update = (input: VoxelCrewMotion) => {
    const motion = override ? { ...input, ...override } : input;
    lastInput = input;
    lastMotion = motion;
    if (disposed) return;
    const fallback = resolveCrewAppearance(appearance).weapon;
    const weapon = voxelCrewWeapon(
      motion,
      fallback === "pistol" || fallback === "rifle" ? fallback : "none",
    );
    layers = selectVoxelCrewLayers(motion, weapon);
    if (
      armedClass &&
      !motion.eva &&
      !motion.seated &&
      !motion.dead &&
      !motion.downed &&
      !motion.climbing &&
      !motion.carrying &&
      !motion.hovering
    ) {
      const has = (c: string) => hasClip(`${armedClass}.${c}`);
      const name = (c: string) => `${armedClass}.${c}` as VoxelCrewAction;
      const aimClip =
        motion.combat && !motion.sprinting && has("aim")
          ? name("aim")
          : undefined;
      if (motion.moving) {
        const loco =
          motion.sprinting && has("run_armed")
            ? name("run_armed")
            : has("walk_armed")
              ? name("walk_armed")
              : undefined;
        // The armed clips' own legs take short strides (0.8 m/s walk, 2.5 m/s run authored): at
        // gameplay speed they slid. The base walk/run legs, rate-matched to ground speed, carry the
        // armed upper body (weapon, support hand); the upper layer keeps the legs' cycle period.
        const legs: VoxelCrewAction =
          "lower" in layers ? layers.lower : layers.full;
        const speedRatio = voxelCrewSpeedRatio(legs, motion);
        const period = (c: VoxelCrewAction) => {
          const g = ensureClip(c);
          return g ? g.to - g.from : 0;
        };
        const upperSpeedRatio =
          loco && period(legs) > 0
            ? (speedRatio * period(loco)) / period(legs)
            : 1;
        if (loco)
          layers = aimClip
            ? { lower: legs, upper: aimClip, speedRatio }
            : { lower: legs, upper: loco, speedRatio, upperSpeedRatio };
      } else if (has("idle_armed"))
        // Item-bundle ready poses carry different leg rest heights. Retain the body bundle's
        // grounded idle legs while their weapon-specific upper pose and hand IK remain active.
        layers =
          aimClip && !motion.crouching
            ? { full: aimClip, speedRatio: 1 }
            : {
                lower: motion.crouching ? "crouch_idle" : "idle",
                upper: aimClip ?? name("idle_armed"),
                speedRatio: 1,
              };
    }
    // Seated / downed / dead / climbing bodies cancel any gesture or shot in progress.
    if (
      oneShot &&
      (motion.seated || motion.dead || motion.downed || motion.climbing)
    )
      oneShot = undefined;
    // one-shot triggers
    if (
      motion.shotSequence !== undefined &&
      lastShot !== undefined &&
      motion.shotSequence !== lastShot &&
      weapon !== "none"
    )
      startOneShot(
        armedClass && hasClip(`${armedClass}.shoot`)
          ? (`${armedClass}.shoot` as VoxelCrewAction)
          : weapon === "rifle"
            ? "shoot_rifle"
            : "shoot_pistol",
        motion,
      );
    lastShot = motion.shotSequence;
    if (
      motion.action &&
      motion.action.sequence !== lastAction &&
      lastAction !== undefined
    )
      startOneShot(motion.action.name, motion);
    lastAction = motion.action?.sequence ?? lastAction ?? -1;
    apply(motion);
  };

  const startOneShot = (clip: VoxelCrewAction, motion: VoxelCrewMotion) => {
    const layer = voxelCrewActionLayer(clip, motion.moving);
    const group = groupFor(clip, layer === "upper" ? "upper" : "full");
    if (!group) return;
    oneShot = { clip, layer, group };
    group.onAnimationGroupEndObservable.addOnce(() => {
      if (oneShot?.group === group) {
        oneShot = undefined;
        apply(lastMotion);
      }
    });
    apply(motion, true);
  };

  const apply = (motion: VoxelCrewMotion, restartOneShot = false) => {
    if (!layers) return;
    const reduced = !!motion.reducedMotion;
    const wanted: {
      clip: VoxelCrewAction;
      mask: Mask;
      loop: boolean;
      speed: number;
      restart?: boolean;
    }[] = [];
    const shot = oneShot;
    if (shot?.layer === "full") {
      wanted.push({
        clip: shot.clip,
        mask: "full",
        loop: false,
        speed: 1,
        restart: restartOneShot,
      });
    } else if ("full" in layers) {
      if (shot?.layer === "upper") {
        wanted.push({
          clip: layers.full,
          mask: "lower",
          loop: loops(layers.full),
          speed: layers.speedRatio,
        });
        wanted.push({
          clip: shot.clip,
          mask: "upper",
          loop: false,
          speed: 1,
          restart: restartOneShot,
        });
      } else
        wanted.push({
          clip: layers.full,
          mask: "full",
          loop: loops(layers.full),
          speed: layers.speedRatio,
        });
    } else {
      wanted.push({
        clip: layers.lower,
        mask: "lower",
        loop: true,
        speed: layers.speedRatio,
      });
      if (shot && shot.layer === "upper")
        wanted.push({
          clip: shot.clip,
          mask: "upper",
          loop: false,
          speed: 1,
          restart: restartOneShot,
        });
      else
        wanted.push({
          clip: layers.upper,
          mask: "upper",
          loop: loops(layers.upper),
          speed: layers.upperSpeedRatio ?? 1,
        });
    }
    if (study)
      for (const request of wanted) {
        if (CREW_STUDY.clips[request.clip]?.nominalSpeed)
          request.speed /= modelScale;
      }
    setDesired(wanted, reduced);
  };

  customize(appearance);
  update({ moving: false, seated: false });
  visual.setEnabled(true);
  return {
    /** Presentation choices used by linked held-item colours. */
    get appearance(): Readonly<CrewAppearance> {
      return appearance;
    },
    root,
    /** Parent of the body's glTF root; armour parts attach beside it. */
    model: visual,
    bundle: "voxel" as const,
    study,
    modelScale,
    update,
    customize(next: CrewAppearance) {
      customize(next);
      update(lastInput);
    },
    sockets,
    socketNodes,
    skeleton: container.skeletons[0],
    itemSockets,
    joints,
    attachPart,
    /** Hide regions replaced by attached parts (heads, gloves, boots, armour); see bodyMeshRegions. */
    setStudyCoverage(regions: Iterable<string>) {
      studyCovered = new Set(regions);
      refreshRegions();
    },
    setHiddenRegions(regions: Iterable<VoxelCrewBodyRegion>) {
      hiddenRegions.clear();
      for (const r of regions) hiddenRegions.add(r);
      refreshRegions();
    },
    /** Only successfully loaded equipment owns cloth/masks; no inventory inference. */
    setArmorCloth(slots: Iterable<CrewArmorSlot>) {
      if (disposed) return;
      armourCloth = crewArmorClothRegions(slots);
      refreshRegions();
    },
    /** Wardrobe: a suit replaces the underwear base body; gear gloves replace the bare hands. */
    setOutfit(next: Partial<VoxelCrewOutfit>) {
      outfitOverride = { ...outfitOverride, ...next };
      outfit = { ...outfit, ...next };
      refreshRegions();
    },
    get outfit() {
      return { ...outfit };
    },
    /** Animatable pixel face: setExpression / setViseme / blink / setLook / setAtlas / setTints. */
    face,
    /**
     * Support-hand IK: every frame after animations, socket.hand.L is solved onto `target`
     * (the held item's support socket: same axes as socket.hand.L). null releases the hand.
     */
    setSupportTarget(target: TransformNode | null) {
      supportTarget = target;
      if (!target) supportError = 0;
    },
    /** Exact authored support relative to the standing floor; never writes actor state. */
    setSeatContact(
      contact:
        | {
            lift: number;
            lean: number;
            footSupport: number;
            forward?: number;
            footForward?: number;
          }
        | undefined,
    ) {
      seatContact = contact;
      // Source pelvis rests within the authored chair pan. The accepted actor root stays put.
      if (study) visual.position.z = -(contact?.forward ?? 0);
    },
    /** Foot planting on the deck (default on; review harnesses compare with it off). */
    setFootIk(enabled: boolean) {
      footIk = enabled;
    },
    /** Remaining planted-foot error (m) from the last solve. */
    get footError() {
      return footPlanting?.error ?? 0;
    },
    /** Whether a held item currently owns the support-hand target (review diagnostics). */
    get supportActive() {
      return supportTarget !== null;
    },
    /** Remaining support-hand error (m) from the last solve (0 when the grip is reachable). */
    get supportError() {
      return supportError;
    },
    /** Current full/lower/upper clip selection (diagnostics and tests). */
    get layers() {
      return layers;
    },
    get variant() {
      return variant;
    },
    /** Whether the loaded bundle has this clip (EVA clips arrive in parallel). */
    hasClip(clip: string) {
      return hasClip(clip);
    },
    /** Lazily retarget a source clip for deterministic review without playing it. */
    prepareClip(name: string) {
      return ensureClip(name);
    },
    /** Masked clip keys currently blending toward full weight. */
    get activeClips() {
      return [...tracks]
        .filter(([, t]) => t.target === 1)
        .map(([k]) => k.replace("|full", "").replace("|", ":"))
        .sort();
    },
    /** Play a one-shot action (emote, reload, interact ...) over the current state. */
    /**
     * Presentation-only state override (review harnesses; future crouch/carry/climb hooks until
     * those states are authoritative). Merged over every incoming motion until cleared.
     */
    setMotionOverride(next: Partial<VoxelCrewMotion> | undefined) {
      override = next;
      update(lastInput);
    },
    /**
     * Register clips baked on a copy of crew_rig (e.g. CHAR-WEAPONS armed-actions.glb): each group is
     * retargeted onto this body's joints by bone name. Returns the registered clip names.
     */
    addClips(source: AssetContainer) {
      const names: string[] = [];
      for (const group of source.animationGroups) {
        const clone = group.clone(
          group.name,
          (target: { name?: string }) =>
            (target?.name &&
              (joints.get(target.name) ?? nodes.get(target.name))) ||
            target,
        );
        clone.stop();
        clips.set(group.name, clone);
        owned.push(clone);
        names.push(group.name);
      }
      return names;
    },
    /** Armed class ("rifle", "pistol", ...) whose `<class>.<clip>` clips drive idle/walk/run/aim/shoot; null = base set. */
    setArmedClass(cls: string | null) {
      armedClass = cls;
      update(lastInput);
    },
    play(action: VoxelCrewAction) {
      startOneShot(action, lastMotion);
    },
    /** The r002/r003 equipment pose controller targets the legacy 16-bone rig; not available here. */
    createPoseController: undefined,
    bindHeldEquipment(_value: unknown) {
      // Held items follow socket.hand.R through the authored aim/idle actions.
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      scene.onBeforeRenderObservable.remove(blendObserver);
      scene.onBeforeRenderObservable.remove(faceObserver);
      scene.onBeforeAnimationsObservable.remove(seatResetObserver);
      scene.onAfterAnimationsObservable.remove(ikObserver);
      face.dispose();
      for (const g of owned) g.dispose();
      if (options.studyAnimation) studyAnimationSource?.dispose();
      for (const part of attached) part.dispose();
      attached.clear();
      regionalLayers?.dispose();
      studyCoverage?.dispose();
      container.dispose();
      root.dispose();
    },
  };
}
