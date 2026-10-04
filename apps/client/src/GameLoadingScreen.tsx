import { useEffect, useRef } from "react";
import {
  GameButton,
  GameNotice,
  GamePanel,
  HangarShell,
  SiderealWordmark,
} from "@sidereal/ui/game";
import "./game-loading.css";

const stages: Record<string, string> = {
  connecting: "Connecting to server",
  ship: "Loading ship",
  environment: "Loading environment",
  crew: "Loading character",
  equipment: "Loading equipped items",
  finishing: "Rendering first frame",
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
      <HangarShell
        className="loading-hangar"
        header={<SiderealWordmark subtitle="Loading game" />}
        footer={
          <>
            <span>{awaitingShip ? "Character" : shipName || "Sidereal"}</span>
            <GameButton variant="ghost" onClick={onSignOut}>
              Sign out
            </GameButton>
          </>
        }
      >
        <div className="loading-space" aria-hidden="true" />
        <GamePanel
          className="loading-manifest"
          title={failure ? "Loading failed" : "Loading game"}
          eyebrow={
            awaitingShip ? "No ship assigned" : shipName || "Loading game"
          }
        >
          <p className="loading-stage" role="status" aria-live="polite">
            {failure
              ? "Loading could not complete."
              : awaitingShip && stage === "ship"
                ? "Loading character"
                : (stages[stage] ?? stages.ship)}
          </p>
          {failure ? (
            <GameNotice kind="danger">{failure}</GameNotice>
          ) : (
            <div className="loading-track" aria-hidden="true">
              <span />
            </div>
          )}
          <p className="loading-hint">
            {failure
              ? "Retry to load the required assets again."
              : awaitingShip
                ? "No ship is assigned to this character."
                : "Loading ship and equipment."}
          </p>
          {failure && (
            <GameButton variant="primary" onClick={() => location.reload()}>
              Retry loading
            </GameButton>
          )}
        </GamePanel>
      </HangarShell>
    </section>
  );
}
