/** Owner-authorized local draft reset for the boundary editor rollout.
 * Scope is this browser's active authoring profile; never auth or server state.
 */
export function resetLegacyLocalDrafts(storage: Storage, identity: string) {
  const marker = `sidereal.layout.boundary-editor-reset.v1:${identity}`;
  if (storage.getItem(marker) === "done") return;
  const prefix = `sidereal.layout.recovery.v1:${encodeURIComponent(identity)}:`;
  const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i));
  for (const key of keys)
    if (
      key &&
      (key.startsWith(prefix) ||
        key.startsWith(`sidereal.layout.quarantine.v1:${identity}:`) ||
        key === `sidereal.layout.active.v1:${identity}` ||
        key === `sidereal.layout.pending-import.v1:${identity}` ||
        key === "sidereal.assembly.draft.v1")
    )
      storage.removeItem(key);
  storage.setItem(marker, "done");
}
