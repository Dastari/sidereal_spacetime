export type GameAuthentication = { token: string; kind: "oidc" };
type Status = "connecting" | "ready" | "offline";
/** Replace a socket on token change or transport failure, never on a ticket timer.
 * The SDK exchanges credentials when opening the WebSocket; that handshake does
 * not establish a periodic renewal deadline. OIDC owns token renewal. Keep an old
 * usable subscription until its replacement is ready to preserve presence. */
export function createConnectionSession<T extends { disconnect(): void }>(
  open: (
    change: () => void,
    status: (state: Status, error?: string) => void,
    auth?: GameAuthentication,
  ) => T,
  onConnection: (connection: T | null) => void,
  onStatus: (state: Status, error?: string) => void,
  onChange: () => void,
  initialAuth?: GameAuthentication,
) {
  let auth = initialAuth,
    current: T | undefined,
    pending: T | undefined,
    disposed = false;
  let retryDelay = 1_000;
  let generation = 0,
    retryTimer: ReturnType<typeof setTimeout> | undefined,
    timeout: ReturnType<typeof setTimeout> | undefined;
  const clearTimers = () => {
    clearTimeout(retryTimer);
    clearTimeout(timeout);
  };
  const schedule = (delay: number) => {
    clearTimeout(retryTimer);
    if (!disposed) retryTimer = setTimeout(replace, delay);
  };
  const retry = () => {
    schedule(retryDelay);
    retryDelay = Math.min(retryDelay * 2, 5_000);
  };
  function replace() {
    if (disposed) return;
    clearTimers();
    const previousPending = pending;
    pending = undefined;
    previousPending?.disconnect();
    const run = ++generation;
    const candidate = open(
      () => {
        if (!disposed && current === candidate) onChange();
      },
      (state, error) => {
        if (disposed || (run !== generation && candidate !== current)) return;
        if (state === "ready" && pending === candidate) {
          clearTimeout(timeout);
          pending = undefined;
          const old = current;
          current = candidate;
          retryDelay = 1_000;
          onConnection(candidate);
          onStatus("ready");
          onChange();
          old?.disconnect();
        } else if (candidate === current) {
          if (state === "offline") {
            onStatus("connecting", "Reconnecting to your account…");
            if (!pending) schedule(0);
          } else onStatus(state, error);
        } else if (state === "offline" && pending === candidate) {
          clearTimeout(timeout);
          pending = undefined;
          candidate.disconnect();
          onStatus(
            current ? "connecting" : "offline",
            "Account connection renewal failed; retrying.",
          );
          retry();
        }
      },
      auth,
    );
    pending = candidate;
    timeout = setTimeout(() => {
      if (disposed || pending !== candidate) return;
      pending = undefined;
      candidate.disconnect();
      onStatus(
        current ? "connecting" : "offline",
        "Account connection timed out; retrying.",
      );
      retry();
    }, 15_000);
  }
  replace();
  return {
    authenticate(next?: GameAuthentication) {
      if (next?.token === auth?.token) return;
      auth = next;
      replace();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      generation++;
      clearTimers();
      pending?.disconnect();
      current?.disconnect();
      pending = undefined;
      current = undefined;
      onConnection(null);
    },
  };
}
