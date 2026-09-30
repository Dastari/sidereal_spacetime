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
export const assignPrefabSmokeShip = db.reducer({prefabId:t.string()},auth.gameAction((ctx,args)=>{
  const actors=[...ctx.db.character.by_owner.filter(ctx.sender)];
  if(actors.length!==1)throw new SenderError("One owned smoke character required");
  if(!/^[a-z0-9][a-z0-9.-]{2,63}$/.test(args.prefabId))throw new SenderError("Invalid prefab id");
  installPrefabShip(ctx,actors[0],{prefabId:args.prefabId,pose:{kind:"berth"}});
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
    index.write_text(text + '\n' + ADDON)
    dev.cli('publish', database, '--server', dev.DB_URL, '--module-path', str(world), '--yes', '--no-config', '--delete-data=never')
    bindings = stage / 'generated'
    dev.cli('generate', '--lang', 'typescript', '--out-dir', str(bindings), '--module-path', str(world), '--yes')
    return str(bindings / 'index.ts')
