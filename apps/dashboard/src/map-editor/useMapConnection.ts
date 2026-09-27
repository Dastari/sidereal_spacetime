import { useEffect, useRef, useState } from "react";
import type { User } from "oidc-client-ts";
import { authoringAuth, loadAuthoringAccount } from "../authoring/auth";
import { createConnectionSession } from "@sidereal/net/connection-session";
import { connectSystemMap } from "@sidereal/net/system-map";
import type { DbConnection } from "@sidereal/net/generated";
export function useMapConnection() {
  const [user, setUser] = useState<User | null>(null),
    [connection, setConnection] = useState<DbConnection | null>(null),
    [status, setStatus] = useState("Signed out"),
    [error, setError] = useState(""),
    [, refresh] = useState(0);
  const session = useRef<ReturnType<
    typeof createConnectionSession<DbConnection>
  > | null>(null);
  useEffect(() => {
    let active = true;
    const loaded = (u: User) => {
        if (active) setUser(u);
      },
      removed = () => {
        if (active) setUser(null);
      };
    loadAuthoringAccount()
      .then((u) => {
        if (active) setUser(u);
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    const events = authoringAuth().events;
    events.addUserLoaded(loaded);
    events.addUserUnloaded(removed);
    return () => {
      active = false;
      events.removeUserLoaded(loaded);
      events.removeUserUnloaded(removed);
    };
  }, []);
  const authenticated = !!user?.id_token && !user.expired;
  useEffect(() => {
    if (!authenticated) {
      setConnection(null);
      setStatus("Signed out");
      return;
    }
    const s = createConnectionSession(
      connectSystemMap,
      setConnection,
      (state, error) => {
        setStatus(state);
        setError(error ?? "");
      },
      () => refresh((n) => n + 1),
      { kind: "oidc", token: user!.id_token! },
    );
    session.current = s;
    return () => {
      s.dispose();
      session.current = null;
    };
  }, [authenticated]);
  useEffect(() => {
    if (user?.id_token && !user.expired)
      session.current?.authenticate({ kind: "oidc", token: user.id_token });
  }, [user?.id_token]);
  return {
    user,
    connection,
    status,
    error,
    signIn: () =>
      authoringAuth().signinRedirect({ state: { returnTo: "/map" } }),
  };
}
