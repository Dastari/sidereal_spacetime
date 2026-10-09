"""Stage the existing isolated prefab fixture with a bounded fleet lifecycle fixture.

This delegates all copying, publish guards and binding generation to
prefab_smoke_module. It changes only its fresh test-module copy, never production
source, authentication, positions, access grants or inventory semantics.
"""
from pathlib import Path
import shutil
from types import SimpleNamespace
import prefab_smoke_module

ADDON = r'''
// Isolated fixture only: suspend/resume one ship owned by the current fixture actor.
// It neither boards nor moves the actor and never changes production authorization.
export const setFactionFleetSmokeLifecycle = db.reducer({shipId:t.string(),lifecycle:t.string()},auth.gameAction((ctx,args)=>{
  const actors=[...ctx.db.character.by_owner.filter(ctx.sender)];
  if(actors.length!==1)throw new SenderError("One owned fixture character required");
  const actor=actors[0],ship=ctx.db.ship.id.find(args.shipId),binding=ctx.db.gameShipAccess.shipId.find(args.shipId),instance=ctx.db.constructionInstance.id.find(args.shipId);
  if(!ship?.owner.isEqual(ctx.sender)||!binding?.owner.isEqual(ctx.sender)||binding.characterId!==actor.id||!instance?.owner.isEqual(ctx.sender)||!/-fleet$/.test(JSON.parse(instance.documentJson).prefab?.document?.id ?? ""))throw new SenderError("Owned fleet fixture required");
  if(args.lifecycle!=="active"&&args.lifecycle!=="suspended")throw new SenderError("Known fixture lifecycle required");
  ctx.db.gameShipAccess.shipId.update({...binding,lifecycle:args.lifecycle});
},true));
'''


def publish(dev, database, evidence):
    """Root-managed publisher entry, restricted to the reserved port3184 smoke run."""
    from urllib.parse import urlparse
    endpoint = urlparse(dev.DB_URL)
    if (endpoint.scheme != 'http' or endpoint.hostname not in {'127.0.0.1', 'localhost', '::1'}
            or endpoint.port != 3184 or endpoint.username or endpoint.password
            or endpoint.path not in {'', '/'} or endpoint.query or endpoint.fragment):
        raise RuntimeError('Fleet fixture requires isolated loopback port3184')
    if not database.endswith('-smoke') or not evidence:
        raise RuntimeError('Reserved isolated fleet smoke run required')
    evidence_path = Path(evidence).resolve()
    runs = (dev.ROOT / '.runtime/smoke-runs').resolve()
    if not evidence_path.is_relative_to(runs):
        raise RuntimeError('Fleet fixture requires reserved smoke evidence directory')

    def isolated_cli(*args):
        if args and args[0] == 'publish':
            module = Path(args[args.index('--module-path') + 1])
            index = module / 'src/index.ts'
            text = index.read_text()
            if 'setFactionFleetSmokeLifecycle' in text:
                raise RuntimeError('Fresh copied fixture required')
            index.write_text(text + '\n' + ADDON)
            # Freeze every workspace dependency before bundling the copied world.
            stage = module.parents[1]
            packages = stage / 'packages'
            for name in ['content', 'sim']:
                target = packages / name
                if not target.is_symlink():
                    raise RuntimeError('Expected unresolved copied-module dependency')
                target.unlink()
                shutil.copytree(dev.ROOT / 'packages' / name, target,
                                ignore=shutil.ignore_patterns('node_modules', 'dist'))
            (stage / 'assets').symlink_to(dev.ROOT / 'assets', target_is_directory=True)
            modules = stage / 'node_modules'
            modules.mkdir()
            for dependency in (dev.ROOT / 'node_modules').iterdir():
                if dependency.name != '@sidereal':
                    (modules / dependency.name).symlink_to(dependency.resolve(), target_is_directory=dependency.is_dir())
            workspace = modules / '@sidereal'
            workspace.mkdir()
            for package in packages.iterdir():
                (workspace / package.name).symlink_to(package, target_is_directory=True)
        return dev.cli(*args)

    wrapper = SimpleNamespace(ROOT=dev.ROOT, CFG=dev.CFG, DB_URL=dev.DB_URL,
                              run=dev.run, cli=isolated_cli)
    return prefab_smoke_module.publish(wrapper, database, evidence)
