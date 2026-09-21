/** A committed reducer can precede its subscription update. Do not unlock another
 * edit or discard the retry operation ID while the view is still stale. */
export function waitForLiveMap<T extends { revision: bigint }>(
  read: () => T | null | undefined,
  subscribe: (inspect: () => void) => () => void,
  previousRevision: bigint,
  timeoutMs = 10000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let unsubscribe = () => {};
    const cleanup = () => {
      clearTimeout(timer);
      unsubscribe();
    };
    const inspect = () => {
      const next = read();
      if (next && next.revision > previousRevision) {
        cleanup();
        resolve(next);
      }
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(
        Error(
          "Save accepted; waiting for the live map. Retry Save to confirm the same operation.",
        ),
      );
    }, timeoutMs);
    unsubscribe = subscribe(inspect);
    inspect();
  });
}
