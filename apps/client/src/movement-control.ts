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
  const reconcile = () => {
    queue = queue.then(async () => {
      const target = disposed ? null : desired;
      if (held && held !== target) {
        const previous = held;
        held = null;
        // Last-socket disconnect clears authority even if release cannot reach it.
        await options.release(previous).catch(() => {});
      }
      if (!target || held === target) return;
      try {
        await options.claim(target);
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
