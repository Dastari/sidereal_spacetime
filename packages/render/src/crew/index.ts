import { setMeshRole } from '../mesh-roles';
import { MODULAR_CREW_ASSET_URL } from "@sidereal/content/character-components";
import { createCombatPose } from "./combat-pose";
import { createEquipmentPoseController } from "./equipment-pose";
import { equipmentPoseArmorBulk } from "./equipment-pose-bulk";
import type { EquipmentAimSource } from "../equipment/anchors";
import { strideFrame, crewBlendDuration, blendProgress } from "./animation";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import "@babylonjs/loaders/glTF";

import {
  resolveCrewAppearance,
  crewSlotVisible,
  type CrewAppearance,
} from "./appearance";
export { CREW_OUTFITS, resolveCrewAppearance } from "./appearance";
export type { CrewAppearance } from "./appearance";

export type CrewMotion = {
  combat?: boolean;
  moving: boolean;
  seated: boolean;
  sprinting?: boolean;
  weaponPose?: "none" | "one-handed" | "rifle";
  reducedMotion?: boolean;
  speed?: number;
};

/** Presentation only. The caller owns the ship-frame placement and heading. */
export async function createCrewVisual(
  scene: Scene,
  parent: TransformNode,
  assetUrl: string | ArrayBufferView = MODULAR_CREW_ASSET_URL,
) {
  const container = await SceneLoader.LoadAssetContainerAsync(
    "",
    assetUrl,
    scene,
    undefined,
    ".glb",
  );
  const root = new TransformNode("crew-placement", scene);
  root.parent = parent;
  const visual = new TransformNode("crew-model", scene);
  visual.parent = root;
  // glTF export converts Blender forward -Y into +Z; gameplay uses -Z.
  visual.rotation.y = Math.PI;
  container.addAllToScene();
  for (const mesh of container.meshes) setMeshRole(mesh, 'crew');
  for (const node of container.rootNodes) node.parent = visual;
  const modular = container.meshes.some((m) => m.name.startsWith("GEO-base-"));
  const clips = new Map(
    container.animationGroups.map((group) => [group.name, group]),
  );
  for (const group of clips.values()) group.stop();
  let active = "";
  const weights = new Map<string, number>();
  let desired = "Idle";
  let blendFrom: Map<string, number> | undefined;
  let blendElapsed = 0;
  let blendDuration = 0.18;
  const blendObserver = scene.onBeforeRenderObservable.add(() => {
    if (!blendFrom) return;
    blendElapsed += Math.min(0.1, scene.getEngine().getDeltaTime() / 1000);
    const progress = blendProgress(blendElapsed, blendDuration);
    for (const [name, group] of clips) {
      const next =
        (blendFrom.get(name) ?? 0) * (1 - progress) +
        (name === desired ? progress : 0);
      group.setWeightForAllAnimatables(next);
      weights.set(name, next);
      if (next === 0 && name !== desired) group.stop();
    }
    if (progress === 1) blendFrom = undefined;
  });
  let disposed = false;
  let appearance: CrewAppearance = {};
  let resolved = resolveCrewAppearance(appearance);
  let lastMotion: CrewMotion = { moving: false, seated: false };
  const sockets = {} as Record<
    "handR" | "handL" | "back" | "hip",
    TransformNode
  >;
  for (const [slot, bone] of Object.entries({
    handR: "hand.R",
    handL: "hand.L",
    back: "spine",
    hip: "pelvis",
  })) {
    const socket = new TransformNode(`crew-socket-${slot}`, scene);
    socket.parent =
      container.transformNodes.find((node) => node.name === bone) ?? visual;
    if (slot.startsWith("hand")) {
      socket.rotation.x = Math.PI / 2;
      socket.position.y = 0.055;
    } else {
      // Upright torso bones already provide +Y up; the back socket faces outward.
      socket.position.set(
        slot === "hip" ? 0.23 : 0,
        0.12,
        slot === "back" ? -0.27 : 0,
      );
    }
    sockets[slot as keyof typeof sockets] = socket;
  }
  const combatPose = createCombatPose(scene, root, container.transformNodes);
  let equipmentPose:
    ReturnType<typeof createEquipmentPoseController> | undefined;
  const customize = (next: CrewAppearance) => {
    if (disposed) return;
    // Selecting a new outfit resets its slots; skin/hair colors remain character choices.
    if (next.outfit && next.outfit !== (appearance.outfit ?? "crew"))
      appearance = {
        ...(appearance.skin !== undefined ? { skin: appearance.skin } : {}),
        ...(appearance.hair !== undefined ? { hair: appearance.hair } : {}),
        weapon: resolved.weapon,
        ...next,
      };
    else appearance = { ...appearance, ...next };
    resolved = resolveCrewAppearance(appearance);
    equipmentPose?.setArmorBulk(
      equipmentPoseArmorBulk(
        modular ? resolved.equippedComponents : undefined,
        resolved.armor,
      ),
    );
    for (const material of container.materials) {
      if (!(material instanceof PBRMaterial)) continue;
      material.maxSimultaneousLights = 8;
      // Per-item palettes stay authored; only shared base skin/hair roles accept cosmetics.
      if (material.name.startsWith("component.")) continue;
      const role = material.name
        .replace(/^crew\./, "")
        .replace(/\.modular(?:\.\d+)?$/, "") as keyof typeof resolved;
      const color = resolved[role];
      if (typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color)) {
        const linear = Color3.FromHexString(color).toLinearSpace();
        material.albedoColor = linear;
        if (role === "light") {
          material.emissiveColor = linear;
          // Blender normalizes export factors by the default palette maximum.
          // Restore the authored intensity once after replacing that factor.
          material.emissiveIntensity = 1.3;
        }
      }
    }
    for (const mesh of container.meshes) {
      const slot =
        mesh.metadata?.gltf?.extras?.component_id ??
        mesh.name
          .replace(/^GEO-/, "")
          .replace(/_primitive\d+$/, "")
          .replace(/\.\d+$/, "");
      if (mesh.name.startsWith("GEO-"))
        mesh.setEnabled(crewSlotVisible(slot, resolved, modular));
    }
  };
  const update = (motion: CrewMotion) => {
    lastMotion = motion;
    if (disposed) return;
    const gait = motion.seated
      ? "Seated"
      : motion.moving
        ? motion.sprinting
          ? "Sprint"
          : "Walk"
        : "Idle";
    const weapon =
      motion.weaponPose ??
      (resolved.weapon === "pistol"
        ? "one-handed"
        : resolved.weapon === "rifle"
          ? "rifle"
          : "none");
    combatPose.update(
      !!motion.combat && !equipmentPose?.isBound,
      motion.seated,
      weapon === "rifle",
      !!motion.reducedMotion,
    );
    const clip =
      gait +
      (weapon === "one-handed"
        ? "-Pistol"
        : weapon === "rifle"
          ? "-Rifle"
          : "");
    const state = `${clip}:${!!motion.reducedMotion}`;
    if (state !== active) {
      const previousClip = active.split(":")[0];
      const previousGroup = clips.get(previousClip);
      const previousFrame = previousGroup?.getCurrentFrame();
      blendDuration = crewBlendDuration(previousClip, clip);
      desired = clip;
      const group = clips.get(clip);
      if (motion.reducedMotion || active === "" || active.endsWith(":true")) {
        blendFrom = undefined;
        for (const [name, item] of clips) {
          item.stop();
          weights.set(name, 0);
        }
        group?.start(true);
        group?.setWeightForAllAnimatables(1);
        weights.set(clip, 1);
      } else {
        blendFrom = new Map(weights);
        blendElapsed = 0;
        if (!group?.isPlaying) {
          group?.start(true);
          // Weapon swaps and walk/sprint changes preserve support/recovery phase.
          if (
            group &&
            previousGroup &&
            previousFrame !== undefined &&
            /^(Walk|Sprint)/.test(previousClip) &&
            /^(Walk|Sprint)/.test(clip)
          )
            group.goToFrame(
              strideFrame(
                {
                  from: previousGroup.from,
                  to: previousGroup.to,
                  frame: previousFrame,
                },
                group,
              ),
            );
        }
        group?.setWeightForAllAnimatables(weights.get(clip) ?? 0);
      }
      if (motion.reducedMotion && group) {
        group.goToFrame(group.from);
        group.pause();
      }
      active = state;
    }
    const group = clips.get(clip);
    if (group)
      group.speedRatio =
        gait === "Walk" || gait === "Sprint"
          ? Math.max(
              0.5,
              Math.min(2, Number.isFinite(motion.speed) ? motion.speed! : 1),
            )
          : 1;
  };
  customize(appearance);
  update({ moving: false, seated: false });
  return {
    root,
    update,
    customize(next: CrewAppearance) {
      customize(next);
      update(lastMotion);
    },
    sockets,
    /** Opt-in specialist controller. Shared integration supplies intent and item binding. */
    createPoseController() {
      if (disposed) throw new Error("Crew visual disposed");
      equipmentPose ??= createEquipmentPoseController(
        scene,
        root,
        visual,
        container.transformNodes,
        { R: sockets.handR, L: sockets.handL },
      );
      equipmentPose.setArmorBulk(
        equipmentPoseArmorBulk(
          modular ? resolved.equippedComponents : undefined,
          resolved.armor,
        ),
      );
      combatPose.update(false, false, false, false);
      return equipmentPose;
    },
    bindHeldEquipment(value: EquipmentAimSource | undefined) {
      combatPose.bind(value);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      scene.onBeforeRenderObservable.remove(blendObserver);
      combatPose.dispose();
      equipmentPose?.dispose();
      container.dispose();
      root.dispose();
    },
  };
}
