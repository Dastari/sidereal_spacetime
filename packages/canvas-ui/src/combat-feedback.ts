/**
 * Hit feedback from authoritative rows only: the damage number of the actor's latest accepted
 * shot (`own_combat_impact`), a red edge flash when the actor's own health drops and a downed
 * banner (`own_character_vitals`). Nothing here predicts or decides damage.
 */
import { CanvasUI, palette } from "./toolkit";

export interface CombatHitFeedback {
  shotSequence: bigint;
  damage: number;
  /** "character" | "object" | "hull" | ... */
  kind: string;
  /** Display name of the struck object ("Crewmate" for characters). */
  label: string;
  /** Component damage state, or "downed" for a character this shot took down. */
  targetState: string;
  targetHp: number;
  targetMaxHp: number;
}
export interface VitalsFeedback {
  health: number;
  maxHealth: number;
  state: string;
  /** Server time (µs since the epoch) a downed character stands up. */
  downedUntilMicros: bigint;
  hitSequence: bigint;
  lastHitDamage: number;
}

const NUMBER_MS = 1300;
const FLASH_MS = 450;
const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Text of the damage number for a shot (exported for tests). */
export function hitText(hit: CombatHitFeedback): string {
  const amount = Math.round(hit.damage);
  const head = amount > 0 ? `-${amount}` : "No damage";
  const detail =
    hit.targetState === "downed"
      ? `${hit.label} down`
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
    if (vitals?.state === "downed") {
      const left = Math.max(
        0,
        Math.ceil((Number(vitals.downedUntilMicros) - wallMicros()) / 1e6),
      );
      const r = { x: Math.max(16, (w - 360) / 2), y: h * 0.32, w: 360, h: 62 };
      ui.panel(r, true);
      ui.text("You are down", r.x + 16, r.y + 8, 22, palette.red, r.w - 32);
      ui.text(
        left > 0
          ? `Standing up in ${left} s · no moving, aiming or piloting`
          : "Standing up…",
        r.x + 16,
        r.y + 38,
        12,
        palette.muted,
        r.w - 32,
      );
      // Keep the countdown ticking until the server stands the character up.
      animating = true;
    }
    if (animating) requestAnimationFrame(redraw);
  };
}
