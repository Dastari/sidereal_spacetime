import type { Scene } from "@babylonjs/core/scene";
import type { Skeleton } from "@babylonjs/core/Bones/skeleton";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Material } from "@babylonjs/core/Materials/material";

/** Native small rigs only; reserve512 vec4s for the existing PBR/light path. */
export function uniformBonePaletteSupported(
  bones: number,
  maxVectors: number,
): boolean {
  return (
    Number.isInteger(bones) &&
    bones > 0 &&
    bones <= 32 &&
    Number.isFinite(maxVectors) &&
    maxVectors >= 512 + (bones + 1) * 8
  );
}
interface Trial {
  source: Mesh;
  mesh: Mesh;
  ready: boolean;
}
interface State {
  originalTexture: boolean;
  uniform: boolean;
  failed: boolean;
  skeleton: Skeleton;
  trialSkeleton?: Skeleton;
  trials: Trial[];
  prepared: Set<number>;
  materials: Map<number, number>;
  frames: number;
}
/** Owns a presentation-only storage mode, never rest poses, animation, or native source. */
export function createTemporalBonePalette(scene: Scene) {
  const states = new Map<Skeleton, State>();
  const warmMeshIds = new Set<number>();
  const visible = (mesh: Mesh) =>
    mesh.isEnabled() && mesh.isVisible && mesh.visibility > 0;
  const meshesFor = (skeleton: Skeleton) =>
    scene.meshes.filter(
      (m): m is Mesh =>
        m instanceof Mesh &&
        m.skeleton === skeleton &&
        !warmMeshIds.has(m.uniqueId),
    );
  function dirty(meshes: Mesh[], restoring: boolean) {
    for (const mesh of meshes) {
      // Babylon's texture-bone branch does not clear this previous uniform define.
      // Restore the original texture path explicitly instead of retaining stale velocity uniforms.
      if (restoring)
        for (const sub of mesh.subMeshes ?? [])
          if (sub.materialDefines)
            sub.materialDefines.BONES_VELOCITY_ENABLED = false;
      mesh.material?.markAsDirty(Material.AttributesDirtyFlag);
    }
  }
  function clearTrials(state: State) {
    for (const trial of state.trials) {
      warmMeshIds.delete(trial.mesh.uniqueId);
      trial.mesh.dispose(false, false);
    }
    state.trials = [];
    state.trialSkeleton?.dispose();
    state.trialSkeleton = undefined;
  }
  function restore(state: State) {
    if (!state.uniform) return false;
    state.skeleton.useTextureToStoreBoneMatrices = state.originalTexture;
    dirty(meshesFor(state.skeleton), state.originalTexture);
    state.uniform = false;
    return true;
  }
  function release(state: State) {
    const changed = restore(state);
    clearTrials(state);
    states.delete(state.skeleton);
    return changed;
  }
  function begin(skeleton: Skeleton, meshes: Mesh[]): State {
    const state: State = {
      originalTexture: skeleton.useTextureToStoreBoneMatrices,
      uniform: false,
      failed: false,
      skeleton,
      trials: [],
      prepared: new Set(),
      materials: new Map(),
      frames: 0,
    };
    states.set(skeleton, state);
    const trialSkeleton = skeleton.clone(
      "taa-palette-warmup-" + skeleton.uniqueId,
    );
    trialSkeleton.useTextureToStoreBoneMatrices = false;
    state.trialSkeleton = trialSkeleton;
    for (const source of meshes) {
      const mesh = source.clone(
        "taa-shader-warmup-" + source.uniqueId,
        null,
        true,
      );
      mesh.skeleton = trialSkeleton;
      mesh.isVisible = false;
      mesh.isPickable = false;
      mesh.setEnabled(false);
      warmMeshIds.add(mesh.uniqueId);
      state.trials.push({ source, mesh, ready: false });
      state.materials.set(source.uniqueId, source.material!.uniqueId);
    }
    return state;
  }
  return {
    update(enabled: boolean): {
      changed: boolean;
      pending: boolean;
      qualified: number;
    } {
      let changed = false,
        pending = false,
        qualified = 0;
      if (!enabled) {
        for (const state of [...states.values()])
          changed = release(state) || changed;
        return { changed, pending, qualified };
      }
      const sources = scene.skeletons.filter(
        (s) => ![...states.values()].some((state) => state.trialSkeleton === s),
      );
      for (const [skeleton, state] of [...states])
        if (!sources.includes(skeleton)) changed = release(state) || changed;
      let compileBudget = 4;
      for (const skeleton of sources.slice(0, 128)) {
        const meshes = meshesFor(skeleton).filter(visible);
        let state = states.get(skeleton);
        if (!meshes.length) {
          if (state) changed = release(state) || changed;
          continue;
        }
        const eligible =
          uniformBonePaletteSupported(
            skeleton.bones.length,
            scene.getEngine().getCaps().maxVertexUniformVectors,
          ) &&
          meshes.length <= 64 &&
          meshes.every(
            (m) =>
              m.material &&
              ["PBRMaterial", "StandardMaterial"].includes(
                m.material.getClassName(),
              ) &&
              m.subMeshes?.length &&
              m.numBoneInfluencers > 0,
          );
        if (!eligible) {
          if (state) changed = release(state) || changed;
          continue;
        }
        if (state?.failed) continue;
        if (state?.uniform) {
          if (
            meshes.every(
              (m) =>
                state!.prepared.has(m.uniqueId) &&
                state!.materials.get(m.uniqueId) === m.material!.uniqueId,
            )
          ) {
            qualified++;
            continue;
          }
          changed = release(state) || changed;
          state = undefined;
        }
        if (
          state &&
          !state.uniform &&
          (meshes.length !== state.trials.length ||
            meshes.some(
              (m) => state!.materials.get(m.uniqueId) !== m.material!.uniqueId,
            ))
        ) {
          clearTrials(state);
          states.delete(skeleton);
          state = undefined;
        }
        if (!state) {
          if (!skeleton.isUsingTextureForMatrices) continue;
          if ([...states.values()].some((value) => value.trials.length > 0)) {
            pending = true;
            continue;
          }
          state = begin(skeleton, meshes);
        }
        // Existing live texture shaders remain untouched while hidden clones compile.
        if (++state.frames > 120) {
          clearTrials(state);
          state.failed = true;
          continue;
        }

        for (const trial of state.trials) {
          if (trial.ready || compileBudget-- <= 0) continue;
          const material = trial.source.material;
          if (
            !material ||
            material.uniqueId !== state.materials.get(trial.source.uniqueId)
          ) {
            clearTrials(state);
            state.failed = true;
            break;
          }
          const swapping = material.allowShaderHotSwapping;
          material.allowShaderHotSwapping = false;
          try {
            trial.ready = trial.mesh.subMeshes.every((sub) =>
              material.isReadyForSubMesh(trial.mesh, sub, false),
            );
          } finally {
            material.allowShaderHotSwapping = swapping;
          }
        }
        if (state.failed) continue;
        if (state.trials.length && state.trials.every((t) => t.ready)) {
          for (const trial of state.trials)
            state.prepared.add(trial.source.uniqueId);
          skeleton.useTextureToStoreBoneMatrices = false;
          dirty(meshesFor(skeleton), false);
          state.uniform = true;
          clearTrials(state);
          changed = true;
          qualified++;
        } else pending = true;
      }
      return { changed, pending, qualified };
    },
    dispose() {
      for (const state of [...states.values()]) release(state);
    },
  };
}
