import React, { useEffect, useState } from "react";
import type { User } from "oidc-client-ts";
import App from "./App";
import { authManager, authOrigin, gameAuthentication } from "./auth";
import { restoreGameSession, usableGameSession } from "./auth-session";
import "./auth.css";

export default function AuthGate() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [development, setDevelopment] = useState(
    () =>
      import.meta.env.DEV &&
      location.protocol === "http:" &&
      Boolean(localStorage.getItem("sidereal.lab.token")) &&
      !new URLSearchParams(location.search).has("login"),
  );
  useEffect(() => {
    if (location.origin !== authOrigin) {
      setReady(true);
      return;
    }
    const manager = authManager();
    let alive = true;
    const loaded = (next: User) => {
      if (alive) {
        setUser(usableGameSession(next) ? next : null);
        setError(
          usableGameSession(next)
            ? ""
            : "Your session expired. Sign in to continue.",
        );
      }
    };
    const expired = () => {
      if (alive) {
        setUser(null);
        setError("Your session expired. Sign in to continue.");
      }
    };
    manager.events.addUserLoaded(loaded);
    manager.events.addUserUnloaded(expired);
    manager.events.addAccessTokenExpired(expired);
    manager.events.addSilentRenewError(expired);
    void (async () => {
      try {
        const next = await restoreGameSession(
          location.pathname,
          manager,
          (path) => history.replaceState({}, "", path),
        );
        if (alive && usableGameSession(next)) setUser(next);
      } catch {
        if (alive) setError("Sign-in could not complete. Please try again.");
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => {
      alive = false;
      manager.events.removeUserLoaded(loaded);
      manager.events.removeUserUnloaded(expired);
      manager.events.removeAccessTokenExpired(expired);
      manager.events.removeSilentRenewError(expired);
    };
  }, []);
  const signIn = async () => {
    if (location.origin !== authOrigin) {
      location.assign(authOrigin + location.search);
      return;
    }
    try {
      setError("");
      await authManager().signinRedirect({
        state: { returnQuery: location.search },
      });
    } catch {
      setError("Unable to reach sign-in. Check your connection and try again.");
    }
  };
  const signOut = async () => {
    if (development) {
      setDevelopment(false);
      return;
    }
    try {
      await authManager().signoutRedirect();
    } catch {
      await authManager().removeUser();
      setUser(null);
      setError("Signed out here. The account provider could not be reached.");
    }
  };
  if (ready && (development || user))
    return (
      <App
        auth={user ? gameAuthentication(user) : undefined}
        accountName={
          user?.profile.preferred_username ?? "Development character"
        }
        onSignOut={() => void signOut()}
      />
    );
  return (
    <main className="auth-screen">
      <div className="auth-world" aria-hidden="true" />
      <section className="auth-intro">
        <span className="auth-orbit" aria-hidden="true">
          ◒
        </span>
        <h1>Sidereal</h1>
        <p>Your ship. Your crew. A universe to explore.</p>
      </section>
      <section className="auth-panel" aria-label="Sign in">
        <h2>Welcome aboard</h2>
        <p>Sign in with your Dastari account to continue your journey.</p>
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
        <button
          className="auth-primary"
          disabled={!ready}
          onClick={() => void signIn()}
        >
          {ready ? "Sign in / Create account" : "Preparing sign-in…"}
        </button>
        <p className="auth-note">
          Your character, equipment and appearance stay with your account.
        </p>
        {import.meta.env.DEV && (
          <details>
            <summary>Existing development character</summary>
            <p>
              Continue the saved character in this browser. Use Account in game
              to link it to your Dastari account.
            </p>
            <button onClick={() => setDevelopment(true)}>
              Continue development character
            </button>
          </details>
        )}
      </section>
    </main>
  );
}
