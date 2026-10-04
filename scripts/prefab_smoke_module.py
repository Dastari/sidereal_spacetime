"""Build an isolated smoke-only module that can assign a developer prefab ship.

The production world has no player-callable prefab assignment: SHIPS-REMOVAL owns the
operator reducer. This copies packages/world into the reserved fresh smoke fixture and
appends smoke-only reducers that call the real `installPrefabShip` for the caller's
own character and the real component damage adapter on the caller's own ship. Never edits
packages/world or publishes to a shared database.
"""
from pathlib import Path
import shutil

ADDON = '''
import { installPrefabShip } from "./prefab-ship-authority";
import { itemDefinitions as smokeItemDefinitions, commitPin as commitSmokePin } from "./item-definitions";
import { legacyInventorySnapshot as smokeInventorySnapshot, synchronizeLegacyInventory as syncSmokeInventory } from "./scoped-inventory-authority";
import { firstInventoryPlacement as smokePlacement, validateInventory as validateSmokeInventory } from "@sidereal/sim/inventory";
import { LIQUID_DENSITY_KG_PER_LITRE as smokeDensity, CHARACTER_CARRY_LIMIT_KG as smokeCarryLimit } from "@sidereal/content/inventory";
export const assignPrefabSmokeShip = db.reducer({prefabId:t.string()},auth.gameAction((ctx,args)=>{
  const actors=[...ctx.db.character.by_owner.filter(ctx.sender)];
  if(actors.length!==1)throw new SenderError("One owned smoke character required");
  if(!/^[a-z0-9][a-z0-9.-]{2,63}$/.test(args.prefabId))throw new SenderError("Invalid prefab id");
  installPrefabShip(ctx,actors[0],{prefabId:args.prefabId,pose:{kind:"berth"}});
  // Real carried belt fixture for bed equip/hotbar refusal. No production reducer or reach bypass.
  const actor=actors[0], before=smokeInventorySnapshot(ctx,actor.id);
  if(!before.items.some(i=>i.definitionId==="wardrobe-t2-belt")){
    const pockets=before.containers.find(c=>c.carried&&!c.parentItemId&&c.kind==="grid");
    if(!pockets)throw new SenderError("Existing carried smoke pockets required");
    const defs=smokeItemDefinitions(ctx), id=ctx.newUuidV4().toString();
    defs.stage(id,"wardrobe-t2-belt");
    const item={id,characterId:actor.id,definitionId:"wardrobe-t2-belt",containerId:"",equipmentSlot:"",x:0,y:0,rotated:false};
    const pending={...before,items:[...before.items,item]};
    const location=smokePlacement(pending,defs.grid,smokeDensity,pockets.id,smokeCarryLimit,id,pockets.id);
    if(!location)throw new SenderError("Free carried belt fixture space required");
    const placed={...item,...location};
    validateSmokeInventory({...before,items:[...before.items,placed]},defs.grid,smokeDensity,pockets.id,smokeCarryLimit);
    ctx.db.inventoryItem.insert(placed);commitSmokePin(ctx,defs,id);syncSmokeInventory(ctx,actor.id,before);
  }
},true));
// Smoke-only trigger for large component damage (a handheld needs ~90 shots to kill a reactor):
// the real damage adapter on the caller's own ship, so the smoke can check the flight effect.
import { damageComponent as damageSmokeComponent } from "./combat-damage";
export const damagePrefabSmokeComponent = db.reducer({objectId:t.string(),damage:t.f64()},auth.gameAction((ctx,args)=>{
  const actors=[...ctx.db.character.by_owner.filter(ctx.sender)];
  if(actors.length!==1)throw new SenderError("One owned smoke character required");
  const ship=ctx.db.ship.id.find(actors[0].shipId);
  if(!ship||!ship.owner.isEqual(ctx.sender))throw new SenderError("Own prefab ship required");
  if(!(args.damage>0&&args.damage<=100000))throw new SenderError("Bounded damage required");
  damageSmokeComponent(ctx,ship.id,args.objectId,args.damage,true);
},true));
// Smoke-only lethal hit on the caller's own character through the real character damage adapter
// (a handheld beam never hits its own shooter, and a lone smoke identity has no crewmate).
import { damageCharacter as damageSmokeCharacter } from "./combat-damage";
export const damagePrefabSmokeCharacter = db.reducer({damage:t.f64()},auth.gameAction((ctx,args)=>{
  const actors=[...ctx.db.character.by_owner.filter(ctx.sender)];
  if(actors.length!==1)throw new SenderError("One owned smoke character required");
  if(!(args.damage>0&&args.damage<=100000))throw new SenderError("Bounded damage required");
  damageSmokeCharacter(ctx,actors[0].id,args.damage);
}));
// Smoke-only (items batch A): the caller's held item becomes another weapon definition (same item
// UUID, fresh weapon state), so one smoke identity can exercise every fire mode. Production stocks
// real items through operator_stock_ship_cargo and equips them.
import { LAB_WEAPONS as SMOKE_WEAPONS } from "../../content/src/weapons";
export const holdPrefabSmokeWeapon = db.reducer({definitionId:t.string()},auth.gameAction((ctx,args)=>{
  const actors=[...ctx.db.character.by_owner.filter(ctx.sender)];
  if(actors.length!==1)throw new SenderError("One owned smoke character required");
  if(!SMOKE_WEAPONS[args.definitionId])throw new SenderError("Weapon definition required");
  const item=[...ctx.db.inventoryItem.by_character.filter(actors[0].id)].find(i=>i.equipmentSlot==="hand");
  if(!item)throw new SenderError("Hold the starter pistol first");
  ctx.db.inventoryItem.id.update({...item,definitionId:args.definitionId});
  if(ctx.db.weaponEnergy.itemId.find(item.id))ctx.db.weaponEnergy.itemId.delete(item.id);
},true));
// Smoke-only (EVA milestone 2): wear the EVA suit (pressure suit, helmet, jetpack, mag boots) on
// the caller's character. Production stocks it (ship_cargo.py --kit eva-suit) and the player equips it.
export const wearPrefabSmokeEvaSuit = db.reducer({},auth.gameAction((ctx)=>{
  const actors=[...ctx.db.character.by_owner.filter(ctx.sender)];
  if(actors.length!==1)throw new SenderError("One owned smoke character required");
  const worn=[...ctx.db.inventoryItem.by_character.filter(actors[0].id)];
  for(const [slot,part] of [["uniform","body"],["helmet","helmet"],["back","pack"],["boots","boots"]]){
    // A worn item in the slot becomes the suit part (same UUID, like holdPrefabSmokeWeapon).
    const old=worn.find(i=>i.equipmentSlot===slot);
    if(old){ctx.db.inventoryItem.id.update({...old,definitionId:"wardrobe-suit-"+part});continue;}
    ctx.db.inventoryItem.insert({id:ctx.newUuidV4().toString(),characterId:actors[0].id,definitionId:"wardrobe-suit-"+part,containerId:"",equipmentSlot:slot,x:0,y:0,rotated:false});
  }
},true));
// S4-2 isolated lifecycle/restart fixture. This ADDON is never in the production module.
export const exercisePrefabPowerSmoke = db.reducer({action:t.string()},auth.gameAction((ctx,args)=>{
  const actor=[...ctx.db.character.by_owner.filter(ctx.sender)][0];
  const ship=actor && ctx.db.ship.id.find(actor.shipId);
  if(!actor||!ship||!ship.owner.isEqual(ctx.sender))throw new SenderError("Own smoke ship required");
  if(args.action==="checkpoint"){
    for(const timer of ctx.db.movementTimer.iter())ctx.db.movementTimer.scheduledId.delete(timer.scheduledId);
    const battery=[...ctx.db.shipPowerDevice.by_ship.filter(ship.id)].find(d=>d.mountId==="mount:battery");
    if(!battery)throw new SenderError("Issued battery required");
    // Fixture seeding of a non-full value exposes accidental compiler/restart charging.
    ctx.db.shipPowerDevice.id.update({...battery,energyJ:123456});
  }else if(args.action==="recompile"){
    ctx.db.shipPowerState.shipId.delete(ship.id);
    shipSystems.compileShipSystemsFor(ctx,ship.id);
  }else if(args.action==="refit-retain"){
    shipPower.installPrefabPower(ctx,ship.id);
  }else if(args.action==="replace"){
    const battery=[...ctx.db.shipPowerDevice.by_ship.filter(ship.id)].find(d=>d.mountId==="mount:battery");
    if(!battery)throw new SenderError("Issued battery required");
    shipPower.replaceInstalledPowerDevice(ctx,ship.id,battery.mountId,battery.id);
  }else throw new SenderError("Known smoke lifecycle action required");
},true));
'''


VISIBILITY_TABLE = """
const observerVisibilitySmokeSnapshot = table({name:"observer_visibility_smoke_snapshot",public:false},{
  characterId:t.string().primaryKey(),locationJson:t.string(),hadTimer:t.bool(),crewIds:t.array(t.string()),deckId:t.string(),shipIds:t.array(t.string())
});
"""
VISIBILITY_ADDON = r'''
// Density and observer fixtures exist only in the reserved test-module copy. World time is
// paused for stable wire assertions; cleanup restores the accepted location and timer.
export const exerciseObserverVisibilitySmoke = db.reducer({phase:t.string()},auth.gameAction((ctx,args)=>{
  const actors=[...ctx.db.character.by_owner.filter(ctx.sender)];
  if(actors.length!==1)throw new SenderError("One owned smoke character required");
  const actor=actors[0], motion=ctx.db.shipWorldMotion.shipId.find(actor.shipId), ship=ctx.db.ship.id.find(actor.shipId);
  if(!motion||!ship?.owner.isEqual(ctx.sender))throw new SenderError("Own admitted smoke ship required");
  let saved=ctx.db.observerVisibilitySmokeSnapshot.characterId.find(actor.id);
  const encode=(v:unknown)=>JSON.stringify(v,(_key,value)=>typeof value==="bigint"?value.toString()+"n":value);
  const decode=(v:string)=>JSON.parse(v,(_key,value)=>typeof value==="string"&&/^-?\d+n$/.test(value)?BigInt(value.slice(0,-1)):value);
  if(args.phase==="prepare"){
    if(saved||ctx.db.evaBody.characterId.find(actor.id))throw new SenderError("Fresh aboard fixture required");
    const location=ctx.db.constructionLocation.characterId.find(actor.id), deck=location&&ctx.db.constructionDeck.id.find(location.deckId);
    if(!location||!deck)throw new SenderError("Accepted deck required");
    if(Math.abs(motion.x)>=400)throw new SenderError("Home fixture must remain near world origin");
    const hadTimer=ctx.db.movementTimer.count()>0n;
    for(const timer of ctx.db.movementTimer.iter())ctx.db.movementTimer.scheduledId.delete(timer.scheduledId);
    const deckId=ctx.newUuidV4().toString();
    ctx.db.constructionDeck.insert({...deck,id:deckId,name:"Visibility fixture other deck",elevation:deck.elevation+3});
    const crewIds:string[]=[];
    for(let i=0;i<600;i++){
      const id=ctx.newUuidV4().toString();crewIds.push(id);
      ctx.db.character.insert({...actor,id,owner:ctx.identity,name:"Visibility fixture "+i,connected:false,sprinting:false});
      ctx.db.constructionLocation.insert({...location,characterId:id,visitId:ctx.newUuidV4().toString(),deckId:i<300?location.deckId:deckId});
    }
    const shipIds:string[]=[];
    for(const [name,id,x] of [["home","00000000-0000-4000-8000-000000000001",motion.x+200],["positive","00000000-0000-4000-8000-000000000002",1300],["negative","00000000-0000-4000-8000-000000000003",-1300]] as const){
      shipIds.push(id);
      ctx.db.ship.insert({...ship,id,owner:ctx.identity,name:"Visibility fixture "+name,x,y:motion.y});
      ctx.db.shipWorldMotion.insert({...motion,shipId:id,x,cellX:BigInt(Math.floor(x/400))});
    }
    ctx.db.observerVisibilitySmokeSnapshot.insert({characterId:actor.id,locationJson:encode(location),hadTimer,crewIds,deckId,shipIds});
    return;
  }
  if(!saved)throw new SenderError("Prepared visibility fixture required");
  const restoreLocation=()=>{
    ctx.db.evaBody.characterId.delete(actor.id);
    if(!ctx.db.constructionLocation.characterId.find(actor.id))ctx.db.constructionLocation.insert(decode(saved!.locationJson));
  };
  if(args.phase==="positive"||args.phase==="negative"){
    const location=decode(saved.locationJson), x=args.phase==="positive"?1200:-1200, before=ctx.db.evaBody.characterId.find(actor.id);
    ctx.db.constructionLocation.characterId.delete(actor.id);
    const next={characterId:actor.id,owner:ctx.sender,systemId:motion.systemId,cellX:BigInt(Math.floor(x/400)),cellY:motion.cellY,
      phase:"free",x,y:motion.y,vx:0,vy:0,heading:0,anchorShipId:"",localX:0,localY:0,localHeading:0,refShipId:"",refVx:0,refVy:0,
      forward:0,strafe:0,turn:0,walking:false,exitShipId:actor.shipId,visitId:location.visitId,deckId:location.deckId,returnEndsMicros:0n,
      serverTick:motion.serverTick,revision:(before?.revision??0n)+1n};
    if(before)ctx.db.evaBody.characterId.update(next);else ctx.db.evaBody.insert(next);
  }else if(args.phase==="return")restoreLocation();
  else if(args.phase==="cleanup"){
    restoreLocation();
    for(const id of saved.crewIds){ctx.db.constructionLocation.characterId.delete(id);ctx.db.character.id.delete(id);}
    ctx.db.constructionDeck.id.delete(saved.deckId);
    for(const id of saved.shipIds){ctx.db.shipWorldMotion.shipId.delete(id);ctx.db.ship.id.delete(id);}
    ctx.db.observerVisibilitySmokeSnapshot.characterId.delete(actor.id);
    if(saved.hadTimer&&ctx.db.movementTimer.count()===0n)ctx.db.movementTimer.insert({scheduledId:0n,scheduledAt:ScheduleAt.interval(50000n)});
  }else throw new SenderError("Known visibility fixture phase required");
}));
'''


def publish(dev, database, evidence):
    prefix = dev.CFG['project']['database'] + '-'
    if not database.startswith(prefix) or not database.endswith('-smoke') or database == dev.CFG['project']['database'] or not evidence:
        raise RuntimeError('Prefab test module requires a reserved isolated smoke database')
    dev.run(["npm", "run", "typecheck", "--workspace", "@sidereal/world"])
    stage = Path(evidence) / 'test-module'
    if stage.exists():
        raise RuntimeError('Prefab test module stage already exists; reserve a fresh run')
    packages = stage / 'packages'
    packages.mkdir(parents=True)
    world = packages / 'world'
    shutil.copytree(dev.ROOT / 'packages/world/src', world / 'src')
    shutil.copy2(dev.ROOT / 'packages/world/package.json', world / 'package.json')
    shutil.copy2(dev.ROOT / 'packages/world/tsconfig.json', world / 'tsconfig.json')
    shutil.copy2(dev.ROOT / 'tsconfig.json', stage / 'tsconfig.json')
    for source in (dev.ROOT / 'packages').iterdir():
        if source.is_dir() and source.name != 'world':
            (packages / source.name).symlink_to(source, target_is_directory=True)
    index = world / 'src/index.ts'
    text = index.read_text()
    if text.count('const db = schema({') != 1:
        raise RuntimeError('World schema integration marker changed')
    text = text.replace('const db = schema({', VISIBILITY_TABLE + '\nconst db = schema({\n  observerVisibilitySmokeSnapshot,', 1)
    index.write_text(text + '\n' + ADDON + '\n' + VISIBILITY_ADDON)
    dev.cli('publish', database, '--server', dev.DB_URL, '--module-path', str(world), '--yes', '--no-config', '--delete-data=never')
    bindings = stage / 'generated'
    dev.cli('generate', '--lang', 'typescript', '--out-dir', str(bindings), '--module-path', str(world), '--yes')
    return str(bindings / 'index.ts')
