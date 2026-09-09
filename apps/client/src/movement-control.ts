/** Serialize focus-driven lease changes, so a late claim cannot revive input in
 * a hidden tab or release a newer claim on the same connection. */
export function createMovementControl<T extends object>(options: {
  claim: (connection: T) => Promise<unknown>;
  release: (connection: T) => Promise<unknown>;
  onError: (error: unknown) => void;
  now?: () => number;
}) {
  let desired: T | null = null;
  let held: T | null = null;
  let queue = Promise.resolve();
  let disposed = false;
  const now = options.now ?? Date.now;
  let retryAt = 0;
  let failedConnection: T | null = null;
  const sequences = new WeakMap<T, bigint>();
  const releaseBestEffort = (connection: T) =>
    new Promise<void>((resolve) => {
      // Bound acknowledgement only: this does not cancel a reducer already sent.
      // Same-socket adapters enqueue release before a subsequent claim. The server
      // conditionally releases that connection, so late old-socket release cannot
      // clear a replacement socket's control.
      const timeout = setTimeout(finish, 500);
      function finish() {
        clearTimeout(timeout);
        resolve();
      }
      try {
        Promise.resolve(options.release(connection)).then(finish, finish);
      } catch {
        finish();
      }
    });
  const claimAcknowledged = (connection: T) =>
    new Promise<boolean>((resolve, reject) => {
      let done = false;
      const timeout = setTimeout(() => {
        done = true;
        resolve(false);
      }, 1500);
      const accepted = () => {
        if (done) return;
        done = true;
        clearTimeout(timeout);
        resolve(true);
      };
      const failed = (error: unknown) => {
        if (done) return;
        done = true;
        clearTimeout(timeout);
        reject(error);
      };
      try {
        Promise.resolve(options.claim(connection)).then(accepted, failed);
      } catch (error) {
        failed(error);
      }
    });
  const reconcile = () => {
    queue = queue.then(async () => {
      let target = disposed ? null : desired;
      if (held && held !== target) {
        const previous = held;
        held = null;
        // Last-socket disconnect clears authority even if release cannot reach it.
        await releaseBestEffort(previous);
        // Focus/disposal may have changed while the old socket was unresponsive.
        target = disposed ? null : desired;
      }
      if (!target || held === target) return;
      try {
        if (!(await claimAcknowledged(target))) {
          // The timed-out request may already have committed. Queue a conditional
          // release after it; a late acknowledgement never restores local held.
          await releaseBestEffort(target);
          throw new Error("Movement control claim timed out. Retrying.");
        }
        held = target;
        failedConnection = null;
      } catch (error) {
        if (!disposed && desired === target) {
          desired = null;
          failedConnection = target;
          retryAt = now() + 1000;
          options.onError(error);
        }
      }
    });
  };
  return {
    activate(connection: T | null) {
      if (disposed || desired === connection) return;
      if (connection && connection === failedConnection && now() < retryAt)
        return;
      desired = connection;
      reconcile();
    },
    canSend(connection: T) {
      return !disposed && desired === connection && held === connection;
    },
    nextSequence(connection: T) {
      const next = (sequences.get(connection) ?? 0n) + 1n;
      sequences.set(connection, next);
      return next;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      desired = null;
      reconcile();
    },
    settled: () => queue,
  };
}
