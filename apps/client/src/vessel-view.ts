/** Restore third person once for each accepted entry, after its assembly is installed.
 * Later ship edits must preserve the player's chosen deck/flight view. */
export function createDeckViewRestoration() {
  let aboard = false;
  let pending = false;
  return (
    acceptedKey: string | undefined,
    installedKey: string | undefined,
  ): boolean | undefined => {
    if (acceptedKey === undefined) {
      aboard = false;
      pending = false;
      return false;
    }
    if (!aboard) pending = true;
    aboard = true;
    if (pending && acceptedKey === installedKey) {
      pending = false;
      return true;
    }
    return undefined;
  };
}
