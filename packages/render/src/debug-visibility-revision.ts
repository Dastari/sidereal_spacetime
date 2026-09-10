/** Scalar snapshot: catches in-place power updates without per-frame serialization. */
export function createDebugVisibilityRevision() {
  let revision = 0,
    cabin: boolean | undefined;
  const ids: string[] = [],
    enabled: boolean[] = [];
  return (
    visible: boolean,
    lights: readonly { placementId: string; enabled: boolean }[] = [],
  ) => {
    let changed = cabin !== visible || ids.length !== lights.length;
    cabin = visible;
    for (let i = 0; i < lights.length; i++) {
      const light = lights[i];
      changed =
        changed || ids[i] !== light.placementId || enabled[i] !== light.enabled;
      ids[i] = light.placementId;
      enabled[i] = light.enabled;
    }
    ids.length = enabled.length = lights.length;
    if (changed) revision++;
    return revision;
  };
}
