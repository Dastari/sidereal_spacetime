import sys
import unittest
from unittest.mock import patch
import dev


class DatabaseStartOnlyTest(unittest.TestCase):
    def test_managed_start_does_not_publish_or_restart(self):
        with patch.object(sys, 'argv', ['dev.py', 'database-up']), \
                patch.object(dev, 'database_up') as start, \
                patch.object(dev, 'publish') as publish, \
                patch.object(dev, 'down') as stop:
            dev.main()
        start.assert_called_once_with(publish_module=False)
        publish.assert_not_called()
        stop.assert_not_called()


if __name__ == '__main__':
    unittest.main()
