"""Blender name suffixes cannot substitute for exact component metadata."""
import unittest

from character_components.check_installed import require_component_node


class InstalledComponentIdentityTests(unittest.TestCase):
    def node(self, name='GEO-medic-visor', component_id='medic-visor'):
        return {'name': name, 'mesh': 0, 'extras': {'component_id': component_id}}

    def test_exact_identity_and_blender_numeric_suffixes_pass(self):
        for name in ('GEO-medic-visor', 'GEO-medic-visor.001', 'GEO-medic-visor.1000'):
            with self.subTest(name=name):
                node = self.node(name)
                self.assertIs(require_component_node([node], 'medic-visor'), node)

    def test_matching_name_cannot_hide_wrong_metadata(self):
        with self.assertRaisesRegex(ValueError, 'Missing/duplicate component mesh'):
            require_component_node([self.node('GEO-medic-visor.001', 'pilot-visor')], 'medic-visor')

    def test_name_and_metadata_must_belong_to_same_node(self):
        nodes = [self.node('GEO-medic-visor', 'pilot-visor'), self.node('GEO-pilot-visor', 'medic-visor')]
        with self.assertRaisesRegex(ValueError, 'name/metadata mismatch'):
            require_component_node(nodes, 'medic-visor')

    def test_duplicate_metadata_or_missing_mesh_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'Missing/duplicate component mesh'):
            require_component_node([self.node(), self.node('GEO-medic-visor.001')], 'medic-visor')
        node = self.node()
        del node['mesh']
        with self.assertRaisesRegex(ValueError, 'Missing/duplicate component mesh'):
            require_component_node([node], 'medic-visor')

    def test_other_suffixes_and_wrong_mesh_names_are_rejected(self):
        for name in ('GEO-medic-visor-copy', 'GEO-medic-visor.1', 'GEO-medic-visor.001.extra', 'GEO-pilot-visor.001'):
            with self.subTest(name=name), self.assertRaisesRegex(ValueError, 'name/metadata mismatch'):
                require_component_node([self.node(name)], 'medic-visor')


if __name__ == '__main__':
    unittest.main()
