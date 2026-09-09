/** Subscription handles belong to one socket. Retain them so scope changes and
 * disposal can release queries instead of accumulating invisible subscriptions. */
export type RetainedSubscription = {
  isActive(): boolean;
  isEnded(): boolean;
  unsubscribe(): void;
};
export function createConnectionResources() {
  const subscriptions = new Map<string, RetainedSubscription>();
  const listeners = new Set<() => void>();
  let disposed = false;
  const awaitingRelease = new Set<RetainedSubscription>();
  const released = new WeakSet<RetainedSubscription>();
  const release = (handle: RetainedSubscription) => {
    if (handle.isEnded() || released.has(handle)) return;
    if (handle.isActive()) {
      handle.unsubscribe();
      released.add(handle);
      awaitingRelease.delete(handle);
    } else awaitingRelease.add(handle);
  };
  return {
    applied(handle: RetainedSubscription) {
      if (disposed || awaitingRelease.has(handle)) {
        release(handle);
        return false;
      }
      return true;
    },
    retain(name: string, handle: RetainedSubscription) {
      if (disposed) {
        release(handle);
        return;
      }
      const previous = subscriptions.get(name);
      if (previous === handle) return;
      if (previous) release(previous);
      subscriptions.set(name, handle);
    },
    remove(name: string) {
      const handle = subscriptions.get(name);
      subscriptions.delete(name);
      if (handle) release(handle);
    },
    listen(remove: () => void) {
      if (disposed) remove();
      else listeners.add(remove);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const remove of listeners) remove();
      listeners.clear();
      // The owning socket closes immediately afterward, cancelling queries that
      // have not applied yet as well as any transport-failed subscriptions.
      for (const handle of subscriptions.values()) release(handle);
      subscriptions.clear();
    },
  };
}
export function subscriptionErrorMessage(context: { event?: unknown }) {
  // SDK 2.10 actually puts Error in context.event (db_connection_impl.ts).
  // A missing event must still produce a useful message, not "undefined".
  const error = context.event;
  if (error instanceof Error) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return "World subscription failed. Reconnecting…";
}
