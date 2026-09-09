/** Browser intent adapter. Energy and firing permission remain server-owned. */
export type CombatInputState = {
  active: boolean;
  allowed: boolean;
  blocked: boolean;
  weapon?: {itemId:string;revision:bigint;energy:number;shotCost:number;cooldownMs:number};
};
export function createCombatInput(options: {
  state: () => CombatInputState;
  aim: () => number | undefined;
  sendAim: (active:boolean,angle:number) => Promise<unknown>;
  fire: (itemId:string,revision:bigint) => Promise<unknown>;
  error: (error:unknown) => void;
  now?: () => number;
}) {
  let held=false, busy=false, disposed=false, previouslyActive=false, lastFire=-Infinity;
  let pendingPress:string|undefined;
  const now=options.now ?? (()=>performance.now());
  const active=()=>{const s=options.state();return s.active&&s.allowed&&!s.blocked&&!disposed;};
  async function tick() {
    if (busy || disposed) return;
    busy=true;
    try {
      const angle=options.aim();
      const aiming=active() && angle!==undefined && Number.isFinite(angle);
      if (aiming || previouslyActive) await options.sendAim(aiming,angle??0);
      previouslyActive=aiming;
      // Recheck after awaiting the heartbeat: a menu/disconnect can intervene.
      const weapon=options.state().weapon;
      const pressed=!!weapon&&pendingPress===weapon.itemId;
      pendingPress=undefined;
      if (aiming && active() && (held || pressed) && weapon && weapon.energy>=weapon.shotCost && now()-lastFire>=weapon.cooldownMs) {
        await options.fire(weapon.itemId,weapon.revision);
        lastFire=now();
      }
    } catch(error) { pendingPress=undefined;if(!disposed)options.error(error); }
    finally {busy=false;}
  }
  return {
    tick,
    trigger(pressed:boolean) {held=pressed;if(pressed){pendingPress=active()?options.state().weapon?.itemId:undefined;void tick();}},
    cancel() {held=false;pendingPress=undefined;},
    dispose() {disposed=true;held=false;pendingPress=undefined;},
  };
}
