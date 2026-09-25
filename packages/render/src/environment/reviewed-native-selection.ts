/** Selection publication owns only candidates, never a worker or scene. Loading
 * requests remain caller-owned; every asynchronous result must pass stage(). */
export interface ReviewedSelectionCandidate {
  readonly runtime: { readonly root: { setEnabled(enabled: boolean): void } };
  dispose(): void;
}
export function createReviewedNativeSelection<
  T extends ReviewedSelectionCandidate,
>() {
  let generation = 0,
    disposed = false,
    current: T | undefined,
    pending: T | undefined;
  return {
    get current() {
      return current;
    },
    get pending() {
      return pending;
    },
    begin(): number {
      if (disposed) throw new Error("Reviewed selection disposed");
      generation++;
      const previous = pending;
      pending = undefined;
      previous?.dispose();
      return generation;
    },
    isCurrent(token: number): boolean {
      return !disposed && token === generation;
    },
    /** Ownership transfers even for stale results, which are immediately disposed. */
    stage(token: number, candidate: T): boolean {
      if (disposed || token !== generation) {
        candidate.dispose();
        return false;
      }
      if (candidate === current || candidate === pending)
        throw new Error("Candidate already owned");
      candidate.runtime.root.setEnabled(false);
      const previous = pending;
      pending = candidate;
      previous?.dispose();
      return true;
    },
    /** Call from the render loop after update. Neither completion nor stage()
     * changes the visible body. Enable/disable publication is synchronous. */
    publishIfReady(ready: (candidate: T) => boolean): T | undefined {
      if (disposed || !pending || !ready(pending)) return undefined;
      const next = pending,
        previous = current;
      pending = undefined;
      current = next;
      next.runtime.root.setEnabled(true);
      previous?.runtime.root.setEnabled(false);
      previous?.dispose();
      return next;
    },
    rejectPending(): void {
      const previous = pending;
      pending = undefined;
      previous?.dispose();
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      generation++;
      const previous = current,
        waiting = pending;
      current = undefined;
      pending = undefined;
      waiting?.dispose();
      previous?.dispose();
    },
  };
}
