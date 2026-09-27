import { useEffect, useState, type ReactNode } from "react";
import type { User } from "oidc-client-ts";
import { authoringAuth, loadAuthoringAccount } from "./auth";
export function StudioAuthGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const loaded = (u: User) => {
      if (active) {
        setUser(u);
        setLoading(false);
      }
    };
    const removed = () => {
      if (active) setUser(null);
    };
    const events = authoringAuth().events;
    events.addUserLoaded(loaded);
    events.addUserUnloaded(removed);
    events.addAccessTokenExpired(removed);
    events.addUserSignedOut(removed);
    void loadAuthoringAccount()
      .then((u) => {
        if (active) setUser(u);
      })
      .catch((e) => {
        if (active) setError(String(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      events.removeUserLoaded(loaded);
      events.removeUserUnloaded(removed);
      events.removeAccessTokenExpired(removed);
      events.removeUserSignedOut(removed);
    };
  }, []);
  if (user?.id_token && !user.expired) return children;
  return (
    <main className="studio-auth-gate">
      <h1>Sidereal Studio</h1>
      {loading ? (
        <p role="status">Checking sign-in…</p>
      ) : (
        <>
          <p>Sign in to open your live world and authoring workspaces.</p>
          <button
            className="primary"
            onClick={() =>
              void authoringAuth()
                .signinRedirect({
                  state: { returnTo: location.pathname + location.search },
                })
                .catch((e) => setError(String(e)))
            }
          >
            Sign in
          </button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </main>
  );
}
