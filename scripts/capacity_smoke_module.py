"""Copied, reserved SDK-load fixture; never installs reducers in production."""
import hashlib
import json
from pathlib import Path
import shutil
from urllib.parse import urlsplit

import fresh_smoke

WREN_SHA256 = 'd7edc7f62636b1d2a780bdd30eac67bff16cf8527db7d66c426a8cc42be0c3d2'
PACKAGES = ('world', 'content', 'sim', 'scripting')
SCHEMA_MARKER = 'const db = schema({'
TABLES = '''
// Private fixture metadata. These tables are absent from the production schema.
const capacityHost = table({name:"capacity_host",public:false}, {
  index:t.u32().primaryKey(),shipId:t.string(),owner:t.identity(),characterId:t.string(),
});
const capacityMember = table({name:"capacity_member",public:false,indexes:[
  {accessor:"by_ship",algorithm:"btree",columns:["shipId"]},
]}, {characterId:t.string().primaryKey(),owner:t.identity(),shipId:t.string(),slot:t.u32()});
'''

ADDON = '''
import type { InferSchema as CapacitySchema, ReducerCtx as CapacityReducer } from "spacetimedb/server";
import { installPrefabShip as capacityInstall, trustedPrefabTemplate as capacityTemplate } from "./prefab-ship-authority";
import { acceptedPassengerAccess as capacityAccess } from "./construction-passenger-access";
import { constructionCollision as capacityCollision } from "./construction-doors";
import { createConstructionStandingSupport as capacitySupportFactory } from "./construction-standing-support";
import { compileShipFlight as capacityCompileFlight } from "./construction-flight-compilation";
import { canOccupyDeck as capacityOccupy } from "@sidereal/sim/construction-collision";
type CapacityContext = CapacityReducer<CapacitySchema<typeof db>>;
const capacitySupport = capacitySupportFactory();
const CAPACITY_WREN_SHA = "__WREN_SHA__";
function capacityActor(ctx: CapacityContext) {
  auth.requireGame(ctx);
  const actors=[...ctx.db.character.by_owner.filter(ctx.sender)];
  if(actors.length!==1 || !actors[0].connected || !actors[0].owner.isEqual(ctx.sender))
    throw new SenderError("One connected owned capacity actor required");
  if(!ctx.db.inventoryState.characterId.find(actors[0].id)?.kitGranted)
    throw new SenderError("Issued personal kit required");
  return actors[0];
}
function capacityShipless(ctx: CapacityContext) {
  const a=capacityActor(ctx);
  if(a.shipId || ctx.db.constructionLocation.characterId.find(a.id) ||
     ctx.db.worldAdmission.characterId.find(a.id) || ctx.db.constructionPassengerVisit.characterId.find(a.id))
    throw new SenderError("Fresh shipless capacity actor required");
  return a;
}
export const smokeCapacityInstallHost = db.reducer({index:t.u32()},(ctx,args)=>{
  const a=capacityShipless(ctx);
  if(args.index>20 || ctx.db.capacityHost.index.find(args.index))
    throw new SenderError("Unused bounded capacity host index required");
  if(capacityTemplate("fed.s.wren").snapshot.sha256!==CAPACITY_WREN_SHA)
    throw new SenderError("Pinned capacity Wren source required");
  if(ctx.db.shipWorldMotion.count()>=60n || ctx.db.capacityHost.count()>=21n)
    throw new SenderError("Preserved canonical ship capacity required");
  const [x,y]=args.index===20 ? [-40,0] : [(args.index%5)*40,Math.floor(args.index/5)*40];
  const installed=capacityInstall(ctx,a,{prefabId:"fed.s.wren",pose:{
    kind:"at",systemId:SHARED_SYSTEM_SEED.systemId,x,y,heading:0,
  }});
  if(ctx.db.shipWorldMotion.count()>60n)
    throw new SenderError("Preserved canonical ship capacity required");
  ctx.db.capacityHost.insert({index:args.index,shipId:installed.shipId,owner:ctx.sender,characterId:a.id});
});
export const smokeCapacityJoinPassenger = db.reducer({hostShipId:t.string(),slot:t.u32()},(ctx,args)=>{
  const a=capacityShipless(ctx);
  const h=[...ctx.db.capacityHost.iter()].find(h=>h.shipId===args.hostShipId && h.index<20);
  if(!h || h.owner.isEqual(ctx.sender) || args.slot>3)
    throw new SenderError("Distinct bounded capacity passenger required");
  const members=[...ctx.db.capacityMember.by_ship.filter(h.shipId)];
  if(members.some(m=>m.slot===args.slot) || members.length>=4)
    throw new SenderError("Unused capacity passenger slot required");
  const grants=[...ctx.db.constructionPassengerGrant.by_ship.filter(h.shipId)];
  const matching=grants.filter(g=>g.granteeId===a.id && g.granteeOwner.isEqual(ctx.sender));
  if(grants.length>4 || matching.length!==1)
    throw new SenderError("Real bounded owner passenger grant required");
  const g=matching[0], i=ctx.db.constructionInstance.id.find(h.shipId),
    b=ctx.db.constructionFlightBinding.shipId.find(h.shipId), s=ctx.db.ship.id.find(h.shipId),
    d=ctx.db.constructionDeck.id.find(g.deckId), m=ctx.db.shipWorldMotion.shipId.find(h.shipId);
  if(!i || !b || !s || !d || !m || !g.owner.isEqual(h.owner) ||
     !i.owner.isEqual(h.owner) || !b.owner.isEqual(h.owner) || !s.owner.isEqual(h.owner) ||
     i.blueprintSha256!==CAPACITY_WREN_SHA || b.blueprintSha256!==i.blueprintSha256 ||
     b.instanceId!==i.id || b.instanceRevision!==i.revision || g.instanceRevision!==i.revision ||
     b.lifecycle!=="active" || b.deckId!==g.deckId || d.instanceId!==i.id ||
     g.expiresMicros<=ctx.timestamp.microsSinceUnixEpoch ||
     m.systemId!==SHARED_SYSTEM_SEED.systemId || ![m.x,m.y,m.vx,m.vy,m.omega].every(Number.isFinite) ||
     Math.hypot(m.vx,m.vy)>.01 || Math.abs(m.omega)>.001)
    throw new SenderError("Current pinned stationary capacity host required");
  const crew=[...ctx.db.constructionLocation.by_instance.filter(h.shipId)];
  if(crew.length>=5 || ctx.db.constructionPassengerVisit.count()>=128n)
    throw new SenderError("Preserved passenger capacity required");
  const frame=capacityCollision(ctx,i,d.id);
  let point: [number,number] | undefined;
  // Same supported, collision-qualified entry search as normal boarding.
  for(let ring=0;ring<=3&&!point;ring++) for(let n=0;n<(ring?8:1);n++) {
    const x=i.spawnX+ring*.75*Math.cos(n*Math.PI/4), y=i.spawnY+ring*.75*Math.sin(n*Math.PI/4);
    if(!capacityOccupy(frame,{shipId:i.id,deckId:d.id,position:[x,y]},.3) || crew.some(l=>{
      const other=ctx.db.character.id.find(l.characterId);
      return l.deckId===d.id && other?.shipId===i.id && Math.hypot(other.localX-x,other.localY-y)<.65;
    })) continue;
    capacitySupport({actor:{...a,shipId:i.id,localX:x,localY:y},
      location:{characterId:a.id,instanceId:i.id,deckId:d.id},instance:i,deck:d});
    point=[x,y];break;
  }
  if(!point) throw new SenderError("Supported capacity passenger entry required");
  capacityCompileFlight(ctx.db,i.id,(id)=>readConstructionFlightInput(ctx,id));
  if(ctx.db.constructionFlightCompiled.shipId.find(i.id)?.status!=="ready")
    throw new SenderError("Compiled capacity flight required");
  const visitId=ctx.newUuidV4().toString();
  ctx.db.constructionPassengerVisit.insert({characterId:a.id,owner:ctx.sender,shipId:i.id,deckId:d.id,
    grantId:g.id,grantRevision:g.revision,visitId,admissionRevision:1n,
    sourceShipId:"",sourceDeckId:"",sourceVisitId:"",sourceLocationRevision:0n,
    sourceInstanceRevision:0n,sourceSha256:"",sourceSystemId:"",sourceX:0,sourceY:0,
    revision:1n,recoveryReason:"",retryAfterMicros:0n});
  ctx.db.constructionLocation.insert({characterId:a.id,visitId,instanceId:i.id,deckId:d.id,
    returnShipId:"",returnX:0,returnY:0,revision:1n});
  ctx.db.worldAdmission.insert({characterId:a.id,owner:ctx.sender,shipId:i.id,systemId:m.systemId,revision:1n});
  commitFlightCharacter(ctx,{...a,shipId:i.id,localX:point[0],localY:point[1],sprinting:false},
    (row)=>ctx.db.character.id.update(row));
  const command=ctx.db.input.characterId.find(a.id);
  const inputRow={characterId:a.id,sequence:command?.sequence??0n,throttle:0,turn:0,dx:0,dy:0,
    updatedMicros:ctx.timestamp.microsSinceUnixEpoch,sprint:false};
  if(command)ctx.db.input.characterId.update(inputRow);else ctx.db.input.insert(inputRow);
  ctx.db.capacityMember.insert({characterId:a.id,owner:ctx.sender,shipId:i.id,slot:args.slot});
  if(!capacityAccess(ctx,a.id,ctx.timestamp.microsSinceUnixEpoch).walkDeck)
    throw new SenderError("Accepted capacity passenger relation required");
});
const capacityInputProjection=t.row("CapacityInput",{characterId:t.string().primaryKey(),
  sequence:t.u64(),leaseSequence:t.u64(),leaseHeld:t.bool()});
export const ownCapacityInput=db.view({name:"own_capacity_input",public:true},t.array(capacityInputProjection),(ctx)=>{
  if(!auth.canReadGame(ctx))return [];
  const actors=[...ctx.db.character.by_owner.filter(ctx.sender)];
  if(actors.length!==1)return [];
  const a=actors[0], member=ctx.db.capacityMember.characterId.find(a.id),
    host=[...ctx.db.capacityHost.iter()].find(h=>h.characterId===a.id&&h.owner.isEqual(ctx.sender));
  if(!a.connected || (!host&&!member?.owner.isEqual(ctx.sender)))return [];
  const command=ctx.db.input.characterId.find(a.id),lease=ctx.db.inputControl.characterId.find(a.id),
    presence=lease&&ctx.db.connectionPresence.connectionId.find(lease.connectionId),
    session=lease&&ctx.db.authSession.connectionId.find(lease.connectionId);
  return [{characterId:a.id,sequence:command?.sequence??0n,leaseSequence:lease?.sequence??0n,
    leaseHeld:!!(lease?.owner.isEqual(ctx.sender)&&presence?.owner.isEqual(ctx.sender)&&
      session?.owner.isEqual(ctx.sender)&&session.game)}];
});
export const smokeCapacityAssert=db.reducer({clients:t.u32()},(ctx,args)=>{
  const caller=capacityActor(ctx), n=args.clients===50?10:args.clients===100?20:0;
  const hosts=[...ctx.db.capacityHost.iter()], actors=[...ctx.db.character.iter()],
    visits=[...ctx.db.constructionPassengerVisit.iter()];
  if(!n || !hosts.some(h=>h.characterId===caller.id&&h.owner.isEqual(ctx.sender)))
    throw new SenderError("Owned capacity host assertion required");
  if(hosts.length!==n+1 || ctx.db.shipWorldMotion.count()!==BigInt(n+1) ||
     ctx.db.shipWorldMotion.count()>60n || actors.length!==args.clients ||
     actors.some(a=>!a.connected || !ctx.db.inventoryState.characterId.find(a.id)?.kitGranted) ||
     new Set(actors.map(a=>a.owner.toHexString())).size!==args.clients ||
     visits.length!==n*4 || ctx.db.constructionPassengerGrant.count()!==BigInt(n*4) ||
     ctx.db.capacityMember.count()!==BigInt(n*4-1))
    throw new SenderError("Exact distinct capacity population required");
  for(let index=0;index<n;index++) {
    const h=hosts.find(h=>h.index===index),i=h&&ctx.db.constructionInstance.id.find(h.shipId),
      b=h&&ctx.db.constructionFlightBinding.shipId.find(h.shipId);
    if(!h || !i || !b || !h.owner.isEqual(i.owner) || i.blueprintSha256!==CAPACITY_WREN_SHA ||
       b.lifecycle!=="active" || b.instanceRevision!==i.revision || b.blueprintSha256!==i.blueprintSha256 ||
       [...ctx.db.constructionPassengerGrant.by_ship.filter(h.shipId)].length!==4 ||
       [...ctx.db.constructionLocation.by_instance.filter(h.shipId)].length!==5 ||
       visits.filter(v=>v.shipId===h.shipId).length!==4)
      throw new SenderError("Exact accepted capacity host crew required");
  }
  const origin=hosts.find(h=>h.index===20);
  if(!origin || hosts.some(h=>h.index!==20&&h.index>=n) ||
     visits.filter(v=>v.sourceShipId===origin.shipId&&v.owner.isEqual(origin.owner)).length!==1)
    throw new SenderError("Real original passenger return relation required");
  for(const v of visits) {
    const a=ctx.db.character.id.find(v.characterId),member=ctx.db.capacityMember.characterId.find(v.characterId),
      i=ctx.db.constructionInstance.id.find(v.shipId),d=ctx.db.constructionDeck.id.find(v.deckId),
      l=ctx.db.constructionLocation.characterId.find(v.characterId);
    if(!a || !i || !d || !l || !capacityAccess({...ctx,sender:v.owner},v.characterId,ctx.timestamp.microsSinceUnixEpoch).walkDeck ||
       (member&&(!member.owner.isEqual(v.owner)||member.shipId!==v.shipId||v.sourceShipId||v.sourceDeckId||
         v.sourceVisitId||v.sourceSha256||v.sourceSystemId||v.sourceInstanceRevision||v.sourceLocationRevision)))
      throw new SenderError("Coherent capacity passenger relation required");
    if(!capacityOccupy(capacityCollision(ctx,i,d.id),{shipId:i.id,deckId:d.id,position:[a.localX,a.localY]},.3))
      throw new SenderError("Supported capacity passenger position required");
    capacitySupport({actor:a,location:l,instance:i,deck:d});
  }
});
'''.replace('__WREN_SHA__', WREN_SHA256)


def validate_target(dev, database=None, evidence=None, *, public_port=3100):
    """Call once before starting a server, again with its reserved publish target."""
    try:
        url = urlsplit(dev.DB_URL)
        port = url.port
    except ValueError:
        raise ValueError('Capacity fixture requires a distinct owned loopback server port') from None
    server = dev.CFG['server']
    if (url.scheme != 'http' or url.hostname not in ('127.0.0.1', 'localhost', '::1')
            or url.username or url.password or url.query or url.fragment or url.path not in ('', '/')
            or port is None or not 1024 <= port <= 65535 or port == public_port
            or server['host'] != url.hostname or type(server['port']) is not int or server['port'] != port):
        raise ValueError('Capacity fixture requires a distinct owned loopback server port')
    if database is None and evidence is None:
        row = dev.load().get('database')
        if row and dev.alive(row):
            raise ValueError('Capacity fixture requires a newly started owned database server')
        return
    if not database or not evidence or database == dev.CFG['project']['database']:
        raise ValueError('Capacity fixture requires a fresh reserved database')
    reserved = fresh_smoke.evidence_directory(dev, database)
    if not reserved or Path(reserved).resolve() != Path(evidence).resolve():
        raise ValueError('Capacity evidence must match its fresh reservation')


def integrate_index(source):
    if source.count(SCHEMA_MARKER) != 1 or 'capacityHost' in source or 'ownCapacityInput' in source:
        raise ValueError('Capacity schema integration marker changed')
    return source.replace(SCHEMA_MARKER, TABLES + SCHEMA_MARKER + '\n  capacityHost, capacityMember,', 1) + '\n' + ADDON


def qualify_passengers(source):
    marker = '  return false;'
    if source.count(marker) != 1 or 'function shipFeatureQualified(' not in source:
        raise ValueError('Capacity passenger qualification marker changed')
    return source.replace(marker, '  // Isolated load fixture only: exact original Wren passengers.\n'
                          f'  return _feature === "passengers" && _blueprintSha256 === "{WREN_SHA256}";', 1)


def source_hashes(root):
    paths = [root / 'tsconfig.json', root / 'package-lock.json']
    for name in PACKAGES:
        package = root / 'packages' / name
        paths.extend([package / 'package.json', package / 'tsconfig.json'])
        paths.extend(p for p in (package / 'src').rglob('*') if p.is_file())
    return {p.relative_to(root).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted(paths) if p.is_file()}


def sdk_hashes(package):
    return {p.relative_to(package).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted(package.rglob('*')) if p.is_file()}


def stage_module(dev, database, evidence, *, public_port=3100):
    validate_target(dev, database, evidence, public_port=public_port)
    stage = Path(evidence) / 'capacity-module'
    if stage.exists():
        raise ValueError('Capacity module stage already exists; reserve a fresh run')
    before = source_hashes(dev.ROOT)
    sdk_source = dev.ROOT / 'node_modules/spacetimedb'
    sdk_before = sdk_hashes(sdk_source)
    sdk_version = json.loads((sdk_source / 'package.json').read_text())['version']
    stage.mkdir(mode=0o700)
    shutil.copy2(dev.ROOT / 'tsconfig.json', stage / 'tsconfig.json')
    shutil.copy2(dev.ROOT / 'package-lock.json', stage / 'package-lock.json')
    for name in PACKAGES:
        source, target = dev.ROOT / 'packages' / name, stage / 'packages' / name
        shutil.copytree(source / 'src', target / 'src')
        shutil.copy2(source / 'package.json', target / 'package.json')
        if (source / 'tsconfig.json').is_file():
            shutil.copy2(source / 'tsconfig.json', target / 'tsconfig.json')
    if source_hashes(dev.ROOT) != before or source_hashes(stage) != before:
        raise RuntimeError('Capacity dependency sources changed during snapshot')
    modules = stage / 'node_modules'
    modules.mkdir()
    for item in (dev.ROOT / 'node_modules').iterdir():
        if item.name not in ('@sidereal', 'spacetimedb'):
            (modules / item.name).symlink_to(item.resolve(), target_is_directory=item.is_dir())
    shutil.copytree(sdk_source, modules / 'spacetimedb')
    if sdk_hashes(sdk_source) != sdk_before or sdk_hashes(modules / 'spacetimedb') != sdk_before:
        raise RuntimeError('Capacity SDK changed during snapshot')
    scope = modules / '@sidereal'
    scope.mkdir()
    for name in PACKAGES:
        (scope / name).symlink_to(stage / 'packages' / name, target_is_directory=True)
    index = stage / 'packages/world/src/index.ts'
    index.write_text(integrate_index(index.read_text()))
    qualification = stage / 'packages/world/src/ship-feature-qualification.ts'
    qualification.write_text(qualify_passengers(qualification.read_text()))
    manifest = {'schema': 'sidereal.capacity-module.v1', 'wrenBlueprintSha256': WREN_SHA256,
                'sourceFiles': before, 'stagedFiles': source_hashes(stage),
                'sdkVersion': sdk_version, 'sdkFiles': sdk_before,
                'fixtureSha256': hashlib.sha256(ADDON.encode()).hexdigest(),
                'fixturePassengerQualification': 'exact-wren-only'}
    path = Path(evidence) / 'capacity-module-manifest.json'
    path.write_text(json.dumps(manifest, indent=2) + '\n')
    path.chmod(0o600)
    return stage


def publish(dev, database, evidence, *, public_port=3100):
    stage = stage_module(dev, database, evidence, public_port=public_port)
    world = stage / 'packages/world'
    dev.run(['node', str(dev.ROOT / 'node_modules/typescript/bin/tsc'), '--noEmit', '-p', str(world / 'tsconfig.json')])
    dev.cli('publish', database, '--server', dev.DB_URL, '--module-path', str(world),
            '--yes', '--no-config', '--delete-data=never')
    bindings = stage / 'generated'
    dev.cli('generate', '--lang', 'typescript', '--out-dir', str(bindings), '--module-path', str(world), '--yes')
    return str(bindings / 'index.ts')


def finalize_driver_run(root, evidence, before_hashes, *, driver_failed):
    """Verify candidate immutability even when offered load legitimately fails."""
    after = {name: hashlib.sha256((root / name).read_bytes()).hexdigest()
             if (root / name).is_file() else None for name in before_hashes}
    unchanged = after == before_hashes
    path = Path(evidence) / 'capacity-result.json'
    result = json.loads(path.read_text()) if path.is_file() else {
        'schemaVersion': 1, 'status': 'failed', 'failure': 'CAPACITY_DRIVER_EXIT'}
    if result.get('status') not in ('passed', 'failed'):
        result.update(status='failed', failure='CAPACITY_DRIVER_INVALID_RESULT')
    result['driverSourcesUnchanged'] = unchanged
    if not unchanged:
        result.update(status='failed', failure='CAPACITY_DRIVER_CHANGED_DURING_RUN')
    elif driver_failed:
        result['status'] = 'failed'
    path.write_text(json.dumps(result, indent=2) + '\n')
    path.chmod(0o600)
    return unchanged, result['status']
