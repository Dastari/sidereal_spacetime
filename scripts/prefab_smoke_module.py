"""Build an isolated smoke-only module that can assign a developer prefab ship.

The production world has no player-callable prefab assignment: SHIPS-REMOVAL owns the
operator reducer. This copies packages/world into the reserved fresh smoke fixture and
appends one smoke-only reducer that calls the real `installPrefabShip` for the caller's
own character. Never edits packages/world or publishes to a shared database.
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
