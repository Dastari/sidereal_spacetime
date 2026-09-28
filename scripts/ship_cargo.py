#!/usr/bin/env python3
"""Operator tooling: stock a prefab ship's storage socket (e.g. Wren's hold crate) with items.

Calls the operator-only reducer ``operator_stock_ship_cargo`` with the local SpacetimeDB CLI
identity (the deployment owner, same as scripts/ship_wipe.py). The reducer is additive: it binds a
ship-owned container to the socket if none exists, then inserts NEW item instances. Replaying an
operation ID is a no-op. Every command names the server and database explicitly.

  resolve  read-only: character (by --character-id or --character-name), its ship, game-ship access
           and existing socket bindings
  dry-run  plan and record a ledger row without changing inventory
  apply    stock the socket (requires --confirm-database equal to --database)
  ledger   print the ledger row of an operation

Kits (packages/content/src/crew-wardrobe.ts CREW_WARDROBE_KITS): ``uniforms-and-tiers`` (the four
department uniforms and the tier 1-2 pieces) and ``role-sets`` (medic, engineer, pilot sets).
Wren sockets: ``hold/cargo.standard.medium`` (storage crate) and
``bunks/shipyard.equipment.wall-locker`` (wall locker). See the wiki: Operations/Ship Cargo Stocking.
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ship_wipe import ROOT, call, ledger, require_operation_id, sql  # noqa: E402


def kit_ids(names):
    source = ("import { OPERATOR_ITEM_KITS } from './packages/content/src/inventory.ts';"
              "console.log(JSON.stringify(OPERATOR_ITEM_KITS));")
    out = subprocess.run([str(ROOT / 'node_modules/.bin/tsx'), '-e', source], cwd=ROOT,
                         capture_output=True, text=True, check=True).stdout
    kits = json.loads(out)
    ids = []
    for name in names:
        if name not in kits:
            raise SystemExit(f'Unknown kit {name}; known: {", ".join(kits)}')
        ids += kits[name]
    return ids


def quote(value):
    return "'" + value.replace("'", "''") + "'"


def resolve(args):
    if args.character_id:
        characters = sql(args.server, args.database,
                         f'SELECT id, name, ship_id FROM character WHERE id = {quote(args.character_id)}')
    else:
        characters = sql(args.server, args.database,
                         f'SELECT id, name, ship_id FROM character WHERE name = {quote(args.character_name)}')
    report = {'characters': characters}
    for c in characters:
        ship = c['ship_id']
        c['ship'] = sql(args.server, args.database,
                        f'SELECT id, name FROM ship WHERE id = {quote(ship)}') if ship else []
        c['gameShipAccess'] = sql(args.server, args.database,
                                  f'SELECT ship_id, character_id, lifecycle FROM game_ship_access '
                                  f'WHERE ship_id = {quote(ship)}') if ship else []
        c['socketBindings'] = sql(args.server, args.database,
                                  f'SELECT placed_object_id, container_id FROM instance_inventory_binding '
                                  f'WHERE instance_id = {quote(ship)}') if ship else []
    print(json.dumps(report, indent=2))


def stock(args, dry_run):
    require_operation_id(args.operation_id)
    if not dry_run and args.confirm_database != args.database:
        raise SystemExit('--confirm-database must repeat --database for apply')
    ids = (args.definition_ids.split(',') if args.definition_ids else []) + kit_ids(args.kit or [])
    if not ids:
        raise SystemExit('Give --kit and/or --definition-ids')
    call(args.server, args.database, 'operator_stock_ship_cargo', args.operation_id, dry_run,
         args.character_id, args.ship_id, args.socket, args.container_name, json.dumps(ids))
    print(json.dumps(ledger(args.server, args.database, args.operation_id), indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest='command', required=True)

    def common(p):
        p.add_argument('--server', required=True, help='explicit server URL (no default)')
        p.add_argument('--database', required=True, help='explicit database name (no default)')
        return p

    p = common(sub.add_parser('resolve', help='read-only character / ship / socket lookup'))
    who = p.add_mutually_exclusive_group(required=True)
    who.add_argument('--character-id')
    who.add_argument('--character-name')
    p.set_defaults(func=resolve)
    for name, dry in (('dry-run', True), ('apply', False)):
        p = common(sub.add_parser(name, help=('plan only' if dry else 'stock the socket')))
        p.add_argument('--operation-id', required=True)
        p.add_argument('--character-id', required=True)
        p.add_argument('--ship-id', required=True)
        p.add_argument('--socket', default='hold/cargo.standard.medium')
        p.add_argument('--container-name', default='Storage crate')
        p.add_argument('--kit', action='append', help='uniforms-and-tiers | role-sets | weapons-and-tools | weapons | tools-and-utility (repeatable)')
        p.add_argument('--definition-ids', help='extra comma-separated inventory definition ids')
        if not dry:
            p.add_argument('--confirm-database', required=True)
        p.set_defaults(func=lambda a, dry=dry: stock(a, dry))
    p = common(sub.add_parser('ledger', help='print an operation ledger row'))
    p.add_argument('--operation-id', required=True)
    p.set_defaults(func=lambda a: print(json.dumps(ledger(a.server, a.database, a.operation_id), indent=2)))
    args = parser.parse_args()
    args.func(args)


if __name__ == '__main__':
    main()
