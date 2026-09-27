import type { Scene } from "@babylonjs/core/scene";
import { createIndirectLightingOverride } from "./debug-indirect-lighting";
import {
  createDebugOverlays,
  type DebugOverlaySources,
} from "./debug-overlays";

export type DebugFeature =
  | "lighting"
  | "equipment"
  | "shadows"
  | "glow"
  | "planets"
  | "characters"
  | "globalIllumination"
  | "skeleton"
  | "lightBounds"
  | "collision";
export type DebugFeatures = Record<DebugFeature, boolean>;
type EnabledNode = {
  isEnabled(checkAncestors?: boolean): boolean;
  setEnabled(value: boolean): unknown;
  isDisposed(): boolean;
};

/** Reversible local overrides layered after normal cutaway/power presentation. */
export function createDebugFeatures(
  scene: Scene,
  equipment: readonly EnabledNode[],
  characters: readonly EnabledNode[] = [],
  sources: DebugOverlaySources = {},
) {
  const flags: DebugFeatures = {
    lighting: true,
    equipment: true,
    shadows: true,
    glow: true,
    planets: true,
    characters: true,
    globalIllumination: true,
    skeleton: false,
    lightBounds: false,
    collision: false,
  };
  const initialFlags = { ...flags };
  const indirect = createIndirectLightingOverride(scene);
  let overlays: ReturnType<typeof createDebugOverlays> | undefined;
  const defaults = {
    lighting: scene.lightsEnabled,
    shadows: scene.shadowsEnabled,
  };
  const hidden = new Map<EnabledNode, boolean>();
  let frameKey: string | number | undefined;
  const effects = new Map<
    { isEnabled: boolean; isDisposed?: boolean },
    boolean
  >();
  function restoreEquipment() {
    for (const [node, enabled] of hidden)
      if (!node.isDisposed()) node.setEnabled(enabled);
    hidden.clear();
  }
  function apply() {
    indirect.apply(flags.globalIllumination);
    if (flags.skeleton || flags.lightBounds || flags.collision)
      overlays ??= createDebugOverlays(scene, sources);
    overlays?.setFlags(flags);
    scene.lightsEnabled = defaults.lighting && flags.lighting;
    // Babylon schedules shadow maps independently of lightsEnabled. Lighting
    // Off must close that gate too, while preserving the separate shadow intent.
    scene.shadowsEnabled =
      defaults.shadows && flags.shadows && scene.lightsEnabled;
    const suppressed = [
      ...(!flags.equipment ? equipment : []),
      ...(!flags.characters ? characters : []),
    ];
    for (const node of suppressed)
      if (!node.isDisposed()) {
        if (!hidden.has(node)) hidden.set(node, node.isEnabled(false));
        if (node.isEnabled(false)) node.setEnabled(false);
      }
    for (const effect of scene.effectLayers ?? []) {
      if (!flags.glow) {
        if (!effects.has(effect)) effects.set(effect, effect.isEnabled);
        effect.isEnabled = false;
      } else if (effects.has(effect)) {
        effect.isEnabled = effects.get(effect)!;
        effects.delete(effect);
      }
    }
  }
  return {
    snapshot: () => ({ ...flags }),
    overlaySnapshot: () =>
      overlays?.snapshot() ?? {
        skeletons: 0,
        lights: 0,
        collisionFrames: 0,
        collisionScopes: [],
      },
    toggle(key: DebugFeature) {
      flags[key] = !flags[key];
      restoreEquipment();
      apply();
    },
    beforeFrame(key?: string | number) {
      // Restore first so normal lighting/environment updates can supply fresh
      // values; the local GI override is layered over those in afterFrame.
      indirect.restore();
      if (key === undefined || key !== frameKey) {
        restoreEquipment();
        frameKey = key;
      }
    },
    afterFrame: apply,
    reset() {
      Object.assign(flags, initialFlags);
      restoreEquipment();
      apply();
    },
    dispose() {
      restoreEquipment();
      indirect.dispose();
      overlays?.dispose();
      scene.lightsEnabled = defaults.lighting;
      scene.shadowsEnabled = defaults.shadows;
      for (const [effect, enabled] of effects) effect.isEnabled = enabled;
      effects.clear();
    },
  };
}
