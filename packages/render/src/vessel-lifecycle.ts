/** The world survives occupancy changes; every private assembly has a revocable lease. */
export function createVesselLifecycle<T, R>(options: {
  initialKey: string;
  clear: () => void;
  prepare: (value: T) => { cancel: () => void; ready: Promise<R> };
  install: (value: R) => void;
  discard: (value: R) => void;
}) {
  let key = options.initialKey,
    generation = 0,
    disposed = false;
  options.initialKey = "";
  let pending: { cancel: () => void; ready: Promise<R> } | undefined;
  let completion = Promise.resolve(true);
  return {
    replace(nextKey: string, value?: T): Promise<boolean> {
      if (disposed) return Promise.resolve(false);
      if (key === nextKey) return completion;
      key = nextKey;
      const current = ++generation;
      pending?.cancel();
      pending = undefined;
      options.clear();
      if (!value) return (completion = Promise.resolve(true));
      const lease = options.prepare(value);
      pending = lease;
      return (completion = lease.ready.then(
        (result) => {
          if (disposed || generation !== current) {
            options.discard(result);
            return false;
          }
          pending = undefined;
          try {
            options.install(result);
            return true;
          } catch (error) {
            options.clear();
            options.discard(result);
            key = "";
            throw error;
          }
        },
        (error) => {
          lease.cancel();
          if (disposed || generation !== current) return false;
          pending = undefined;
          key = ""; // The same accepted assembly may be retried after a real failure.
          throw error;
        },
      ));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      generation++;
      pending?.cancel();
      pending = undefined;
      options.clear();
    },
  };
}
