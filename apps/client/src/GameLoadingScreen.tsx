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
      <HangarShell
        className="loading-hangar"
        header={<SiderealWordmark subtitle="Your next voyage" />}
        footer={
          <>
            <span>{awaitingShip ? "Your crew" : shipName || "Sidereal"}</span>
            <GameButton variant="ghost" onClick={onSignOut}>
              Sign out
            </GameButton>
          </>
        }
      >
        <div className="loading-space" aria-hidden="true" />
        <GamePanel
          className="loading-manifest"
          title={failure ? "Unable to board" : "Preparing to board"}
          eyebrow={
            awaitingShip ? "No ship assigned" : shipName || "Your next voyage"
          }
        >
          <p className="loading-stage" role="status" aria-live="polite">
            {failure
              ? "The game could not finish loading."
              : awaitingShip && stage === "ship"
                ? "Preparing your character"
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
              ? "Your saved character and cargo remain in your account. Retry to download the required assets again."
              : awaitingShip
                ? "Your character and personal kit are ready. A ship will be assigned to your account."
                : "Your ship and equipment will be ready before you enter."}
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
