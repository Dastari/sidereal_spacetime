"""ship_wipe.py verify compares the preserved map with volatile motion columns excluded."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import ship_wipe  # noqa: E402


def tables(**motion):
    body = {'body_id': 'rock-1', 'system_id': 'sol', 'x': 10.0, 'y': 20.0, 'vx': 0.1, 'vy': 0.0,
            'heading': 0.0, 'omega': 0.0, 'server_tick': 5, 'cell_x': 1, 'cell_y': 2285}
    body.update(motion)
    out = {name: [] for name in ship_wipe.MAP_TABLES}
    out['body_world_motion'] = [body]
    out['world_system'] = [{'id': 'sol', 'last_simulation_tick': 5}]
    return out


class MapFingerprintTest(unittest.TestCase):
    def test_moving_body_across_a_cell_boundary_is_unchanged_map(self):
        # Live 2026-09-28: a drifting body moved from cell_y 2285 to 2286 during the migration.
        before = ship_wipe.map_fingerprint(tables())
        after = ship_wipe.map_fingerprint(tables(x=10.5, y=20.7, server_tick=900, cell_y=2286, cell_x=2))
        self.assertEqual(before, after)

    def test_identity_changes_still_count(self):
        before = ship_wipe.map_fingerprint(tables())
        self.assertNotEqual(before, ship_wipe.map_fingerprint(tables(system_id='other')))
        self.assertNotEqual(before, ship_wipe.map_fingerprint(tables(body_id='rock-2')))

    def test_volatile_columns_cover_every_motion_column_the_step_writes(self):
        self.assertEqual(ship_wipe.MAP_VOLATILE_COLUMNS['body_world_motion'],
                         {'x', 'y', 'vx', 'vy', 'heading', 'omega', 'server_tick', 'cell_x', 'cell_y'})


if __name__ == '__main__':
    unittest.main()
