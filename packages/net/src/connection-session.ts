export type GameAuthentication = { token: string; kind: "oidc" };
type Status = "connecting" | "ready" | "offline";
/** The pinned SDK exchanges ID tokens for 60-second WebSocket tickets. Rotate
 * the authenticated connection while the old subscription is still present.
 * Closing first would revoke the final presence lease and eject a seated actor. */
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
    rotation: ReturnType<typeof setTimeout> | undefined,
    timeout: ReturnType<typeof setTimeout> | undefined;
  const clearTimers = () => {
    clearTimeout(rotation);
    clearTimeout(timeout);
  };
  const schedule = (delay = 30_000) => {
    clearTimeout(rotation);
    if (auth && !disposed) rotation = setTimeout(replace, delay);
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
          schedule();
        } else if (candidate === current) {
          if (state === "offline" && auth) {
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
