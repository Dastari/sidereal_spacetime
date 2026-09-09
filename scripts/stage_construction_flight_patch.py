"""Stage narrow next-world registration; never mutate running parent-owned source."""
import difflib, hashlib, json, re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
changes={}
def edit(path,fn):
    old=(ROOT/path).read_text(); new=fn(old); changes[path]=(old,new)
def once(s,old,new):
    if s.count(old)!=1: raise RuntimeError(f'Expected one current integration anchor: {old[:100]!r}')
    return s.replace(old,new,1)
def index(s):
    s='''import { constructionFlightBinding, constructionFlightFitting, constructionFlightStation, constructionFlightReceipt } from "./construction-flight-tables";
import { constructionPilotSeat } from "./construction-pilot-tables";
import { constructionFlightReview } from "./construction-flight-review-tables";
import { authoredFlightProjection, authoredFlightFittingProjection, ownAuthoredFlights as readAuthoredFlights, ownAuthoredFlightFittings as readAuthoredFlightFittings } from "./construction-flight-views";
import { beginConstructionFlightReview, returnConstructionFlightReview } from "./construction-flight-review";
import { installConstructionFlightAuthority } from "./construction-flight-authority";
import { activateConstructionFlight } from "./construction-flight-activation";
import { resolveShipFlightDefinition } from "./construction-flight-resolver";
import { enterConstructionPilotAuthority, canConsumeConstructionPilot, recoverConstructionPilotAuthority, recoverPendingConstructionPilots } from "./construction-pilot-authority";
'''+s
    s=once(s,'const db = schema({','const db = schema({\n  constructionFlightBinding, constructionFlightFitting, constructionFlightStation, constructionFlightReceipt, constructionPilotSeat, constructionFlightReview,')
    s=once(s,'    constructionInteractions.recoverConstructionSeats(ctx);','    constructionInteractions.recoverConstructionSeats(ctx);\n    recoverPendingConstructionPilots(ctx);')
    s=once(s,'stepSharedWorld(ctx);','''stepSharedWorld(ctx, undefined, {
      definitionForShip: shipId => resolveShipFlightDefinition({
        binding: id => ctx.db.constructionFlightBinding.shipId.find(id),
        constructionInstanceExists: id => !!ctx.db.constructionInstance.id.find(id),
        currentInstanceRevision: id => ctx.db.constructionInstance.id.find(id)?.revision,
        fittings: id => ctx.db.constructionFlightFitting.by_ship.filter(id),
      }, shipId),
      canPilot: characterId => {
        const actor = ctx.db.character.id.find(characterId);
        return !!actor && (!ctx.db.constructionFlightBinding.shipId.find(actor.shipId) || canConsumeConstructionPilot(ctx, characterId));
      },
    });''')
    s=once(s,'const controlled = !onStair && seat?.operational && seat.occupantId === actor.id;','''const controlled = !onStair && seat?.operational && seat.occupantId === actor.id &&
      (!ctx.db.constructionFlightBinding.shipId.find(actor.shipId) || canConsumeConstructionPilot(ctx, actor.id));''')
    start=s.index('export const useStation = db.reducer(');at=s.index('  const seat = ctx.db.station.shipId.find(actor.shipId);',start)
    s=s[:at]+'''  if (ctx.db.constructionFlightBinding.shipId.find(actor.shipId))
    throw new SenderError("Use the native construction pilot command");
'''+s[at:]
    s+='''
// Explicit owner review membership switch; ordinary login never invokes these.
export const beginAuthoredFlightReview = db.reducer({expectedVisitId:t.string(),expectedVisitRevision:t.u64(),expectedAdmissionRevision:t.u64(),operationId:t.string()},auth.gameAction(beginConstructionFlightReview,true));
export const returnAuthoredFlightReview = db.reducer({expectedVisitId:t.string(),expectedVisitRevision:t.u64(),expectedAdmissionRevision:t.u64(),operationId:t.string()},auth.gameAction(returnConstructionFlightReview,true));
// Explicit additive installation/activation. Neither boards nor moves an actor.
export const installAuthoredShipFlight = db.reducer({instanceId:t.string(), expectedInstanceRevision:t.u64(), operationId:t.string()}, auth.gameAction((ctx,args) => {
  installConstructionFlightAuthority(ctx,args,{reserveBerth: current => {
    const system = sharedWorld.ensureCanonicalSystem(current.db);
    return {systemId:system.id,...sharedWorld.reserveBerth(current.db,system.id),serverTick:current.timestamp.microsSinceUnixEpoch/50_000n};
  }});
}));
export const activateAuthoredShipFlight = db.reducer({shipId:t.string(),expectedRevision:t.u64(),operationId:t.string()},auth.gameAction(activateConstructionFlight));
export const enterAuthoredPilot = db.reducer({stationId:t.string(),expectedStationRevision:t.u64(),operationId:t.string()},auth.gameAction(enterConstructionPilotAuthority,true));
export const leaveAuthoredPilot = db.reducer(auth.gameAction(ctx => {
  const actor=[...ctx.db.character.by_owner.filter(ctx.sender)][0];
  if (!actor?.connected) throw new SenderError("Active character required");
  recoverConstructionPilotAuthority(ctx,actor.id,"stand");
},true));
export const ownAuthoredFlights=db.view({name:"own_authored_flights",public:true},t.array(authoredFlightProjection),auth.gameView(readAuthoredFlights));
export const ownAuthoredFlightFittings=db.view({name:"own_authored_flight_fittings",public:true},t.array(authoredFlightFittingProjection),auth.gameView(readAuthoredFlightFittings));
'''
    return s

def physics(s):
    s='import type { resolveShipFlightDefinition } from "./construction-flight-resolver";\n'+s
    s=once(s,'  systemId = SHARED_SYSTEM_SEED.systemId,\n): SharedPhysicsReport {','''  systemId = SHARED_SYSTEM_SEED.systemId,
  hooks?: {definitionForShip(shipId:string):ReturnType<typeof resolveShipFlightDefinition>;canPilot(characterId:string):boolean},
): SharedPhysicsReport {''')
    s=once(s,'    shipRows.set(ship.shipId, ship);','''    const definition = hooks?.definitionForShip(ship.shipId) ?? {status:"ready" as const,mass:LAB_FLIGHT_MASS,hull:LAB_HULL,profile:LAB_FLIGHT_PROFILE,speed:LAB_FLIGHT_SPEED,computer:LAB_FLIGHT_COMPUTER,actuators:LAB_FLIGHT_ACTUATORS};
    if(definition.status === "invalid") return {...report,status:"exhausted",reason:definition.reason};
    shipRows.set(ship.shipId, ship);''')
    s=s.replace('      ...LAB_HULL,','      ...definition.hull,').replace('      massKg: LAB_FLIGHT_MASS.massKg,','      massKg: definition.mass.massKg,').replace('      inertia: LAB_FLIGHT_MASS.inertiaKgM2,','      inertia: definition.mass.inertiaKgM2,')
    s=s.replace('      LAB_FLIGHT_COMPUTER.installed &&\n      LAB_FLIGHT_COMPUTER.powered','      definition.computer.installed &&\n      definition.computer.powered &&\n      (!hooks || hooks.canPilot(actor.id))')
    s=s.replace('      mass: LAB_FLIGHT_MASS,','      mass: definition.mass,').replace('      actuators: LAB_FLIGHT_ACTUATORS,','      actuators: definition.actuators,').replace('      profile: LAB_FLIGHT_PROFILE,','      profile: definition.profile,').replace('      maxForwardSpeed: LAB_FLIGHT_SPEED.forward,','      maxForwardSpeed: definition.speed.forward,').replace('      maxReverseSpeed: LAB_FLIGHT_SPEED.reverse,','      maxReverseSpeed: definition.speed.reverse,')
    return s

def auth(s):
    s='import { recoverConstructionPilotAuthority } from "./construction-pilot-authority";\n'+s
    start=s.index('export function clearOwner(');at=s.index('    combat.clearAim(ctx, actor.id);',start)
    s=s[:at]+'''    if (ctx.db.constructionPilotSeat.characterId.find(actor.id))
      recoverConstructionPilotAuthority(ctx,actor.id,reason);
'''+s[at:]
    return once(s,'    if (seat?.occupantId === actor.id)\n      ctx.db.station.id.update','    if (seat?.occupantId === actor.id && !ctx.db.constructionPilotSeat.characterId.find(actor.id))\n      ctx.db.station.id.update')

def grants(s):
    s='import { recoverConstructionPilotsForGrant } from "./construction-pilot-authority";\n'+s
    return re.sub(r'recoverConstructionSeatsForGrant\(ctx,\s*([^,]+),\s*([^\)]+)\);',lambda m:'{'+m.group(0)+' recoverConstructionPilotsForGrant(ctx,'+m.group(1)+','+m.group(2)+');}',s)

def instances(s):
    marker='  // Returning must remain possible after a workspace grant expires.'
    return once(s,marker,'''  if(ctx.db.constructionPilotSeat.characterId.find(actor.id))
    throw new SenderError("Stand up before leaving construction review");
  if(ctx.db.constructionFlightReview.characterId.find(actor.id))
    throw new SenderError("Use the saved flight-review return transition");
'''+marker)

def shared_views(s):
    s='import { hasAcceptedAuthoredFlight, type AcceptedFlightContext } from "./construction-flight-views";\n'+s
    s=once(s,'db: SharedWorldReadDatabase & {','db: SharedWorldReadDatabase & AcceptedFlightContext["db"] & {')
    s=once(s,'    ctx.db.constructionLocation.characterId.find(actor.id) ||','    (ctx.db.constructionLocation.characterId.find(actor.id) && !hasAcceptedAuthoredFlight(ctx,actor)) ||')
    return s

edit('packages/world/src/shared-world-views.ts',shared_views)
edit('packages/world/src/index.ts',index)
edit('packages/world/src/shared-world-physics.ts',physics)
edit('packages/world/src/shared-world.ts',lambda s:once(s,'function reserveBerth(', 'export function reserveBerth('))
edit('packages/world/src/auth.ts',auth)
edit('packages/world/src/construction.ts',grants)
edit('packages/world/src/construction-instances.ts',instances)
prefix=ROOT/'docs/handoffs/construction_flight_integration'
prefix.with_suffix('.patch').write_text(''.join(''.join(difflib.unified_diff(a.splitlines(True),b.splitlines(True),fromfile='a/'+p,tofile='b/'+p)) for p,(a,b) in changes.items()))
Path(str(prefix)+'_inputs.json').write_text(json.dumps({p:hashlib.sha256(a.encode()).hexdigest() for p,(a,b) in changes.items()},indent=2)+'\n')
(ROOT/'.runtime/construction-flight-shared-preview.json').write_text(json.dumps({str(ROOT/p):b for p,(a,b) in changes.items()}))
print('Staged registration patch; no runtime source applied.')
