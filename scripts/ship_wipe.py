#!/usr/bin/env python3
"""Operator tooling for the explicit ship wipe / prefab assignment runbook.

Every command names the server URL and database explicitly; nothing defaults to
the live database and nothing runs on deploy. Operator reducers are invoked
with the local SpacetimeDB CLI identity (the deployment owner). Backups are
written outside git (``.runtime/ship-wipe-backups``, mode 0600).

See docs/operations/ship_wipe_runbook.md.
"""
import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOOLS = ROOT / '.tools/spacetime'
BACKUP_DIR = ROOT / '.runtime/ship-wipe-backups'

# Must mirror WIPED_SHIP_TABLES in packages/world/src/ship-wipe.ts
# (checked by packages/world/src/ship-wipe-tooling.test.ts).
WIPED_SHIP_TABLES = [
    'ship', 'station', 'ship_world_motion', 'construction_instance', 'construction_deck',
    'game_ship_access', 'construction_flight_binding', 'construction_flight_station',
    'construction_flight_fitting', 'construction_flight_compiled', 'construction_flight_dirty',
    'construction_flight_damage_event', 'construction_pilot_seat', 'actuator_output', 'space_body',
    'legacy_body_alias', 'ship_zone_state', 'pilot_layout_receipt', 'construction_door',
    'construction_airlock', 'construction_native_pressure', 'construction_atmosphere',
    'construction_stair_link', 'construction_stair_walk', 'construction_stair_reservation',
    'construction_traversal_link', 'construction_traversal', 'construction_traversal_reservation',
    'construction_interaction_binding', 'interaction_object', 'couch_seat',
    'construction_passenger_grant', 'construction_passenger_visit', 'construction_flight_review',
    'construction_review_origin', 'wayfarer_refit_attachment', 'construction_cargo_assembly',
    'construction_cargo_grid', 'construction_cargo_placement', 'instance_inventory_binding',
    'construction_location', 'world_admission', 'input',
]
# Rows the wipe partially deletes (ship-held) or rewrites (characters, personal kit).
CHARACTER_AND_INVENTORY_TABLES = [
    'character', 'inventory_state', 'inventory_item', 'inventory_container', 'inventory_hotbar',
    'inventory_container_scope', 'inventory_item_membership', 'storage_binding', 'weapon_energy',
    'personal_starter_receipt', 'identity_link', 'character_appearance',
]
# Must mirror PRESERVED_MAP_TABLES. Static tables are compared exactly after a
# wipe; kinematic/tick columns are excluded (the world keeps simulating).
MAP_TABLES = [
    'world_system', 'system_body', 'body_world_motion', 'celestial_migration_receipt',
    'system_zone', 'system_map_definition', 'field_asteroid', 'system_map_edit',
]
MAP_VOLATILE_COLUMNS = {
    'world_system': {'last_simulation_tick'},
    'body_world_motion': {'x', 'y', 'vx', 'vy', 'heading', 'omega', 'server_tick'},
}
OPERATOR_TABLES = ['ship_policy', 'ship_operator_operation']


def cli(args, *, capture=True):
    command = [str(TOOLS / 'spacetime'), f'--root-dir={TOOLS}', *args]
    result = subprocess.run(command, cwd=ROOT, capture_output=capture, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"spacetime {' '.join(args[:1])} failed: {result.stderr.strip() or result.stdout.strip()}")
    return result.stdout


def sql(server, database, query):
    out = cli(['sql', '--server', server, '--yes', '--no-config', '--format', 'json', database, query])
    start = out.find('[')
    payload = json.loads(out[start:]) if start >= 0 else []
    rows = []
    for result in payload:
        names = [e['name'].get('some', f'col{i}') for i, e in enumerate(result['schema']['elements'])]
        rows.extend(dict(zip(names, row)) for row in result['rows'])
    return rows


def call(server, database, reducer, *arguments):
    cli(['call', '--server', server, '--yes', '--no-config', database, reducer,
         *[json.dumps(a) for a in arguments]])


def table(server, database, name):
    return sql(server, database, f'SELECT * FROM {name}')


def counts(server, database):
    return {
        'ships': len(table(server, database, 'ship')),
        'instances': len(table(server, database, 'construction_instance')),
        'characters': len(table(server, database, 'character')),
    }


def map_fingerprint(tables):
    result = {}
    for name in MAP_TABLES:
        volatile = MAP_VOLATILE_COLUMNS.get(name, set())
        rows = [{k: v for k, v in row.items() if k not in volatile} for row in tables[name]]
        rows.sort(key=lambda r: json.dumps(r, sort_keys=True))
        result[name] = hashlib.sha256(json.dumps(rows, sort_keys=True).encode()).hexdigest()
    return result


def ledger(server, database, operation_id):
    rows = [r for r in table(server, database, 'ship_operator_operation') if r['operation_id'] == operation_id]
    if not rows:
        raise RuntimeError(f'No ledger row for operation {operation_id}')
    row = rows[0]
    return {'operationId': operation_id, 'kind': row['kind'], 'request': json.loads(row['request']),
            'summary': json.loads(row['summary_json'])}


def require_operation_id(value):
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._:-]{7,127}', value):
        raise SystemExit('Operation ID must be 8-128 characters of letters, digits, ".", "_", ":" or "-"')
    return value


def export(args):
    tables = {}
    for name in [*WIPED_SHIP_TABLES, *CHARACTER_AND_INVENTORY_TABLES, *MAP_TABLES, *OPERATOR_TABLES]:
        tables[name] = table(args.server, args.database, name)
    snapshot = {
        'format': 'sidereal-ship-wipe-backup-v1',
        'server': args.server,
        'database': args.database,
        'createdUtc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'counts': {'ships': len(tables['ship']), 'instances': len(tables['construction_instance']),
                   'characters': len(tables['character'])},
        'rowCounts': {k: len(v) for k, v in tables.items()},
        'mapFingerprint': map_fingerprint(tables),
        'tables': tables,
    }
    out_dir = Path(args.out_dir) if args.out_dir else BACKUP_DIR
    out_dir.mkdir(parents=True, exist_ok=True)
    os.chmod(out_dir, 0o700)
    path = out_dir / f"{args.database}-{time.strftime('%Y%m%d-%H%M%S')}.json"
    data = json.dumps(snapshot, indent=1, sort_keys=True).encode()
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, 'wb') as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())
    record = {'backup': str(path), 'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data),
              'counts': snapshot['counts'], 'rowCounts': snapshot['rowCounts']}
    print(json.dumps(record, indent=1))
    return record


def load_backup(path, database):
    snapshot = json.loads(Path(path).read_text())
    if snapshot.get('format') != 'sidereal-ship-wipe-backup-v1' or snapshot.get('database') != database:
        raise SystemExit(f'Backup {path} is not a ship-wipe backup of {database}')
    return snapshot


def policy(args):
    call(args.server, args.database, 'operator_set_starter_ships', require_operation_id(args.operation_id),
         args.enabled == 'true')
    print(json.dumps({'policy': table(args.server, args.database, 'ship_policy'),
                      **ledger(args.server, args.database, args.operation_id)}, indent=1))


def dry_run(args):
    current = counts(args.server, args.database)
    call(args.server, args.database, 'operator_wipe_player_ships', require_operation_id(args.operation_id), True,
         current['ships'], current['instances'], current['characters'])
    result = ledger(args.server, args.database, args.operation_id)
    print(json.dumps(result, indent=1))
    return result


def apply(args):
    expected = {'ships': args.expected_ships, 'instances': args.expected_instances,
                'characters': args.expected_characters}
    if args.backup:
        snapshot = load_backup(args.backup, args.database)
        if snapshot['counts'] != expected:
            raise SystemExit(f"Backup counts {snapshot['counts']} differ from expected {expected}; export again")
    elif not args.owner_waived_backup:
        raise SystemExit('A pre-wipe backup (--backup) is required unless the owner waived it (--owner-waived-backup)')
    if args.confirm_database != args.database:
        raise SystemExit('--confirm-database must repeat --database exactly')
    call(args.server, args.database, 'operator_wipe_player_ships', require_operation_id(args.operation_id), False,
         args.expected_ships, args.expected_instances, args.expected_characters)
    result = ledger(args.server, args.database, args.operation_id)
    print(json.dumps({**result, 'after': counts(args.server, args.database)}, indent=1))


def assign(args):
    call(args.server, args.database, 'operator_assign_prefab_ship', require_operation_id(args.operation_id),
         args.character_id, args.prefab_id, args.expected_ship_id, args.allow_legacy)
    print(json.dumps(ledger(args.server, args.database, args.operation_id), indent=1))


def verify(args):
    snapshot = load_backup(args.backup, args.database)
    tables = {name: table(args.server, args.database, name) for name in MAP_TABLES}
    fingerprint = map_fingerprint(tables)
    characters = table(args.server, args.database, 'character')
    before_characters = {c['id']: c for c in snapshot['tables']['character']}
    report = {
        'mapUnchanged': fingerprint == snapshot['mapFingerprint'],
        'mapTablesChanged': [k for k in MAP_TABLES if fingerprint[k] != snapshot['mapFingerprint'][k]],
        'counts': counts(args.server, args.database),
        'charactersPreserved': sorted(before_characters) == sorted(c['id'] for c in characters)
        and all(before_characters[c['id']]['owner'] == c['owner'] and before_characters[c['id']]['name'] == c['name']
                for c in characters if c['id'] in before_characters),
        'charactersAwaitingShip': sum(1 for c in characters if c['ship_id'] == ''),
        'wipedTablesEmpty': {name: len(table(args.server, args.database, name)) for name in WIPED_SHIP_TABLES},
    }
    report['wipedTablesEmpty'] = all(v == 0 for v in report['wipedTablesEmpty'].values()) or report['wipedTablesEmpty']
    print(json.dumps(report, indent=1))
    ok = report['mapUnchanged'] and report['charactersPreserved']
    if args.expect_wiped:
        ok = ok and report['wipedTablesEmpty'] is True and report['counts']['ships'] == 0
    if not ok:
        raise SystemExit('Post-wipe verification failed')
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest='command', required=True)

    def common(p):
        p.add_argument('--server', required=True, help='e.g. http://127.0.0.1:3391 (no default)')
        p.add_argument('--database', required=True, help='explicit database name (no default)')
        return p

    p = common(sub.add_parser('export', help='write a private pre-wipe JSON backup'))
    p.add_argument('--out-dir', help='defaults to .runtime/ship-wipe-backups (outside git)')
    p.set_defaults(func=export)
    p = common(sub.add_parser('policy', help='enable/disable legacy starter ships for new characters'))
    p.add_argument('--operation-id', required=True)
    p.add_argument('--enabled', required=True, choices=['true', 'false'])
    p.set_defaults(func=policy)
    p = common(sub.add_parser('dry-run', help='record wipe counts without changing state'))
    p.add_argument('--operation-id', required=True)
    p.set_defaults(func=dry_run)
    p = common(sub.add_parser('apply', help='wipe all player ships (irreversible except via archive/backup)'))
    p.add_argument('--operation-id', required=True)
    p.add_argument('--expected-ships', type=int, required=True)
    p.add_argument('--expected-instances', type=int, required=True)
    p.add_argument('--expected-characters', type=int, required=True)
    p.add_argument('--backup', help='backup file from `export` of this database')
    p.add_argument('--owner-waived-backup', action='store_true')
    p.add_argument('--confirm-database', required=True)
    p.set_defaults(func=apply)
    p = common(sub.add_parser('assign', help='assign a registered prefab ship to an awaiting character'))
    p.add_argument('--operation-id', required=True)
    p.add_argument('--character-id', required=True)
    p.add_argument('--prefab-id', required=True)
    p.add_argument('--expected-ship-id', default='')
    p.add_argument('--allow-legacy', action='store_true', help='tests only: legacy Wayfarer stand-in')
    p.set_defaults(func=assign)
    p = common(sub.add_parser('verify', help='compare map state with a backup and report post-wipe invariants'))
    p.add_argument('--backup', required=True)
    p.add_argument('--expect-wiped', action='store_true')
    p.set_defaults(func=verify)
    p = common(sub.add_parser('ledger', help='print the ledger row for an operation'))
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
