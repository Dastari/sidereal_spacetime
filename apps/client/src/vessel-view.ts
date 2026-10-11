/** Request third person once when entry is accepted. Graphics installation gates
 * disclosure separately; the first ready frame must already have its final view.
 * Later ship edits preserve the player's chosen deck/flight preference. */
export function createDeckViewRestoration() {
  let aboard = false;
  return (acceptedKey: string | undefined): boolean | undefined => {
    if (acceptedKey === undefined) {
      aboard = false;
      return false;
    }
    const entering = !aboard;
    aboard = true;
    return entering ? true : undefined;
  };
}

/** ownEvaBody can clear before the separately filtered location/instance rows
 * arrive. Hold the camera across that interval, without claiming deck access. */
export function awaitingDeckPresentation(input: {
  connected: boolean;
  shipId: string | undefined;
  hasEva: boolean;
  interiorReady: boolean;
}) {
  return (
    input.connected && !!input.shipId && !input.hasEva && !input.interiorReady
  );
}
