/**
 * Hit feedback from authoritative rows only: the damage number of the actor's latest accepted
 * shot (`own_combat_impact`), a red edge flash when the actor's own health drops and the death
 * screen with its respawn countdown (`own_character_vitals`). Nothing here predicts or decides
 * damage, death or respawn: the server respawns the character automatically.
 */
import { CanvasUI, palette } from "./toolkit";

export interface CombatHitFeedback {
  shotSequence: bigint;
  damage: number;
  /** "character" | "object" | "hull" | ... */
  kind: string;
  /** Display name of the struck object ("Crewmate" for characters). */
  label: string;
  /** Component damage state, or "dead" for a character this shot killed. */
  targetState: string;
  targetHp: number;
  targetMaxHp: number;
}
export interface VitalsFeedback {
  health: number;
  maxHealth: number;
  state: string;
  /** While dead: server time (µs since the epoch) of the automatic respawn. */
  downedUntilMicros: bigint;
  hitSequence: bigint;
  lastHitDamage: number;
  /** Name of the ship the character respawns aboard, when known (presentation only). */
  respawnAboard?: string;
}

/** Death screen lines for the countdown (exported for tests). */
export function deathText(
  vitals: Pick<VitalsFeedback, "downedUntilMicros" | "respawnAboard">,
  wallMicros: number,
) {
  const left = Math.max(
    0,
    Math.ceil((Number(vitals.downedUntilMicros) - wallMicros) / 1e6),
  );
  const where = vitals.respawnAboard ? ` aboard ${vitals.respawnAboard}` : "";
  return {
    title: "You died",
    countdown:
      left > 0 ? `Respawning${where} in ${left} s` : `Respawning${where}…`,
    note: "Your inventory is safe. Nothing was dropped.",
  };
}

const NUMBER_MS = 1300;
const FLASH_MS = 450;
const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Text of the damage number for a shot (exported for tests). */
export function hitText(hit: CombatHitFeedback): string {
  const amount = Math.round(hit.damage);
  const head = amount > 0 ? `-${amount}` : "No damage";
  const detail =
    hit.targetState === "dead"
      ? `${hit.label} killed`
      : hit.targetMaxHp > 0
        ? `${hit.label} · ${title(hit.targetState)} ${Math.ceil(hit.targetHp)}/${hit.targetMaxHp}`
        : hit.label;
  return `${head}  ${detail}`;
}

export function createCombatFeedback(
  clock: () => number = () => performance.now(),
  wallMicros: () => number = () => Date.now() * 1000,
) {
  let lastShot: bigint | undefined;
  let shotAt = -Infinity;
  let shot: CombatHitFeedback | undefined;
  let lastHitSeq: bigint | undefined;
  let hurtAt = -Infinity;
  let hurt = 0;
  let primed = false;
  return function draw(
    ui: CanvasUI,
    w: number,
    h: number,
    state: {
      connected: boolean;
      combat?: { lastHit?: CombatHitFeedback };
      vitals?: VitalsFeedback;
    },
    redraw: () => void,
  ) {
    const now = clock();
    const hit = state.combat?.lastHit;
    const vitals = state.vitals;
    // Rows present when the subscription becomes ready are history, not new hits.
    if (!primed) {
      if (!state.connected) return;
      primed = true;
      lastShot = hit?.shotSequence;
      lastHitSeq = vitals?.hitSequence;
    }
    if (hit && hit.shotSequence !== lastShot) {
      if (hit.damage > 0 || hit.kind === "object" || hit.kind === "character") {
        shot = hit;
        shotAt = now;
      }
      lastShot = hit.shotSequence;
    }
    if (vitals && vitals.hitSequence !== lastHitSeq) {
      if (vitals.hitSequence > (lastHitSeq ?? 0n)) {
        hurtAt = now;
        hurt = vitals.lastHitDamage;
      }
      lastHitSeq = vitals.hitSequence;
    }
    const c = ui.ctx;
    let animating = false;
    // Being hit: red edge flash and the damage taken.
    const hurtK = (now - hurtAt) / FLASH_MS;
    if (hurtK < 1) {
      animating = true;
      c.save();
      const alpha = 0.55 * (1 - hurtK);
      const grad = c.createRadialGradient(
        w / 2,
        h / 2,
        Math.min(w, h) * 0.3,
        w / 2,
        h / 2,
        Math.max(w, h) * 0.75,
      );
      grad.addColorStop(0, "rgba(255,40,70,0)");
      grad.addColorStop(1, `rgba(255,40,70,${alpha.toFixed(3)})`);
      c.fillStyle = grad;
      c.fillRect(0, 0, w, h);
      c.restore();
      if (hurt > 0) {
        c.save();
        c.globalAlpha = 1 - hurtK;
        ui.text(`-${Math.round(hurt)} health`, 28, h - 214, 18, palette.red);
        c.restore();
      }
    }
    // The shooter's damage number rises and fades above the combat panel.
    const shotK = (now - shotAt) / NUMBER_MS;
    if (shot && shotK < 1) {
      animating = true;
      const text = hitText(shot);
      c.save();
      c.globalAlpha = Math.min(1, 2.2 * (1 - shotK));
      c.font = '600 20px "Barlow Condensed", Barlow, sans-serif';
      const width = c.measureText(text).width;
      ui.text(
        text,
        Math.max(16, (w - width) / 2),
        h - 214 - shotK * 34,
        20,
        shot.damage > 0 ? palette.gold : palette.muted,
      );
      c.restore();
    }
    if (vitals?.state === "dead") {
      // Death screen: darken the view, keep the body (death animation) visible in the middle.
      c.save();
      const shade = c.createRadialGradient(
        w / 2,
        h / 2,
        Math.min(w, h) * 0.15,
        w / 2,
        h / 2,
        Math.max(w, h) * 0.7,
      );
      shade.addColorStop(0, "rgba(20,0,8,0.25)");
      shade.addColorStop(1, "rgba(40,0,12,0.72)");
      c.fillStyle = shade;
      c.fillRect(0, 0, w, h);
      c.restore();
      const text = deathText(vitals, wallMicros());
      const width = Math.min(420, w - 32);
      const r = { x: (w - width) / 2, y: h * 0.18, w: width, h: 96 };
      ui.panel(r, true);
      ui.text(text.title, r.x + 18, r.y + 10, 30, palette.red, r.w - 36);
      ui.text(text.countdown, r.x + 18, r.y + 48, 15, palette.text, r.w - 36);
      ui.text(text.note, r.x + 18, r.y + 70, 12, palette.muted, r.w - 36);
      // Keep the countdown ticking until the server respawns the character.
      animating = true;
    }
    if (animating) requestAnimationFrame(redraw);
  };
}
