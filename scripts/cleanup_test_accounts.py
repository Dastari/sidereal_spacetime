"""Explicit, resumable database-owner cleanup of pinned ship-owning identities.

SQL maintenance is intentionally outside gameplay reducers. Retire identities first
so their old tokens cannot recreate characters between the bounded row deletions.
No database reset, schema change, or client/module publication is involved.
"""
import argparse
import json
import re
import subprocess
import time
from pathlib import Path

from dev import CLI, ROOT
from replace_player_wayfarers import sql

GLOBAL_TABLES = {
    'movement_timer', 'construction_atmosphere_clock', 'construction_traversal_clock',
    'world_system', 'system_body', 'body_world_motion',
}
ACCOUNT_FIELDS = {'owner', 'principal', 'source', 'target', 'grantee', 'grantor'}
REFERENCE_FIELDS = {
    'id', 'character_id', 'root_character_id', 'ship_id', 'instance_id',
    'source_instance_id', 'target_instance_id', 'return_ship_id', 'container_id',
    'root_container_id', 'parent_container_id', 'source_container_id',
    'target_container_id', 'item_id', 'parent_item_id', 'object_id',
    'placed_object_id', 'station_id', 'deck_id', 'body_id', 'result_id',
    'occupant_id', 'assembly_id', 'grid_id', 'link_id', 'reservation_id',
}

def identity(value):
    if isinstance(value, list) and len(value) == 1 and isinstance(value[0], str):
        value = value[0]
    if isinstance(value, str) and re.fullmatch(r'(?:0x)?[a-f0-9]{64}', value):
        return value.removeprefix('0x')
    return None

def plan_rows(tables, targets, protected):
    targets, protected = set(targets), set(protected)
    if not targets or not protected or targets & protected:
        raise ValueError('Disjoint nonempty target and protected accounts required')
    if len(targets) > 128 or sum(map(len, tables.values())) > 100000:
        raise ValueError('Cleanup budget exceeded')
    ships = [r for r in tables['ship'] if identity(r['owner']) in targets]
    if {identity(r['owner']) for r in ships} != targets:
        raise ValueError('Every target must currently own a ship')
    ids = {r['id'] for r in ships}
    ids.update(r['id'] for r in tables['character'] if identity(r['owner']) in targets)
    protected_ids = {r['id'] for t in ('character', 'ship') for r in tables[t] if identity(r['owner']) in protected}
    selected = set()
    for _ in range(64):
        previous = len(selected)
        for table, rows in tables.items():
            if table in GLOBAL_TABLES or table == 'retired_identity':
                continue
            for i, row in enumerate(rows):
                related = any(identity(v) in targets for k, v in row.items() if k in ACCOUNT_FIELDS)
                related |= any(isinstance(v, str) and v in ids for k, v in row.items() if k in REFERENCE_FIELDS)
                if not related:
                    continue
                if any(identity(v) in protected for k, v in row.items() if k in ACCOUNT_FIELDS):
                    raise ValueError('Cleanup intersects a protected account: ' + table)
                if any(isinstance(v, str) and v in protected_ids for k, v in row.items() if k in REFERENCE_FIELDS):
                    raise ValueError('Cleanup intersects a protected entity: ' + table)
                selected.add((table, i))
                if isinstance(row.get('id'), str) and row['id']:
                    ids.add(row['id'])
        if len(selected) == previous:
            break
    else:
        raise ValueError('Dependency closure did not converge')
    # A shared reference must never silently take a protected character/ship.
    for table in ('character', 'ship'):
        for i, row in enumerate(tables[table]):
            if (table, i) in selected and identity(row['owner']) not in targets:
                raise ValueError('Cleanup crosses account ownership')
    return [{'table': t, 'row': tables[t][i]} for t, i in sorted(selected)]

def snapshot(server, database):
    metadata = sql(server, database, 'SELECT * FROM st_table')
    columns = sql(server, database, 'SELECT * FROM st_column')
    tables, keys = {}, {}
    for table in metadata:
        if table['table_type'] != 'user':
            continue
        name = table['table_name']
        if not re.fullmatch('[a-z_]+', name):
            raise ValueError('Unexpected table identifier')
        tables[name] = sql(server, database, 'SELECT * FROM ' + name)
        key = table['table_primary_key']
        if key[0] == 0:
            keys[name] = [c['col_name'] for c in columns if c['table_id'] == table['table_id'] and c['col_pos'] in key[1]]
    return tables, keys

def literal(value):
    ident = identity(value)
    if ident:
        return '0x' + ident
    if isinstance(value, str):
        return "'" + value.replace("'", "''") + "'"
    if type(value) is int:
        return str(value)
    raise ValueError('Unsupported primary key')

def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    # Create private before writing account data.
    path.touch(mode=0o600, exist_ok=True)
    path.chmod(0o600)
    path.write_text(json.dumps(value, indent=2) + '\n')

def mutate(server, database, query):
    subprocess.run(CLI + ['sql', database, '--server', server, query], cwd=ROOT,
                   check=True, capture_output=True, text=True)

def run(args):
    if args.server not in ('http://127.0.0.1:3100', 'http://127.0.0.1:3191') or not args.database.startswith('sidereal-spacetime-dev'):
        raise ValueError('Explicit managed local database required')
    path = Path(args.audit)
    if path.exists():
        record = json.loads(path.read_text())
        if (record['server'], record['database']) != (args.server, args.database):
            raise ValueError('Audit database mismatch')
    else:
        tables, keys = snapshot(args.server, args.database)
        protected = args.protect
        targets = [identity(r['owner']) for r in tables['ship'] if identity(r['owner']) not in protected]
        targets = sorted(set(targets))
        selected = plan_rows(tables, targets, protected)
        for entry in selected:
            if not keys.get(entry['table']):
                raise ValueError('Selected table lacks primary key')
        record = dict(server=args.server, database=args.database, protected=protected,
                      targets=targets, before=tables, keys=keys, selected=selected, completed=[])
        save(path, record)
    print(json.dumps({'accounts': len(record['targets']), 'rows': len(record['selected']), 'apply': args.apply}), flush=True)
    if not args.apply:
        return
    before = record['before']
    # Recheck pinned ship/character ownership before retiring any live identity.
    current, _ = snapshot(args.server, args.database)
    removed = {(e['table'], json.dumps([e['row'][k] for k in record['keys'][e['table']]])) for e in record['selected']}
    for table in ('ship', 'character'):
        expected = {r['id']: r for r in before[table]}
        for row in current[table]:
            prior = expected.get(row['id'])
            if prior is None or row['owner'] != prior['owner']:
                raise ValueError('Ship/character ownership changed since plan')
    retired = {identity(r['source']) for r in current['retired_identity']}
    for owner in record['targets']:
        if owner not in retired:
            mutate(args.server, args.database, f"INSERT INTO retired_identity (source, target, character_id, linked_micros) VALUES (0x{owner}, 0x{owner}, '', {time.time_ns() // 1000})")
    # Remove simulation roots first: while a ship exists its timer can recreate
    # actuator rows. Replay every pinned DELETE, including after interruption.
    ordered = sorted(enumerate(record['selected']), key=lambda pair: (0 if pair[1]['table'] in ('ship', 'character') else 1, pair[0]))
    for i, entry in ordered:
        table, row = entry['table'], entry['row']
        where = ' AND '.join(k + ' = ' + literal(row[k]) for k in record['keys'][table])
        mutate(args.server, args.database, 'DELETE FROM ' + table + ' WHERE ' + where)
        if i not in record['completed']:
            record['completed'].append(i)
        if len(record['completed']) % 100 == 0:
            save(path, record)
            print('Deleted', len(record['completed']), 'of', len(record['selected']), flush=True)
    after, _ = snapshot(args.server, args.database)
    for table, rows in after.items():
        for row in rows:
            if table in record['keys'] and (table, json.dumps([row[k] for k in record['keys'][table]])) in removed:
                raise ValueError('Selected row remains: ' + table)
    # Global state and protected entity identity are checked separately from live
    # motion/tick counters, which legitimately continue during maintenance.
    for table in ('ship', 'character'):
        expected = sorted((r['id'], r['owner']) for r in before[table] if identity(r['owner']) in record['protected'])
        actual = sorted((r['id'], r['owner']) for r in after[table])
        if actual != expected:
            raise ValueError('Protected entity identity changed')
    record['after'] = after
    record['verified'] = True
    save(path, record)
    print('Verified cleanup and protected ship/character identities', flush=True)

if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--server', required=True)
    p.add_argument('--database', required=True)
    p.add_argument('--audit', required=True)
    p.add_argument('--protect', action='append', default=[])
    p.add_argument('--apply', action='store_true')
    run(p.parse_args())
