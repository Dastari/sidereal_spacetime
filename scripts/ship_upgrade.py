#!/usr/bin/env python3
"""Operator tooling: upgrade ONE game-owned prefab ship to the registered revision in place.

Calls the operator-only reducer ``operator_upgrade_prefab_ship`` with the local SpacetimeDB CLI
identity (the deployment owner, same as scripts/ship_wipe.py). The reducer keeps the ship/instance
id, deck id, owner, name, pose, every ship container and item (same UUIDs and grid positions) and
rebuilds the prefab-derived rows at the next instance revision; storage containers are rebound to
the equivalent socket (same ``<room>/<design>`` key) and the character aboard stands at the spawn.
Unsafe states (moving or piloted ship, visitors, unknown containers, ...) are refused before any
change. Every command names the server and database explicitly.

  resolve  read-only: the character's ship, its prefab pin and bound storage sockets
  export   private JSON backup (same format as ``ship_wipe.py export``)
  dry-run  record the upgrade plan in the operator ledger (no other change)
  apply    upgrade, using the expectations recorded by a clean dry-run (--from-dry-run)
           (requires --confirm-database equal to --database and a backup unless waived)
  verify   compare the database with the pre-upgrade backup: items, containers, other ships,
           characters and map state unchanged; the ship now carries the target pins
  ledger   print the ledger row of an operation

See the wiki: Operations/Ship Wipe Runbook ("Upgrading a live Wren to r4 in place").
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ship_wipe import (  # noqa: E402
    MAP_TABLES, ROOT, call, export, ledger, load_backup, map_fingerprint, require_operation_id,
    sql, table, WIPED_SHIP_TABLES, CHARACTER_AND_INVENTORY_TABLES, OPERATOR_TABLES,
)

# Columns the world step keeps changing on ships that are not being upgraded.
MOTION_COLUMNS = {'x', 'y', 'vx', 'vy', 'heading', 'omega', 'tick', 'server_tick', 'cell_x', 'cell_y'}


def quote(value):
    return "'" + value.replace("'", "''") + "'"


def pins():
    source = ("import { REGISTERED_PREFAB_PINS, PREFAB_UPGRADE_SOURCES } from "
              "'./packages/world/src/prefab-ship-pins.ts';"
              "console.log(JSON.stringify({ registered: REGISTERED_PREFAB_PINS, sources: PREFAB_UPGRADE_SOURCES }));")
    out = subprocess.run([str(ROOT / 'node_modules/.bin/tsx'), '-e', source], cwd=ROOT,
                         capture_output=True, text=True, check=True).stdout
    return json.loads(out)


def target_pin(prefab_id):
    known = pins()
    for pin in known['registered']:
        if pin['prefabId'] == prefab_id:
            return pin, known['sources']
    raise SystemExit(f'{prefab_id} is not a registered prefab; registered: '
                     + ', '.join(p['prefabId'] for p in known['registered']))


def ship_of(args):
    if args.ship_id:
        return args.ship_id
    rows = sql(args.server, args.database, f'SELECT id, ship_id FROM character WHERE id = {quote(args.character_id)}')
    if not rows or not rows[0]['ship_id']:
        raise SystemExit('Character not found or has no ship')
    return rows[0]['ship_id']


def resolve(args):
    ship_id = ship_of(args)
    instance = sql(args.server, args.database,
                   'SELECT id, blueprint_id, blueprint_sha_256, revision, workspace_id FROM construction_instance '
                   f'WHERE id = {quote(ship_id)}')
    pin, sources = target_pin(args.target_prefab_id)
    source = next((s for s in sources if instance and s['blueprintSha256'] == instance[0]['blueprint_sha_256']), None)
    report = {
        'shipId': ship_id,
        'ship': sql(args.server, args.database, f'SELECT id, name FROM ship WHERE id = {quote(ship_id)}'),
        'instance': instance,
        'access': sql(args.server, args.database,
                      f'SELECT character_id, lifecycle, instance_revision FROM game_ship_access WHERE ship_id = {quote(ship_id)}'),
        'socketBindings': sql(args.server, args.database,
                              'SELECT placed_object_id, container_id FROM instance_inventory_binding '
                              f'WHERE instance_id = {quote(ship_id)}'),
        'sourcePin': source,
        'targetPin': pin,
    }
    print(json.dumps(report, indent=1))
    return report


def expectations(args):
    ship_id = ship_of(args)
    rows = sql(args.server, args.database,
               f'SELECT blueprint_sha_256, revision FROM construction_instance WHERE id = {quote(ship_id)}')
    if not rows:
        raise SystemExit(f'No construction instance {ship_id}')
    pin, _ = target_pin(args.target_prefab_id)
    return ship_id, rows[0]['blueprint_sha_256'], int(rows[0]['revision']), pin


def dry_run(args):
    require_operation_id(args.operation_id)
    ship_id, source_sha, revision, pin = expectations(args)
    call(args.server, args.database, 'operator_upgrade_prefab_ship', args.operation_id, True, ship_id,
         source_sha, revision, args.target_prefab_id, pin['blueprintSha256'])
    result = ledger(args.server, args.database, args.operation_id)
    print(json.dumps(result, indent=1))
    if result['summary'].get('refusals'):
        print('Upgrade would be REFUSED: ' + '; '.join(result['summary']['refusals']), file=sys.stderr)
        sys.exit(2)
    return result


def apply(args):
    require_operation_id(args.operation_id)
    if args.confirm_database != args.database:
        raise SystemExit('--confirm-database must repeat --database exactly')
    plan = ledger(args.server, args.database, args.from_dry_run)
    if plan['kind'] != 'upgrade-prefab-dry-run':
        raise SystemExit(f'{args.from_dry_run} is not an upgrade dry-run')
    summary = plan['summary']
    if summary.get('refusals'):
        raise SystemExit('The dry-run recorded refusals: ' + '; '.join(summary['refusals']))
    if args.backup:
        snapshot = load_backup(args.backup, args.database)
        if not any(r['id'] == summary['shipId'] for r in snapshot['tables']['ship']):
            raise SystemExit('Backup does not contain the ship; export again')
    elif not args.owner_waived_backup:
        raise SystemExit('A pre-upgrade backup (--backup) is required unless the owner waived it (--owner-waived-backup)')
    request = plan['request']
    call(args.server, args.database, 'operator_upgrade_prefab_ship', args.operation_id, False,
         request['shipId'], request['expectedSourceBlueprintSha256'], int(request['expectedInstanceRevision']),
         request['targetPrefabId'], request['expectedTargetBlueprintSha256'])
    result = ledger(args.server, args.database, args.operation_id)
    print(json.dumps(result, indent=1))
    return result


def _key(row):
    return json.dumps(row, sort_keys=True)


def _owned(row, ship_id):
    return any(row.get(c) == ship_id for c in ('id', 'ship_id', 'instance_id'))


def verify(args):
    """Post-upgrade invariants against the pre-upgrade backup (a ship_wipe export)."""
    before = load_backup(args.backup, args.database)['tables']
    result = ledger(args.server, args.database, args.operation_id)
    if result['kind'] != 'upgrade-prefab':
        raise SystemExit(f'{args.operation_id} is not an applied upgrade')
    summary = result['summary']
    ship_id, character_id = summary['shipId'], summary['characterId']
    names = [*WIPED_SHIP_TABLES, *CHARACTER_AND_INVENTORY_TABLES, *MAP_TABLES, *OPERATOR_TABLES]
    after = {name: table(args.server, args.database, name) for name in names}
    problems = []

    def same(name, keep=lambda r: True, drop=frozenset()):
        a = sorted(_key({k: v for k, v in r.items() if k not in drop}) for r in before[name] if keep(r))
        b = sorted(_key({k: v for k, v in r.items() if k not in drop}) for r in after[name] if keep(r))
        if a != b:
            problems.append(f'{name} changed ({len(a)} -> {len(b)} compared rows)')

    # Other ships and their rows: untouched (motion columns keep simulating).
    for name in WIPED_SHIP_TABLES:
        if name in ('construction_location', 'world_admission', 'input'):
            same(name, keep=lambda r: r.get('character_id') != character_id)
        else:
            same(name, keep=lambda r: not _owned(r, ship_id), drop=MOTION_COLUMNS)
    # The upgraded ship now carries the target pins at the next instance revision.
    instance = [r for r in after['construction_instance'] if r['id'] == ship_id]
    access = [r for r in after['game_ship_access'] if r['ship_id'] == ship_id]
    target = summary['target']
    if not instance or instance[0]['blueprint_sha_256'] != target['blueprintSha256'] \
            or str(instance[0]['revision']) != str(target['instanceRevision']['$bigint']
                                                    if isinstance(target['instanceRevision'], dict)
                                                    else target['instanceRevision']):
        problems.append('upgraded instance does not carry the target blueprint/revision')
    if not access or access[0]['lifecycle'] != 'active' or access[0]['character_id'] != character_id:
        problems.append('game-ship access is not active for the character')
    # Items, memberships, bindings and personal state: byte-identical.
    for name in ('inventory_item', 'inventory_item_membership', 'instance_inventory_binding', 'storage_binding',
                 'inventory_hotbar', 'weapon_energy', 'inventory_state', 'personal_starter_receipt',
                 'identity_link', 'character_appearance'):
        same(name)
    # Containers: identical except the ship-held containers' deck positions.
    same('inventory_container', drop={'local_x', 'local_y'})
    same('inventory_container', keep=lambda r: r['ship_id'] != ship_id)
    # Scopes: identical except the rebound roots' access point, instance revision and revision.
    same('inventory_container_scope', drop={'access_x', 'access_y', 'access_z', 'instance_revision', 'revision'})
    same('inventory_container_scope', keep=lambda r: r['instance_id'] != ship_id)
    # Characters: only the upgraded character's deck position changes.
    same('character', drop={'local_x', 'local_y', 'sprinting', 'connected'})
    same('character', keep=lambda r: r['id'] != character_id, drop={'connected'})
    # Map state and starter policy unchanged; the ledger only gains rows.
    fingerprint = map_fingerprint(after)
    backup_fingerprint = map_fingerprint(before)
    if fingerprint != backup_fingerprint:
        problems.append('map tables changed: ' + ', '.join(k for k in fingerprint if fingerprint[k] != backup_fingerprint[k]))
    same('ship_policy')
    old_ops = {r['operation_id'] for r in before['ship_operator_operation']}
    if not old_ops <= {r['operation_id'] for r in after['ship_operator_operation']}:
        problems.append('ledger rows disappeared')
    held_before = sorted(r['id'] for r in before['inventory_container'] if r['ship_id'] == ship_id)
    held_after = sorted(r['id'] for r in after['inventory_container'] if r['ship_id'] == ship_id)
    items_before = sorted(r['id'] for r in before['inventory_item'] if r['container_id'] in held_before)
    items_after = sorted(r['id'] for r in after['inventory_item'] if r['container_id'] in held_after)
    report = {
        'ok': not problems and held_before == held_after and items_before == items_after,
        'problems': problems,
        'shipId': ship_id,
        'containersPreserved': held_before == held_after,
        'containers': len(held_after),
        'itemsPreserved': items_before == items_after,
        'items': len(items_after),
        'sockets': [{k: s[k] for k in ('socketKey', 'containerId', 'fromCentreM', 'toCentreM')} | {'items': len(s['itemIds'])}
                    for s in summary['sockets']],
        'instance': instance[0] if instance else None,
    }
    print(json.dumps(report, indent=1))
    if not report['ok']:
        raise SystemExit('Post-upgrade verification failed')
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest='command', required=True)

    def common(p):
        p.add_argument('--server', required=True, help='explicit server URL (no default)')
        p.add_argument('--database', required=True, help='explicit database name (no default)')
        return p

    def which(p):
        who = p.add_mutually_exclusive_group(required=True)
        who.add_argument('--ship-id')
        who.add_argument('--character-id')
        p.add_argument('--target-prefab-id', default='fed.s.wren')

    p = common(sub.add_parser('resolve', help='read-only ship / pin / socket lookup'))
    which(p)
    p.set_defaults(func=resolve)
    p = common(sub.add_parser('export', help='write a private pre-upgrade JSON backup'))
    p.add_argument('--out-dir', help='defaults to .runtime/ship-wipe-backups (outside git)')
    p.set_defaults(func=export)
    p = common(sub.add_parser('dry-run', help='record the upgrade plan (no other change)'))
    p.add_argument('--operation-id', required=True)
    which(p)
    p.set_defaults(func=dry_run)
    p = common(sub.add_parser('apply', help='upgrade the ship in place'))
    p.add_argument('--operation-id', required=True)
    p.add_argument('--from-dry-run', required=True, help='operation id of a clean dry-run of the same ship')
    p.add_argument('--backup', help='backup file from `export` of this database')
    p.add_argument('--owner-waived-backup', action='store_true')
    p.add_argument('--confirm-database', required=True)
    p.set_defaults(func=apply)
    p = common(sub.add_parser('verify', help='compare with the pre-upgrade backup'))
    p.add_argument('--operation-id', required=True, help='the applied upgrade operation')
    p.add_argument('--backup', required=True)
    p.set_defaults(func=verify)
    p = common(sub.add_parser('ledger', help='print an operation ledger row'))
    p.add_argument('--operation-id', required=True)
    p.set_defaults(func=lambda a: print(json.dumps(ledger(a.server, a.database, a.operation_id), indent=1)))
    args = parser.parse_args()
    args.func(args)


if __name__ == '__main__':
    try:
        main()
    except RuntimeError as error:
        print(f'error: {error}', file=sys.stderr)
        sys.exit(1)
