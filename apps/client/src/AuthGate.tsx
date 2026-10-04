import React, { useEffect, useRef, useState } from "react";
import type { User } from "oidc-client-ts";
import App from "./App";
import { authManager, authOrigin, gameAuthentication } from "./auth";
import { restoreGameSession, usableGameSession } from "./auth-session";
import {
  GameButton,
  GameNotice,
  GamePanel,
  HangarShell,
  SiderealWordmark,
} from "@sidereal/ui/game";
import "./auth.css";

export default function AuthGate() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const signInPending = useRef(false);
  const mounted = useRef(false);
  const [development, setDevelopment] = useState(
    () =>
      import.meta.env.DEV &&
      location.protocol === "http:" &&
      Boolean(localStorage.getItem("sidereal.lab.token")) &&
      !new URLSearchParams(location.search).has("login"),
  );
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
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
    if (signInPending.current || !ready) return;
    signInPending.current = true;
    setSigningIn(true);
    try {
      setError("");
      if (location.origin !== authOrigin) {
        location.assign(authOrigin + location.search);
        return;
      }
      await authManager().signinRedirect({
        state: { returnQuery: location.search },
      });
    } catch {
      signInPending.current = false;
      if (mounted.current) {
        setSigningIn(false);
        setError(
          "Unable to reach sign-in. Check your connection and try again.",
        );
      }
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
    <HangarShell
      className="auth-screen"
      header={
        <SiderealWordmark subtitle="Explore · Build · Survive · Belong" />
      }
      footer={
        <>
          <span>A universe of possibilities</span>
          <span>Explore · Build · Survive · Belong</span>
        </>
      }
    >
      <section className="auth-story" aria-label="Sidereal crew access">
        <p className="auth-story-line">A brighter galaxy. Together.</p>
        <p>Your ship. Your crew. Your next journey.</p>
      </section>
      <GamePanel
        className="auth-panel"
        title="Crew login"
        eyebrow="Access your journey"
      >
        <p className="auth-description">
          Sign in with your Dastari account to join your crew.
        </p>
        {error && <GameNotice kind="danger">{error}</GameNotice>}
        <GameButton
          className="auth-primary"
          variant="primary"
          disabled={!ready}
          pending={signingIn}
          onClick={() => void signIn()}
        >
          {signingIn
            ? "Opening secure sign-in…"
            : ready
              ? "Sign in / Create account"
              : "Preparing sign-in…"}
        </GameButton>
        <p className="auth-note" role={signingIn ? "status" : undefined}>
          {signingIn
            ? "Continue at Dastari to access your saved character."
            : "Your character, equipment and appearance stay with your account."}
        </p>
        {import.meta.env.DEV && (
          <details className="auth-development">
            <summary>Existing development character</summary>
            <p>
              Continue the saved character in this browser. Use Account in game
              to link it to your Dastari account.
            </p>
            <GameButton
              variant="secondary"
              onClick={() => setDevelopment(true)}
            >
              Continue development character
            </GameButton>
          </details>
        )}
      </GamePanel>
    </HangarShell>
  );
}
