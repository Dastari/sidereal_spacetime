"""Build isolated fault/event triggers around the real world implementation.

Never edits packages/world or publishes a test trigger to the shared database.
The two fixed events exercise the production server-only damage producer and
fail-closed definition handling; this is not weapon hit detection.
"""
from pathlib import Path
import shutil

TABLE = '''
const ifcsSmokeEvent = table({name:"ifcs_smoke_event",public:false},{
  scheduledId:t.u64().primaryKey().autoInc(),scheduledAt:t.scheduleAt(),
  shipId:t.string(),fittingId:t.string(),owner:t.identity(),kind:t.string(),
});
'''
ADDON = '''
import { queueFlightDamage } from "./construction-flight-availability";
export const requestIfcsSmokeEvent = db.reducer({shipId:t.string(),fittingId:t.string(),kind:t.string()},auth.gameAction((ctx,args)=>{
  const binding=ctx.db.constructionFlightBinding.shipId.find(args.shipId);
  const fitting=ctx.db.constructionFlightFitting.id.find(args.fittingId);
  if(!binding?.owner.isEqual(ctx.sender) || fitting?.shipId!==args.shipId || !fitting.installed || fitting.kind!=="actuator" || !["damage","invalid-definition"].includes(args.kind))throw new SenderError("Owned fixed smoke event required");
  if(ctx.db.ifcsSmokeEvent.count()>=8n)throw new SenderError("Smoke event queue full");
  ctx.db.ifcsSmokeEvent.insert({scheduledId:0n,scheduledAt:ScheduleAt.interval(50000n),shipId:args.shipId,fittingId:args.fittingId,owner:ctx.sender,kind:args.kind});
},true));
export const consumeIfcsSmokeEvent = db.reducer({onSchedule:ifcsSmokeEvent},{scheduledMessage:ifcsSmokeEvent.rowType},(ctx,{scheduledMessage:event})=>{
  if(!ctx.sender.isEqual(ctx.databaseIdentity))throw new SenderError("Server smoke event only");
  const binding=ctx.db.constructionFlightBinding.shipId.find(event.shipId),fitting=ctx.db.constructionFlightFitting.id.find(event.fittingId);
  if(!binding?.owner.isEqual(event.owner) || fitting?.shipId!==event.shipId || !fitting.installed)throw new SenderError("Smoke event target changed");
  if(event.kind==="damage")queueFlightDamage(ctx,{id:"ifcs-smoke-impact-"+event.scheduledId,sourceEventId:"fixed-server-smoke-impact",shipId:event.shipId,fittingId:event.fittingId,expectedFittingRevision:fitting.revision,lossFraction:0.5});
  else {
    // Deliberate isolated corruption, not a production definition-edit reducer.
    ctx.db.constructionFlightFitting.id.update({...fitting,definitionRevision:4294967295,revision:fitting.revision+1n});
    markFlightDirty(ctx.db,event.shipId,ctx.timestamp.microsSinceUnixEpoch);
  }
  ctx.db.ifcsSmokeEvent.scheduledId.delete(event.scheduledId);
});
'''

def publish(dev, database, evidence):
    prefix = dev.CFG['project']['database'] + '-'
    if not database.startswith(prefix) or not database.endswith('-smoke') or database == dev.CFG['project']['database'] or not evidence:
        raise RuntimeError('IFCS test module requires a reserved isolated smoke database')
    dev.run(["npm", "run", "typecheck", "--workspace", "@sidereal/world"])
    stage = Path(evidence) / 'test-module'
    if stage.exists():
        raise RuntimeError('IFCS test module stage already exists; reserve a fresh run')
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
    text = text.replace('const db = schema({', TABLE + '\nconst db = schema({\n  ifcsSmokeEvent,', 1)
    index.write_text(text + '\n' + ADDON)
    dev.cli('publish', database, '--server', dev.DB_URL, '--module-path', str(world), '--yes', '--no-config', '--delete-data=never')
    bindings = stage / 'generated'
    dev.cli('generate', '--lang', 'typescript', '--out-dir', str(bindings), '--module-path', str(world), '--yes')
    return str(bindings / 'index.ts')
