import { afterEach, expect, it, vi } from "vitest";
import { createConnectionSession } from "./connection-session";
afterEach(() => vi.useRealTimers());
function fixture(
  auth: { kind: "oidc"; token: string } | undefined = {
    kind: "oidc",
    token: "first",
  },
) {
  vi.useFakeTimers();
  const connections: any[] = [];
  const changes = vi.fn(),
    statuses = vi.fn();
  let selected: any;
  const open = (_change: any, status: any, auth: any) => {
    const c = { status, auth, disconnect: vi.fn(() => status("offline")) };
    connections.push(c);
    return c;
  };
  const session = createConnectionSession(
    open,
    (c) => {
      selected = c;
    },
    statuses,
    changes,
    auth,
  );
  return { connections, session, statuses, selected: () => selected };
}
it("keeps the old presence until the replacement subscription is ready", () => {
  const f = fixture(),
    old = f.connections[0];
  old.status("ready");
  f.session.authenticate({ kind: "oidc", token: "second" });
  const next = f.connections[1];
  expect(old.disconnect).not.toHaveBeenCalled();
  expect(f.selected()).toBe(old);
  next.status("ready");
  expect(f.selected()).toBe(next);
  expect(old.disconnect).toHaveBeenCalledOnce();
  expect(f.statuses).toHaveBeenLastCalledWith("ready");
  f.session.dispose();
});
it("uses the refreshed ID token and ignores an obsolete pending connection", () => {
  const f = fixture();
  f.connections[0].status("ready");
  f.session.authenticate({ kind: "oidc", token: "second" });
  const obsolete = f.connections[1];
  f.session.authenticate({ kind: "oidc", token: "renewed" });
  const latest = f.connections[2];
  expect(latest.auth.token).toBe("renewed");
  obsolete.status("ready");
  expect(f.selected()).toBe(f.connections[0]);
  latest.status("ready");
  expect(f.selected()).toBe(latest);
  f.session.dispose();
});
it("retries a failed replacement without dropping the existing connection", () => {
  const f = fixture(),
    old = f.connections[0];
  old.status("ready");
  f.session.authenticate({ kind: "oidc", token: "second" });
  f.connections[1].status("offline", "failed");
  expect(old.disconnect).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1_000);
  expect(f.connections).toHaveLength(3);
  f.session.dispose();
});
it("disposes both connections and prevents late callbacks from reviving a session", () => {
  const f = fixture();
  f.connections[0].status("ready");
  f.session.authenticate({ kind: "oidc", token: "second" });
  f.session.dispose();
  f.connections[1].status("ready");
  vi.advanceTimersByTime(120_000);
  expect(f.selected()).toBe(null);
  expect(f.connections).toHaveLength(2);
});

it("retries a timed-out token replacement while retaining the usable socket", () => {
  const f = fixture(),
    old = f.connections[0];
  old.status("ready");
  f.session.authenticate({ kind: "oidc", token: "second" });
  vi.advanceTimersByTime(15_000);
  expect(f.connections[1].disconnect).toHaveBeenCalledOnce();
  expect(f.statuses).toHaveBeenLastCalledWith(
    "connecting",
    "Account connection timed out; retrying.",
  );
  vi.advanceTimersByTime(1_000);
  expect(f.connections).toHaveLength(3);
  expect(old.disconnect).not.toHaveBeenCalled();
  f.connections[2].status("ready");
  expect(f.selected()).toBe(f.connections[2]);
  f.session.dispose();
});
it("immediately reconnects a lost current socket without claiming that it is ready", () => {
  const f = fixture();
  f.connections[0].status("ready");
  f.connections[0].status("offline");
  expect(f.statuses).toHaveBeenLastCalledWith(
    "connecting",
    "Reconnecting to your account…",
  );
  vi.advanceTimersByTime(0);
  expect(f.connections).toHaveLength(2);
  f.session.dispose();
});
it("caps retry backoff and cancels pending retries on disposal", () => {
  const f = fixture();
  f.connections[0].status("ready");
  f.session.authenticate({ kind: "oidc", token: "second" });
  for (const delay of [1000, 2000, 4000, 5000, 5000]) {
    const n = f.connections.length;
    f.connections[n - 1].status("offline");
    vi.advanceTimersByTime(delay - 1);
    expect(f.connections).toHaveLength(n);
    vi.advanceTimersByTime(1);
    expect(f.connections).toHaveLength(n + 1);
  }
  f.session.dispose();
  const n = f.connections.length;
  vi.advanceTimersByTime(120_000);
  expect(f.connections).toHaveLength(n);
});

it("does not periodically rotate healthy sockets or replace them for the same token", () => {
  const f = fixture();
  f.connections[0].status("ready");
  f.session.authenticate({ kind: "oidc", token: "first" });
  vi.advanceTimersByTime(24 * 60 * 60 * 1000);
  expect(f.connections).toHaveLength(1);
  expect(f.connections[0].disconnect).not.toHaveBeenCalled();
  f.session.dispose();
});
it("reconnects development identities after socket failure and startup failure", () => {
  const f = fixture();
  f.session.authenticate(undefined);
  const dev = f.connections.at(-1);
  expect(dev.auth).toBeUndefined();
  dev.status("offline");
  vi.advanceTimersByTime(1000);
  const retry = f.connections.at(-1);
  expect(retry.auth).toBeUndefined();
  retry.status("ready");
  retry.status("offline");
  vi.advanceTimersByTime(0);
  expect(f.connections.at(-1)).not.toBe(retry);
  expect(f.connections.at(-1).auth).toBeUndefined();
  f.session.dispose();
});
