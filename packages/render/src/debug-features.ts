import type { Scene } from "@babylonjs/core/scene";

export type DebugFeature =
  "lighting" | "equipment" | "shadows" | "glow" | "planets" | "characters";
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
) {
  const flags: DebugFeatures = {
    lighting: true,
    equipment: true,
    shadows: true,
    glow: true,
    planets: true,
    characters: true,
  };
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
    toggle(key: DebugFeature) {
      flags[key] = !flags[key];
      restoreEquipment();
      apply();
    },
    beforeFrame(key?: string | number) {
      if (key === undefined || key !== frameKey) {
        restoreEquipment();
        frameKey = key;
      }
    },
    afterFrame: apply,
    reset() {
      for (const key of Object.keys(flags) as DebugFeature[]) flags[key] = true;
      restoreEquipment();
      apply();
    },
    dispose() {
      restoreEquipment();
      scene.lightsEnabled = defaults.lighting;
      scene.shadowsEnabled = defaults.shadows;
      for (const [effect, enabled] of effects) effect.isEnabled = enabled;
      effects.clear();
    },
  };
}
