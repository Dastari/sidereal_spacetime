/** One body-owned worker; initialized once, never synchronous fallback. */
export interface ReferenceWorkerTransport {
  postMessage(message: unknown): void;
  terminate(): void;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
}
export function createReferenceWorkerLifetime<T>(
  worker: ReferenceWorkerTransport,
  init: unknown,
) {
  let disposed = false,
    next = 1;
  const pending = new Map<
    number,
    { resolve: (value: T) => void; reject: (error: Error) => void }
  >();
  function dispose(error = new Error("Reference worker disposed")) {
    if (disposed) return;
    disposed = true;
    for (const job of pending.values()) job.reject(error);
    pending.clear();
    worker.onmessage = worker.onerror = worker.onmessageerror = null;
    worker.terminate();
  }
  worker.onmessage = (event) => {
    if (disposed) return;
    const { id, error, ...result } = event.data;
    if (id === 0 && error) {
      dispose(new Error(error));
      return;
    }
    const job = pending.get(id);
    if (!job) return;
    pending.delete(id);
    if (error) job.reject(new Error(error));
    else job.resolve(result as T);
  };
  worker.onerror = (event) =>
    dispose(new Error(event.message || "Reference worker failed"));
  worker.onmessageerror = () =>
    dispose(new Error("Reference worker message could not be decoded"));
  try {
    worker.postMessage({ type: "initialize", id: 0, ...(init as object) });
  } catch (error) {
    dispose(error instanceof Error ? error : new Error(String(error)));
  }
  return {
    request(payload: unknown): Promise<T> {
      if (disposed)
        return Promise.reject(new Error("Reference worker disposed"));
      const id = next++;
      return new Promise<T>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        try {
          worker.postMessage({ type: "build", id, ...(payload as object) });
        } catch (error) {
          pending.delete(id);
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
    },
    dispose,
    stats: () => ({ disposed, pending: pending.size }),
  };
}
/** Only proven current composer contracts; no inference from a planet name. */
export function referenceFixedDetail(layout: string, revision: string | null) {
  return (
    layout === "gas-bands-and-rings" ||
    (layout === "single-glacial-cut-diagnostic" &&
      (revision === "ice-r025" || revision === "ice-r026"))
  );
}
export function createReferenceUploadLifetime() {
  let disposed = false;
  const owned = new Set<{ dispose: () => void }>(),
    waiting = new Set<(error: Error) => void>();
  const check = () => {
    if (disposed) throw new Error("Reference candidate disposed");
  };
  function wait<T>(promise: Promise<T>): Promise<T> {
    check();
    return new Promise<T>((resolve, reject) => {
      waiting.add(reject);
      promise.then(
        (value) => {
          waiting.delete(reject);
          if (disposed) reject(new Error("Reference candidate disposed"));
          else resolve(value);
        },
        (error) => {
          waiting.delete(reject);
          reject(error);
        },
      );
    });
  }
  return {
    check,
    wait,
    async yieldFrame(nextFrame: () => Promise<void>) {
      check();
      await wait(nextFrame());
      check();
    },
    async build<T extends { dispose: () => void }>(
      node: T,
      upload: (node: T) => Promise<void>,
    ) {
      try {
        check();
        owned.add(node);
        await upload(node);
        check();
        owned.delete(node);
        return node;
      } catch (error) {
        owned.delete(node);
        node.dispose();
        throw error;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const reject of waiting)
        reject(new Error("Reference candidate disposed"));
      waiting.clear();
      for (const node of owned) node.dispose();
      owned.clear();
    },
    isDisposed: () => disposed,
  };
}
