#!/usr/bin/env python3
"""Plan/apply the explicitly requested additive fleet. CLI output contains aggregates only."""
import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ship_wipe import ROOT, call, load_backup, sql
from ship_upgrade import quote


def fleet_pin():
    source = "import { FEDERATION_FLEET_PIN_SET } from './packages/world/src/faction-fleet-pins.ts';console.log(JSON.stringify(FEDERATION_FLEET_PIN_SET));"
    result = subprocess.run([str(ROOT / 'node_modules/.bin/tsx'), '-e', source],
                            cwd=ROOT, capture_output=True, text=True, check=True)
    pin = json.loads(result.stdout)
    if not re.fullmatch(r'[0-9a-f]{64}', pin):
        raise RuntimeError('PIN')
    return pin


def plan(args):
    if not args.character_name or len(args.character_name) > 128:
        raise RuntimeError('CHARACTER')
    actors = sql(args.server, args.database,
                 f'SELECT id, ship_id FROM character WHERE name = {quote(args.character_name)}')
    if len(actors) != 1 or not actors[0]['ship_id']:
        raise RuntimeError('CHARACTER')
    actor = actors[0]
    instances = sql(args.server, args.database,
                    f'SELECT revision FROM construction_instance WHERE id = {quote(actor["ship_id"])}')
    if len(instances) != 1:
        raise RuntimeError('OCCUPANCY')
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._:-]{7,127}', args.operation_id or ''):
        raise RuntimeError('OPERATION')
    record = {'format': 'sidereal-additive-fleet-plan-v1', 'server': args.server,
              'database': args.database, 'request': {
                  'operationId': args.operation_id, 'characterId': actor['id'],
                  'expectedShipId': actor['ship_id'],
                  'expectedInstanceRevision': int(instances[0]['revision']),
                  'expectedFleetPinSet': fleet_pin()}}
    output = Path(args.plan)
    output.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    descriptor = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, 'w') as stream:
        json.dump(record, stream)
        stream.flush()
        os.fsync(stream.fileno())
    return {'status': 'PLANNED', 'additionalShips': 6, 'preservesCurrentShip': True}


def apply(args):
    record = json.loads(Path(args.plan).read_text())
    if (record.get('format') != 'sidereal-additive-fleet-plan-v1'
            or record.get('server') != args.server or record.get('database') != args.database):
        raise RuntimeError('TARGET')
    request = record['request']
    if request['expectedFleetPinSet'] != fleet_pin():
        raise RuntimeError('PIN')
    if args.backup:
        backup = load_backup(args.backup, args.database)
        actors = backup['tables']['character']
        instances = backup['tables']['construction_instance']
        if backup.get('server') != args.server:
            raise RuntimeError('BACKUP')
    elif getattr(args, 'owner_waived_backup', False):
        actors = sql(args.server, args.database,
                     f"SELECT id, ship_id FROM character WHERE id = {quote(request['characterId'])}")
        instances = sql(args.server, args.database,
                        f"SELECT id, revision FROM construction_instance WHERE id = {quote(request['expectedShipId'])}")
    else:
        raise RuntimeError('BACKUP')
    actor = next((r for r in actors if r['id'] == request['characterId']), None)
    instance = next((r for r in instances if r['id'] == request['expectedShipId']), None)
    if (not actor or not instance
            or actor['ship_id'] != request['expectedShipId']
            or int(instance['revision']) != request['expectedInstanceRevision']):
        raise RuntimeError('PREFLIGHT')
    call(args.server, args.database, 'operator_install_faction_fleet',
         request['operationId'], request['characterId'], request['expectedShipId'],
         request['expectedInstanceRevision'], request['expectedFleetPinSet'])
    rows = sql(args.server, args.database,
               'SELECT kind, summary_json FROM ship_operator_operation '
               f'WHERE operation_id = {quote(request["operationId"])}')
    if len(rows) != 1 or rows[0]['kind'] != 'install-faction-fleet':
        raise RuntimeError('RECEIPT')
    summary = json.loads(rows[0]['summary_json'])
    if len(summary.get('installed', [])) != 6:
        raise RuntimeError('RECEIPT')
    return {'status': 'APPLIED_OR_REPLAYED', 'additionalShips': 6, 'preservesCurrentShip': True}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['plan', 'apply'])
    parser.add_argument('--server', required=True)
    parser.add_argument('--database', required=True)
    parser.add_argument('--plan', required=True, help='Private plan file; plan creates, apply reads')
    parser.add_argument('--character-name')
    parser.add_argument('--operation-id')
    parser.add_argument('--backup', help='Private pre-publication backup unless explicitly waived by owner')
    parser.add_argument('--owner-waived-backup', action='store_true',
                        help='Use only when the owner explicitly declined backups')
    args = parser.parse_args()
    try:
        if args.command == 'apply' and not args.backup and not args.owner_waived_backup:
            raise RuntimeError('BACKUP')
        result = plan(args) if args.command == 'plan' else apply(args)
    except (Exception, SystemExit):
        # Existing operator helpers can include private SDK/SQL context in exceptions.
        # Keep diagnostics private and provide a stable failure enum on this entry point.
        print(json.dumps({'status': 'FAIL', 'phase': args.command.upper()}))
        return 1
    print(json.dumps(result))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
