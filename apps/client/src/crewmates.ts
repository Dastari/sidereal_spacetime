import { itemDefinitionOf } from "@sidereal/content/item-presentation";
import type { CombatActionState, RemoteCrewState } from "@sidereal/render";
import type { CrewAppearance } from "@sidereal/render/crew/appearance";
import { equipmentAppearance } from "./inventory";

/** `current_interior_crew` row: accepted position of a body on the viewer's deck. */
export interface InteriorCrewRow {
  characterId: string;
  name: string;
  shipId: string;
  deckId: string;
  localX: number;
  localY: number;
  standingElevationM: number;
  connected: boolean;
  sprinting: boolean;
}
/** `visible_crew_presentation` row: looks and pose of another body on the viewer's deck. */
export interface CrewPresentationRow {
  characterId: string;
  shipId: string;
  deckId: string;
  appearanceJson: string;
  equipmentJson: string;
  dead: boolean;
  seated: boolean;
  aimActive: boolean;
  aimAngle: number;
  shotSequence: bigint;
  shotX: number;
  shotY: number;
  shotStruck: boolean;
}

function parseObject(json: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(json);
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/**
 * Join the two server views into what the renderer draws for other characters. A body is drawn only
 * when both views agree on its ship and deck (they update separately), and never the viewer's own.
 */
/** Server cosmetic document + worn catalogue ids → the crew look and held r001 item. */
export function presentationLook(
  appearanceJson: string,
  equipmentJson: string,
) {
  const items = Object.entries(parseObject(equipmentJson))
    .filter((entry): entry is [string, string] => typeof entry[1] === "string")
    .map(([equipmentSlot, definitionId]) => ({ equipmentSlot, definitionId }));
  return equipmentAppearance(
    items,
    parseObject(appearanceJson) as CrewAppearance,
  );
}

export function crewmatesFromViews(
  interior: Iterable<InteriorCrewRow>,
  presentation: Iterable<CrewPresentationRow>,
  selfId: string | undefined,
): RemoteCrewState[] {
  const looks = new Map<string, CrewPresentationRow>();
  for (const row of presentation) looks.set(row.characterId, row);
  const out: RemoteCrewState[] = [];
  for (const body of interior) {
    const look = looks.get(body.characterId);
    if (
      body.characterId === selfId ||
      !look ||
      look.shipId !== body.shipId ||
      look.deckId !== body.deckId
    )
      continue;
    const { crewAppearance, heldItem } = presentationLook(
      look.appearanceJson,
      look.equipmentJson,
    );
    out.push({
      id: body.characterId,
      name: body.name,
      localX: body.localX,
      localY: body.localY,
      elevation: body.standingElevationM,
      connected: body.connected,
      sprinting: body.sprinting,
      seated: look.seated,
      dead: look.dead,
      aimActive: look.aimActive,
      aimAngle: look.aimAngle,
      shotSequence: look.shotSequence,
      shot:
        look.shotSequence > 0n
          ? { x: look.shotX, y: look.shotY, struck: look.shotStruck }
          : undefined,
      appearance: crewAppearance,
      heldItem,
    });
  }
  return out;
}

/** `visible_combat_actions` row: latest combat action of a body on the viewer's deck (own included). */
export interface CombatActionRow {
  characterId: string;
  definitionId: string;
  mode: string;
  shotSequence: bigint;
  originX: number;
  originY: number;
  pointsJson: string;
  landX: number;
  landY: number;
  detonated: boolean;
  blastRadiusM: number;
  reloadSequence: bigint;
  stunSequence: bigint;
}

function parsePoints(json: string): [number, number, number][] {
  try {
    const value: unknown = JSON.parse(json);
    if (!Array.isArray(value)) return [];
    return value
      .filter(
        (p): p is [number, number, number] =>
          Array.isArray(p) &&
          p.length === 3 &&
          p.every((n) => typeof n === "number" && Number.isFinite(n)),
      )
      .slice(0, 32);
  } catch {
    return [];
  }
}

/** Presentation input for the r001 weapon FX: the weapon's r001 item from its inventory definition. */
export function combatActionsFromView(
  rows: Iterable<CombatActionRow>,
): CombatActionState[] {
  const out: CombatActionState[] = [];
  for (const row of rows)
    out.push({
      characterId: row.characterId,
      crewItemId:
        itemDefinitionOf({ definitionId: row.definitionId })?.crewItemId ??
        null,
      mode: row.mode,
      shotSequence: row.shotSequence,
      points: parsePoints(row.pointsJson),
      originX: row.originX,
      originY: row.originY,
      landX: row.landX,
      landY: row.landY,
      detonated: row.detonated,
      blastRadiusM: row.blastRadiusM,
      reloadSequence: row.reloadSequence,
      stunSequence: row.stunSequence,
    });
  return out;
}
