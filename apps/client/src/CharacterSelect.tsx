import { useEffect, useMemo, useRef, useState } from "react";
import type { CharacterRow, InventoryItemRow, ShipRow } from "@sidereal/net";
import type { CrewAppearance } from "@sidereal/render/crew/appearance";
import { itemDefinitionOf } from "@sidereal/content/item-presentation";
import {
  GameButton,
  GameInput,
  GameNotice,
  GamePanel,
  HangarShell,
  SiderealWordmark,
  StatBar,
} from "@sidereal/ui/game";
import { equipmentAppearance } from "./inventory";
import { CharacterPreview } from "./CharacterPreview";
import "./character-select.css";

export type CharacterSelectProps = {
  actor: CharacterRow | null;
  items: readonly InventoryItemRow[];
  ship: ShipRow | null;
  appearance: CrewAppearance;
  vitals?: { health: number; maxHealth: number };
  pending: boolean;
  error?: string;
  onEnter: () => void;
  onCreate: (name: string) => Promise<void>;
  onSignOut: () => void;
};

export function CharacterSelect({
  actor,
  items,
  ship,
  appearance,
  vitals,
  pending,
  error,
  onEnter,
  onCreate,
  onSignOut,
}: CharacterSelectProps) {
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [detailOpen, setDetailOpen] = useState(false);
  const createPending = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const equipped = useMemo(
    () => items.filter((item) => !!item.equipmentSlot),
    [items],
  );
  const previewAppearance = useMemo(() => {
    const next = equipmentAppearance(equipped, appearance);
    return {
      ...next.crewAppearance,
      equipmentItem: next.heldItem ?? undefined,
    };
  }, [equipped, appearance]);
  const busy = pending || creating;
  const validName = name.trim().length >= 2 && name.trim().length <= 40;
  const create = async () => {
    if (busy || createPending.current || !validName) return;
    createPending.current = true;
    setCreating(true);
    setCreateError("");
    try {
      await onCreate(name.trim());
    } catch {
      if (mounted.current)
        setCreateError(
          "Character creation could not complete. Check your connection and try again.",
        );
    } finally {
      createPending.current = false;
      if (mounted.current) setCreating(false);
    }
  };
  return (
    <HangarShell
      className="character-select"
      header={<SiderealWordmark subtitle="Character select" />}
      footer={
        <div className="character-select-footer">
          <div>
            <span className="character-footer-label">
              {actor ? actor.name : "Your crew begins here"}
            </span>
            <span>
              {actor
                ? "Ready for your next voyage"
                : "Create your first character to continue"}
            </span>
          </div>
          {actor && (
            <GameButton
              className="character-enter"
              variant="primary"
              pending={pending}
              onClick={onEnter}
            >
              Enter world
            </GameButton>
          )}
          <GameButton variant="ghost" disabled={busy} onClick={onSignOut}>
            Sign out
          </GameButton>
        </div>
      }
    >
      <div className="character-select-layout">
        <GamePanel
          className="character-roster"
          title="Your crew"
          eyebrow="Select a crew member"
        >
          {actor ? (
            <button
              type="button"
              className="character-roster-card"
              aria-pressed="true"
            >
              <span className="character-roster-symbol" aria-hidden="true">
                ◇
              </span>
              <span>
                <strong>{actor.name}</strong>
                <small>{ship?.name ?? "No ship assigned"}</small>
              </span>
              <span className="character-selected-mark" aria-hidden="true">
                ✓
              </span>
            </button>
          ) : (
            <p className="character-empty-copy">
              Your account does not have a character yet. Choose a name to start
              your journey.
            </p>
          )}
          {actor && (
            <p className="character-roster-note">
              Your saved character and equipment are ready to continue.
            </p>
          )}
        </GamePanel>
        <section
          className="character-stage"
          aria-label={actor ? `${actor.name} preview` : "Create character"}
        >
          {actor ? (
            <>
              <CharacterPreview
                name={actor.name}
                appearance={previewAppearance}
              />
              <div className="character-nameplate">
                <h1>{actor.name}</h1>
                <p>{ship?.name ?? "Awaiting ship assignment"}</p>
              </div>
            </>
          ) : (
            <GamePanel
              className="character-create"
              title="New crew member"
              eyebrow="A new adventure awaits"
            >
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void create();
                }}
              >
                <GameInput
                  id="character-name"
                  label="Character name"
                  value={name}
                  maxLength={40}
                  autoComplete="off"
                  autoFocus
                  disabled={busy}
                  onChange={(event) => setName(event.target.value)}
                  description="Choose a name between 2 and 40 characters."
                />
                {(error || createError) && (
                  <GameNotice kind="danger">{error || createError}</GameNotice>
                )}
                <GameButton
                  type="submit"
                  variant="primary"
                  pending={busy}
                  disabled={!validName}
                >
                  Create character
                </GameButton>
              </form>
            </GamePanel>
          )}
        </section>
        {actor && (
          <div
            className={`character-detail-lane ${detailOpen ? "is-open" : ""}`}
          >
            <GameButton
              className="character-detail-toggle"
              variant="secondary"
              aria-expanded={detailOpen}
              onClick={() => setDetailOpen((value) => !value)}
            >
              {detailOpen ? "Hide details" : "Character details"}
            </GameButton>
            <GamePanel
              className="character-details"
              title={actor.name}
              eyebrow="Crew manifest"
            >
              <dl className="character-manifest">
                <div>
                  <dt>Ship</dt>
                  <dd>{ship?.name ?? "No ship assigned"}</dd>
                </div>
                <div>
                  <dt>Equipped items</dt>
                  <dd>{equipped.length}</dd>
                </div>
              </dl>
              {vitals && (
                <StatBar
                  label="Health"
                  value={vitals.health}
                  max={vitals.maxHealth}
                  kind="danger"
                />
              )}
              <h3>Loadout</h3>
              {equipped.length ? (
                <ul className="character-loadout">
                  {equipped.map((item) => {
                    const definition = itemDefinitionOf(item);
                    return (
                      <li key={item.id}>
                        {definition?.iconUrl ? (
                          <img src={definition.iconUrl} alt="" loading="lazy" />
                        ) : (
                          <span
                            className="character-item-placeholder"
                            aria-hidden="true"
                          >
                            ◇
                          </span>
                        )}
                        <span>
                          <strong>{definition?.name ?? "Equipment"}</strong>
                          <small>{item.equipmentSlot.replace(/-/g, " ")}</small>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="character-roster-note">No items equipped.</p>
              )}
            </GamePanel>
          </div>
        )}
      </div>
      {actor && error && (
        <div className="character-select-error">
          <GameNotice kind="danger">{error}</GameNotice>
        </div>
      )}
    </HangarShell>
  );
}
