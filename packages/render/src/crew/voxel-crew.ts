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
  VOXEL_CREW_ASSET_URL,
  VOXEL_CREW_SOCKETS,
  VOXEL_CREW_UPPER_BONES,
  type VoxelCrewAction,
  type VoxelCrewSocket,
  type VoxelCrewVariant,
} from "@sidereal/content/crew-voxel-bundle";
import { setMeshRole } from "../mesh-roles";
import { resolveCrewAppearance, type CrewAppearance } from "./appearance";
import {
  selectVoxelCrewLayers,
  voxelCrewActionLayer,
  voxelCrewBlendDuration,
  voxelCrewLoops,
  voxelCrewWeapon,
  type VoxelCrewLayers,
  type VoxelCrewMotion,
} from "./voxel-crew-clips";
import { blendProgress } from "./animation";

type Mask = "full" | "upper" | "lower";
export type VoxelCrewBodyRegion = "body" | "head" | "hands" | "feet" | "hair";
type Track = { group: AnimationGroup; weight: number; from: number; target: number };

const UPPER = new Set<string>(VOXEL_CREW_UPPER_BONES);

/** Map legacy appearance roles onto the voxel material slots (colour only, never geometry). */
export function voxelCrewSlotColors(appearance: CrewAppearance): Record<string, string> {
  const r = resolveCrewAppearance(appearance);
  const darker = (hex: string, k: number) => {
    const c = Color3.FromHexString(hex);
    return new Color3(c.r * k, c.g * k, c.b * k).toHexString();
  };
  return {
    skin: r.skin,
    hair: r.hair,
    suit_primary: r.suit,
    suit_secondary: darker(r.suit, 0.6),
    accent: r.accent,
    metal: r.trim,
    emit: r.light,
    glass: r.visor,
  };
}

export function voxelCrewVariant(appearance: CrewAppearance): VoxelCrewVariant {
  const body = resolveCrewAppearance(appearance).bodyType as string;
  return body === "female" || body === "neutral" ? body : "male";
}

/**
 * Presentation only: the voxel crew bundle (CHAR-BODY r001, proposal art) with Babylon
 * AnimationGroups mapped to gameplay states. Same outward shape as the legacy createCrewVisual
 * so the world can switch bundles behind an explicit preview flag.
 */
export async function createVoxelCrewVisual(
  scene: Scene,
  parent: TransformNode,
  assetUrl: string | ArrayBufferView = VOXEL_CREW_ASSET_URL,
) {
  const container: AssetContainer = await SceneLoader.LoadAssetContainerAsync("", assetUrl, scene, undefined, ".glb");
  const root = new TransformNode("crew-placement", scene);
  root.parent = parent;
  const visual = new TransformNode("crew-model", scene);
  visual.parent = root;
  // crew_rig faces Blender +Y, exported as glTF -Z, which is already gameplay forward.
  container.addAllToScene();
  for (const mesh of container.meshes) setMeshRole(mesh, "crew");
  for (const node of container.rootNodes) node.parent = visual;
  const nodes = new Map(container.transformNodes.map((n) => [n.name, n]));
  const clips = new Map(container.animationGroups.map((g) => [g.name as VoxelCrewAction, g]));
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
    node.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), -Math.PI / 2);
    return node;
  };
  const itemSockets = { R: itemSocket("R"), L: itemSocket("L") };
  /** Joint nodes by crew_rig bone name (armour / heads re-link their skins to these). */
  const joints = new Map<string, TransformNode>();
  for (const bone of container.skeletons[0]?.bones ?? []) {
    const node = bone.getTransformNode();
    if (node) joints.set(bone.name, node);
  }
  const attached = new Set<AssetContainer>();
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
  const groupFor = (clip: VoxelCrewAction, mask: Mask) => {
    const source = clips.get(clip);
    if (!source) return undefined;
    if (mask === "full") return source;
    const key = `${clip}|${mask}`;
    let g = masked.get(key);
    if (!g) {
      g = new AnimationGroup(`${clip}:${mask}`, scene);
      for (const ta of source.targetedAnimations) {
        const name = (ta.target as { name?: string })?.name ?? "";
        if (UPPER.has(name) === (mask === "upper")) g.addTargetedAnimation(ta.animation, ta.target);
      }
      g.normalize(source.from, source.to);
      masked.set(key, g);
      owned.push(g);
    }
    return g;
  };
  const tracks = new Map<string, Track>();
  let blendElapsed = 0;
  let blendDuration = 0.2;
  let lastKey = "";
  const setDesired = (
    wanted: { clip: VoxelCrewAction; mask: Mask; loop: boolean; speed: number; restart?: boolean }[],
    reducedMotion: boolean,
  ) => {
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
    blendDuration = reducedMotion || !lastKey ? 0 : voxelCrewBlendDuration(lastKey, next);
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
    blendElapsed += Math.min(0.1, scene.getEngine().getDeltaTime() / 1000);
    applyBlend(blendProgress(blendElapsed, blendDuration));
  });

  // ------------------------------------------------------------------ state
  let disposed = false;
  let appearance: CrewAppearance = {};
  let lastMotion: VoxelCrewMotion = { moving: false, seated: false };
  let lastShot: number | bigint | undefined;
  let lastAction: number | undefined;
  let oneShot: { clip: VoxelCrewAction; layer: "upper" | "full"; group: AnimationGroup } | undefined;
  let layers: VoxelCrewLayers | undefined;
  let variant: VoxelCrewVariant = "male";

  const customize = (next: CrewAppearance) => {
    if (disposed) return;
    appearance = { ...appearance, ...next };
    const colors = voxelCrewSlotColors(appearance);
    for (const material of container.materials) {
      if (!(material instanceof PBRMaterial)) continue;
      material.maxSimultaneousLights = 8;
      const slot = material.name.replace(/^crew\./, "").replace(/\.\d+$/, "");
      const hex = colors[slot];
      if (hex && /^#[0-9a-f]{6}$/i.test(hex)) {
        const linear = Color3.FromHexString(hex).toLinearSpace();
        material.albedoColor = linear;
        if (slot === "emit") material.emissiveColor = linear;
      }
    }
    variant = voxelCrewVariant(appearance);
    const r = resolveCrewAppearance(appearance);
    const hairHidden = r.hairStyle === "none" || !!r.equippedComponents?.helmet;
    refreshRegions(hairHidden);
  };
  const hiddenRegions = new Set<VoxelCrewBodyRegion>();
  let hairHiddenByLook = false;
  const refreshRegions = (hairHidden = hairHiddenByLook) => {
    hairHiddenByLook = hairHidden;
    for (const mesh of container.meshes) {
      const match = /^GEO-crew-(body|head|hands|feet|hair-default)-(male|female|neutral)/.exec(mesh.name);
      if (!match) continue;
      const region = (match[1] === "hair-default" ? "hair" : match[1]) as VoxelCrewBodyRegion;
      const hidden =
        hiddenRegions.has(region) || (region === "hair" && (hairHidden || hiddenRegions.has("head")));
      mesh.setEnabled(match[2] === variant && !hidden);
    }
  };

  let override: Partial<VoxelCrewMotion> | undefined;
  let lastInput: VoxelCrewMotion = { moving: false, seated: false };
  const update = (input: VoxelCrewMotion) => {
    const motion = override ? { ...input, ...override } : input;
    lastInput = input;
    lastMotion = motion;
    if (disposed) return;
    const fallback = resolveCrewAppearance(appearance).weapon;
    const weapon = voxelCrewWeapon(motion, fallback === "pistol" || fallback === "rifle" ? fallback : "none");
    layers = selectVoxelCrewLayers(motion, weapon);
    // Seated / downed / dead / climbing bodies cancel any gesture or shot in progress.
    if (oneShot && (motion.seated || motion.dead || motion.downed || motion.climbing)) oneShot = undefined;
    // one-shot triggers
    if (motion.shotSequence !== undefined && lastShot !== undefined && motion.shotSequence !== lastShot && weapon !== "none")
      startOneShot(weapon === "rifle" ? "shoot_rifle" : "shoot_pistol", motion);
    lastShot = motion.shotSequence;
    if (motion.action && motion.action.sequence !== lastAction && lastAction !== undefined)
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
    const wanted: { clip: VoxelCrewAction; mask: Mask; loop: boolean; speed: number; restart?: boolean }[] = [];
    const shot = oneShot;
    if ("full" in layers) {
      if (shot?.layer === "full") {
        wanted.push({ clip: shot.clip, mask: "full", loop: false, speed: 1, restart: restartOneShot });
      } else if (shot?.layer === "upper") {
        wanted.push({ clip: layers.full, mask: "lower", loop: voxelCrewLoops(layers.full), speed: layers.speedRatio });
        wanted.push({ clip: shot.clip, mask: "upper", loop: false, speed: 1, restart: restartOneShot });
      } else wanted.push({ clip: layers.full, mask: "full", loop: voxelCrewLoops(layers.full), speed: layers.speedRatio });
    } else {
      wanted.push({ clip: layers.lower, mask: "lower", loop: true, speed: layers.speedRatio });
      if (shot && shot.layer === "upper")
        wanted.push({ clip: shot.clip, mask: "upper", loop: false, speed: 1, restart: restartOneShot });
      else wanted.push({ clip: layers.upper, mask: "upper", loop: voxelCrewLoops(layers.upper), speed: 1 });
    }
    setDesired(wanted, reduced);
  };

  customize(appearance);
  update({ moving: false, seated: false });
  return {
    root,
    bundle: "voxel" as const,
    update,
    customize(next: CrewAppearance) {
      customize(next);
      update(lastInput);
    },
    sockets,
    socketNodes,
    itemSockets,
    joints,
    attachPart,
    /** Hide base regions replaced by attached parts (heads, gloves, boots); the core body stays. */
    setHiddenRegions(regions: Iterable<VoxelCrewBodyRegion>) {
      hiddenRegions.clear();
      for (const r of regions) if (r !== "body") hiddenRegions.add(r);
      refreshRegions();
    },
    /** Current full/lower/upper clip selection (diagnostics and tests). */
    get layers() {
      return layers;
    },
    get variant() {
      return variant;
    },
    /** Masked clip keys currently blending toward full weight. */
    get activeClips() {
      return [...tracks].filter(([, t]) => t.target === 1).map(([k]) => k.replace("|full", "").replace("|", ":")).sort();
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
      for (const g of owned) g.dispose();
      for (const part of attached) part.dispose();
      attached.clear();
      container.dispose();
      root.dispose();
    },
  };
}
