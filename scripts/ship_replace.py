#!/usr/bin/env python3
"""Targeted, pinned replacement of one game-owned prefab ship; never a global wipe.

resolve/plan read only; dry-run records only its operator ledger; apply requires
that clean dry-run, a private backup, repeated database name and explicit storage
loss. See the wiki's Wayfarer Study Kit Integration live integration contract.
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ship_wipe import (call, export, ledger, load_backup, require_operation_id, sql,
                       table, map_fingerprint, WIPED_SHIP_TABLES)
from ship_upgrade import quote, target_pin, MOTION_COLUMNS, EVA_MOVING_COLUMNS


def plan(args):
    actor = sql(args.server, args.database,
                f'SELECT id, ship_id, connected FROM character WHERE id = {quote(args.character_id)}')
    if len(actor) != 1 or not actor[0]['ship_id']:
        raise RuntimeError('Character must own an existing ship')
    ship_id = actor[0]['ship_id']
    instance = sql(args.server, args.database,
                   'SELECT blueprint_sha_256, revision FROM construction_instance '
                   f'WHERE id = {quote(ship_id)}')
    if len(instance) != 1:
        raise RuntimeError('Exactly one source construction instance required')
    pin, _ = target_pin(args.target_prefab_id)
    return {'characterId': args.character_id, 'shipId': ship_id,
            'expectedSourceBlueprintSha256': instance[0]['blueprint_sha_256'],
            'expectedInstanceRevision': int(instance[0]['revision']),
            'targetPrefabId': pin['prefabId'], 'expectedTargetCatalogRevision': pin['catalogRevision'],
            'expectedTargetBlueprintSha256': pin['blueprintSha256'], 'discardShipStorage': True}


def invoke(args, request, dry_run):
    call(args.server, args.database, 'operator_replace_prefab_ship',
         require_operation_id(args.operation_id), dry_run,
         request['characterId'], request['shipId'], request['expectedSourceBlueprintSha256'],
         int(request['expectedInstanceRevision']), request['targetPrefabId'],
         request['expectedTargetCatalogRevision'], request['expectedTargetBlueprintSha256'],
         request['discardShipStorage'])
    return ledger(args.server, args.database, args.operation_id)


def dry_run(args):
    if not args.discard_ship_storage:
        raise RuntimeError('--discard-ship-storage is required, including for dry-run')
    return invoke(args, plan(args), True)


def apply(args):
    if args.confirm_database != args.database:
        raise RuntimeError('--confirm-database must repeat --database exactly')
    if not args.discard_ship_storage:
        raise RuntimeError('Explicit --discard-ship-storage required')
    prior = ledger(args.server, args.database, args.from_dry_run)
    if prior['kind'] != 'replace-prefab-dry-run':
        raise RuntimeError('Source operation must be a successful replacement dry-run')
    request = prior['request']
    revision = request['expectedInstanceRevision']
    if isinstance(revision, dict):
        revision = revision['$bigint']
    request = {**request, 'expectedInstanceRevision': int(revision)}
    if request['discardShipStorage'] is not True:
        raise RuntimeError('Dry-run did not authorize ship storage loss')
    backup = load_backup(args.backup, args.database)
    if backup.get('server') != args.server:
        raise RuntimeError('Backup server differs from the explicitly selected server')
    expected = next((r for r in backup['tables']['construction_instance'] if r['id'] == request['shipId']), None)
    character = next((r for r in backup['tables']['character'] if r['id'] == request['characterId']), None)
    if (not expected or expected['blueprint_sha_256'] != request['expectedSourceBlueprintSha256']
            or int(expected['revision']) != request['expectedInstanceRevision']
            or not character or character['ship_id'] != request['shipId']):
        raise RuntimeError('Backup does not contain the pinned source character/ship/revision')
    return invoke(args, request, False)


def canonical(rows, volatile=frozenset()):
    return sorted(json.dumps({k: v for k, v in r.items() if k not in volatile}, sort_keys=True)
                  for r in rows)


def verify(args):
    backup = load_backup(args.backup, args.database)
    result = ledger(args.server, args.database, args.operation_id)
    if result['kind'] != 'replace-prefab':
        raise RuntimeError('Operation is not an applied replacement')
    summary = result['summary']; sid, aid = summary['shipId'], summary['characterId']
    before = backup['tables']
    after = {name: table(args.server, args.database, name) for name in before}
    issues = []
    if map_fingerprint(after) != backup['mapFingerprint']:
        issues.append('Map state changed')
    instance = next((r for r in after['construction_instance'] if r['id'] == sid), None)
    target_revision = summary['targetInstanceRevision']
    if isinstance(target_revision, dict): target_revision = int(target_revision['$bigint'])
    if not instance or instance['blueprint_sha_256'] != summary['targetBlueprintSha256'] or int(instance['revision']) != int(target_revision):
        issues.append('Target instance pin/revision differs')
    original_actor = next(r for r in before['character'] if r['id'] == aid)
    actor = next((r for r in after['character'] if r['id'] == aid), None)
    if not actor or actor['owner'] != original_actor['owner'] or actor['name'] != original_actor['name'] or actor['ship_id'] != sid:
        issues.append('Character identity/ownership changed')
    # Personal roots are retained byte-for-byte; all other accounts are protected independently.
    personal_containers = {r['container_id'] for r in before['inventory_container_scope'] if r['root_kind'] == 'character'}
    personal_roots = {r['root_container_id'] for r in before['inventory_container_scope'] if r['root_kind'] == 'character'}
    personal_items = {r['item_id'] for r in before['inventory_item_membership'] if r['root_container_id'] in personal_roots}
    for name, field, ids in [('inventory_container', 'id', personal_containers),
                             ('inventory_item', 'id', personal_items),
                             ('inventory_container_scope', 'container_id', personal_containers),
                             ('inventory_item_membership', 'item_id', personal_items),
                             ('weapon_energy', 'item_id', personal_items),
                             ('inventory_item_pin', 'item_id', personal_items)]:
        if canonical([r for r in before[name] if r[field] in ids]) != canonical([r for r in after[name] if r[field] in ids]):
            issues.append(name + ' personal rows changed')
    for name in ('character', 'character_appearance', 'identity_link', 'personal_starter_receipt'):
        if name == 'character':
            a, b = [r for r in before[name] if r['id'] != aid], [r for r in after[name] if r['id'] != aid]
        else: a, b = before[name], after[name]
        if canonical(a) != canonical(b): issues.append(name + ' protected rows changed')
    target_decks = {r['id'] for r in before['construction_deck'] if r['instance_id'] == sid}
    refs = {'id', 'ship_id', 'instance_id', 'deck_id', 'body_id'}
    for name in WIPED_SHIP_TABLES:
        if name in ('construction_location', 'world_admission', 'input', 'couch_seat', 'construction_pilot_seat'):
            keep = lambda r: r.get('character_id') != aid
        else:
            keep = lambda r: not any(r.get(k) == sid or r.get(k) in target_decks for k in refs)
        volatile = EVA_MOVING_COLUMNS if name in ('eva_body','eva_airlock_cycle') else MOTION_COLUMNS
        if canonical([r for r in before[name] if keep(r)], volatile) != canonical([r for r in after[name] if keep(r)], volatile):
            issues.append(name + ' unrelated rows changed')
    source_roots = {r['root_container_id'] for r in before['inventory_container_scope'] if r['instance_id'] == sid}
    discarded_items = {r['item_id'] for r in before['inventory_item_membership'] if r['root_container_id'] in source_roots}
    if any(r['id'] in discarded_items for r in after['inventory_item']): issues.append('Discarded storage item survives')
    before_containers = {r['container_id'] for r in before['inventory_container_scope'] if r['instance_id'] == sid}
    after_containers = {r['container_id'] for r in after['inventory_container_scope'] if r['instance_id'] == sid}
    after_roots = {r['root_container_id'] for r in after['inventory_container_scope'] if r['instance_id'] == sid}
    after_items = {r['item_id'] for r in after['inventory_item_membership'] if r['root_container_id'] in after_roots}
    for name, field, old_ids, new_ids in [
        ('inventory_container','id',before_containers,after_containers),
        ('inventory_item','id',discarded_items,after_items),
        ('inventory_container_scope','container_id',before_containers,after_containers),
        ('inventory_item_membership','item_id',discarded_items,after_items),
        ('inventory_hotbar','item_id',discarded_items,after_items),
        ('storage_binding','container_id',before_containers,after_containers),
        ('weapon_energy','item_id',discarded_items,after_items),
        ('inventory_item_pin','item_id',discarded_items,after_items),
    ]:
        if canonical([r for r in before[name] if r[field] not in old_ids]) != canonical([r for r in after[name] if r[field] not in new_ids]):
            issues.append(name + ' unrelated inventory changed')
    if canonical([r for r in before['inventory_state'] if r['character_id'] != aid]) != canonical([r for r in after['inventory_state'] if r['character_id'] != aid]):
        issues.append('Other character inventory state changed')

    output = {'verified': not issues, 'operationId': args.operation_id, 'targetShipId': sid,
              'targetBlueprintSha256': summary['targetBlueprintSha256'], 'issues': issues}
    if issues: raise RuntimeError(json.dumps(output))
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    for command in ('resolve', 'plan', 'export', 'dry-run', 'apply', 'verify', 'ledger'):
        p = sub.add_parser(command); p.add_argument('--server', required=True); p.add_argument('--database', required=True)
        if command in ('resolve', 'plan', 'dry-run'):
            p.add_argument('--character-id', required=True); p.add_argument('--target-prefab-id', required=True)
        if command in ('dry-run', 'apply', 'verify', 'ledger'): p.add_argument('--operation-id', required=True)
        if command in ('dry-run', 'apply'): p.add_argument('--discard-ship-storage', action='store_true')
        if command == 'apply':
            p.add_argument('--from-dry-run', required=True); p.add_argument('--confirm-database', required=True)
        if command in ('apply', 'verify'): p.add_argument('--backup', required=True)
        if command == 'export': p.add_argument('--out-dir')
    args = parser.parse_args()
    result = (plan(args) if args.command in ('plan','resolve') else export(args) if args.command == 'export'
              else dry_run(args) if args.command == 'dry-run' else apply(args) if args.command == 'apply'
              else verify(args) if args.command == 'verify' else ledger(args.server,args.database,args.operation_id))
    if args.command != 'export': print(json.dumps(result, indent=2))

if __name__ == '__main__':
    try: main()
    except (RuntimeError, ValueError, KeyError) as error:
        print('error: ' + str(error), file=sys.stderr); sys.exit(1)
