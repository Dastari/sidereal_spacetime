import { useEffect, useRef } from "react";
import "./game-loading.css";

const stages: Record<string, string> = {
  connecting: "Connecting to your world",
  ship: "Loading your ship",
  environment: "Preparing the surrounding space",
  crew: "Loading your character",
  equipment: "Loading equipped items",
  finishing: "Preparing the first frame",
};

/** Covers, but never display:none's, the live canvas while its GPU assets load. */
export function GameLoadingScreen({
  stage,
  shipName,
  failure,
  onSignOut,
  awaitingShip = false,
}: {
  stage: string;
  shipName: string;
  failure?: string;
  onSignOut: () => void;
  /** Character exists without a ship (wiped or not yet assigned). */
  awaitingShip?: boolean;
}) {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    panel.current?.focus();
  }, []);
  return (
    <section
      className="game-loading"
      aria-label="Loading game"
      aria-busy={!failure}
      tabIndex={-1}
      ref={panel}
    >
      <div className="loading-nebula" aria-hidden="true" />
      <header className="loading-brand">
        <span aria-hidden="true">◒</span> Sidereal
      </header>
      <div className="loading-manifest">
        <svg
          className="loading-vessel"
          viewBox="0 0 180 300"
          aria-hidden="true"
        >
          <path d="M90 12 120 35 144 85 144 250 128 270 52 270 36 250 36 85 60 35Z" />
          <path d="M60 35 68 76H112L120 35M36 85H144M55 95V243M125 95V243M80 85V252M100 85V252M36 133H80M100 133H144M36 182H80M100 182H144M36 229H144M60 270V290H78V270M102 270V290H120V270" />
        </svg>
        <div className="loading-copy">
          <p className="loading-destination">
            {awaitingShip ? "No ship assigned" : shipName || "Your next voyage"}
          </p>
          <h1>
            {failure
              ? awaitingShip
                ? "Unable to load"
                : "Unable to board"
              : awaitingShip
                ? "Entering Sidereal"
                : "Preparing to board"}
          </h1>
          <p role="status" aria-live="polite">
            {failure
              ? "The game could not finish loading. Retry to download the required assets again."
              : awaitingShip && stage === "ship"
                ? "Preparing your character"
                : (stages[stage] ?? stages.ship)}
          </p>
          {!failure && (
            <div className="loading-track" aria-hidden="true">
              <span />
            </div>
          )}
          <p className="loading-hint">
            {failure
              ? "Your saved character and cargo remain in your account."
              : awaitingShip
                ? "Your character and personal kit are ready. A ship will be assigned to your account."
                : "Your ship and equipment will be ready before you enter."}
          </p>
          {failure && (
            <button className="loading-retry" onClick={() => location.reload()}>
              Retry loading
            </button>
          )}
        </div>
      </div>
      <footer>
        <span>{awaitingShip ? "WASD to move" : "WASD to move · TAB to change view"}</span>
        <button onClick={onSignOut}>Sign out</button>
      </footer>
    </section>
  );
}
