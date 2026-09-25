import { expect, it, vi } from 'vitest';
vi.mock('spacetimedb/server',()=>({SenderError:class SenderError extends Error{}}));
import { LEGACY_SYSTEM_SEED, LEGACY_SYSTEM_SEED_SHA256, SHARED_SYSTEM_SEED, SHARED_SYSTEM_SEED_SHA256 } from '@sidereal/content/shared-system';
import { spatialCell } from '@sidereal/sim/spatial-cells';
import { ensureCanonicalSystem } from './shared-world';
import { fixture } from './shared-world-test-fixture';
import { migrateSolarSystem, SOLAR_MIGRATION_ID } from './solar-system-migration';
function legacy(){
 const f=fixture(),db=f.db;
 db.worldSystem.insert({id:LEGACY_SYSTEM_SEED.systemId,seedRevision:1n,seedSha256:LEGACY_SYSTEM_SEED_SHA256,migrationRevision:1n,lastSimulationTick:71n});
 for(const b of LEGACY_SYSTEM_SEED.bodies){const cell=spatialCell(b);
  db.systemBody.insert({id:b.id,systemId:LEGACY_SYSTEM_SEED.systemId,authoredKey:b.key,kind:b.kind,appearance:b.appearance,seed:b.seed,radius:b.radius,height:b.height,massKg:b.massKg,charted:b.kind!=='asteroid'});
  db.bodyWorldMotion.insert({bodyId:b.id,systemId:LEGACY_SYSTEM_SEED.systemId,x:b.x,y:b.y,vx:0,vy:0,heading:0,omega:0,serverTick:71n,cellX:BigInt(cell.cellX),cellY:BigInt(cell.cellY)});
 }
 return f;
}
it('atomically replaces the expected celestial set, preserves other rows and retains recovery evidence',()=>{
 const {db}=legacy();const preserved=['character','ship','spaceBody','inventoryItem','worldAdmission','legacyBodyAlias'].filter(name=>db[name]?.rows).map(name=>[name,[...db[name].rows.values()]] as const);
 const rock=LEGACY_SYSTEM_SEED.bodies[0].id,rockBefore=db.bodyWorldMotion.bodyId.find(rock);
 db.bodyWorldMotion.bodyId.update({...rockBefore,x:18.5,vx:3});const movingRock=db.bodyWorldMotion.bodyId.find(rock);
 expect(migrateSolarSystem(db,123n)).toBe('applied');expect(db.systemBody.rows.size).toBe(33);
 for(const old of LEGACY_SYSTEM_SEED.bodies.filter(b=>b.kind!=='asteroid')){expect(db.systemBody.id.find(old.id)).toBeUndefined();expect(db.bodyWorldMotion.bodyId.find(old.id)).toBeUndefined();}
 expect(db.bodyWorldMotion.bodyId.find(rock)).toBe(movingRock);
 for(const [name,rows] of preserved)expect([...db[name].rows.values()]).toEqual(rows);
 expect(ensureCanonicalSystem(db).seedSha256).toBe(SHARED_SYSTEM_SEED_SHA256);
 const receipt=db.celestialMigrationReceipt.id.find(SOLAR_MIGRATION_ID);expect(JSON.parse(receipt.beforeJson).bodies).toHaveLength(16);
 const writes=db.systemBody.writes+db.bodyWorldMotion.writes;
 expect(migrateSolarSystem(db,999n)).toBe('applied');expect(db.systemBody.writes+db.bodyWorldMotion.writes).toBe(writes);
});
it('refuses unknown descriptors and identity collisions before any body mutation',()=>{
 for(const reason of ['changed','collision']){
  const {db}=legacy();
  if(reason==='changed'){const b=db.systemBody.id.find(LEGACY_SYSTEM_SEED.bodies[4].id);db.systemBody.id.update({...b,radius:999});}
  else db.systemBody.insert({...db.systemBody.id.find(LEGACY_SYSTEM_SEED.bodies[4].id),id:SHARED_SYSTEM_SEED.bodies.find(b=>b.kind==='star')!.id,systemId:'other-system'});
  const bodies=[...db.systemBody.rows.values()],motion=[...db.bodyWorldMotion.rows.values()];
  expect(migrateSolarSystem(db,123n)).toBe('refused');expect([...db.systemBody.rows.values()]).toEqual(bodies);expect([...db.bodyWorldMotion.rows.values()]).toEqual(motion);
  expect(db.worldSystem.id.find(LEGACY_SYSTEM_SEED.systemId).seedRevision).toBe(1n);
 }
});
it('fresh systems install r002 without attempting historical migration',()=>{
 const {db}=fixture();expect(migrateSolarSystem(db,0n)).toBe('not-installed');ensureCanonicalSystem(db);expect(migrateSolarSystem(db,0n)).toBe('current');expect(db.celestialMigrationReceipt.rows.size).toBe(0);
});
