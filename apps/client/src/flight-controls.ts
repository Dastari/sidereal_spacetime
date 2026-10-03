/** Client convenience only: a latched, leased pilot speed intent. The server still
 * validates every command and scheduled consumption; this grants no authority. */
export function createCruiseControl() {
  let relation: string | undefined;
  let throttle = 0;
  return {
    get active() {
      return relation !== undefined;
    },
    get throttle() {
      return throttle;
    },
    cancel() {
      relation = undefined;
      throttle = 0;
    },
    sync(currentRelation: string | undefined) {
      if (relation !== currentRelation) this.cancel();
    },
    toggle(
      currentRelation: string | undefined,
      forwardSpeed: number,
      maximumSpeed: number,
    ) {
      if (this.active) {
        this.cancel();
        return;
      }
      if (
        !currentRelation ||
        !Number.isFinite(forwardSpeed) ||
        !Number.isFinite(maximumSpeed) ||
        !(maximumSpeed > 0)
      )
        return;
      // Capture the current forward speed. At rest, request the ordinary forward cap.
      throttle =
        forwardSpeed > 0.1 ? Math.min(1, forwardSpeed / maximumSpeed) : 1;
      relation = currentRelation;
    },
    demand(
      manualThrottle: number,
      currentRelation: string | undefined,
      blocked: boolean,
    ) {
      this.sync(blocked ? undefined : currentRelation);
      if (manualThrottle !== 0) this.cancel();
      return blocked ? 0 : this.active ? throttle : manualThrottle;
    },
  };
}
