import type { Scene } from "@babylonjs/core/scene";

/** Session-only experiment shared by current and later own/remote owners. */
const settings = new WeakMap<
  Scene,
  { enabled: boolean; owners: Set<(enabled: boolean) => void> }
>();

function state(scene: Scene) {
  let value = settings.get(scene);
  if (!value) {
    value = { enabled: false, owners: new Set() };
    settings.set(scene, value);
  }
  return value;
}

export function setSceneExhaustInstances(scene: Scene, enabled: boolean) {
  const value = state(scene);
  value.enabled = enabled;
  for (const owner of value.owners) owner(enabled);
}

export function registerExhaustInstanceSetting(
  scene: Scene,
  owner: (enabled: boolean) => void,
  initial?: boolean,
) {
  const value = state(scene);
  value.owners.add(owner);
  owner(initial ?? value.enabled);
  return () => value.owners.delete(owner);
}
