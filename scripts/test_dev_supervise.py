"""Supervised foreground mode (`<name>-serve`), systemd hand-off in dev.py and the unit installer.

Every process here is a throwaway fixture on an ephemeral loopback port with its own temporary
.runtime directory; nothing talks to the configured database, its port or systemd itself.
"""
from pathlib import Path
from unittest.mock import patch
import json
import os
import signal
import socket
import subprocess
import sys
import tempfile
import time
import unittest

import dev

SCRIPTS = Path(__file__).resolve().parent
INSTALLER = SCRIPTS.parent / 'ops/systemd/install.sh'
UNITS = ('sidereal-database.service', 'sidereal-public-client.service', 'sidereal-studio.service')
HARNESS = '''
import sys
from pathlib import Path
sys.path.insert(0, sys.argv[1])
import dev
dev.STATE = Path(sys.argv[2])
port = int(sys.argv[3])
command = [sys.executable, '-m', 'http.server', str(port), '--bind', '127.0.0.1']
sys.exit(dev.supervise('fixture', command, None, f'http://127.0.0.1:{port}/', ('127.0.0.1', port), grace=5, ready_timeout=20))
'''


def free_port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


def wait(condition, seconds=20):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if condition():
            return True
        time.sleep(.05)
    return False


class SupervisorProcessTests(unittest.TestCase):
    """Real supervisor processes around a tiny HTTP child."""

    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.state = Path(self.folder.name) / 'runtime'
        self.state.mkdir()
        self.port = free_port()
        self.processes = []
        patcher = patch.object(dev, 'STATE', self.state)
        patcher.start()
        self.addCleanup(patcher.stop)

    def tearDown(self):
        for process in self.processes:
            if process.poll() is None:
                process.kill()
                process.wait()
            for stream in (process.stdout, process.stderr):
                if stream:
                    stream.close()
        row = self.row()
        if row and dev.alive(row):
            os.killpg(row['pid'], signal.SIGKILL)
        self.folder.cleanup()

    def row(self):
        return dev.load().get('fixture')

    def start(self, unit=None, notify=None):
        env = {key: value for key, value in os.environ.items() if not key.startswith(('SIDEREAL_', 'NOTIFY_SOCKET'))}
        if unit:
            env['SIDEREAL_SUPERVISOR_UNIT'] = unit
        if notify:
            env['NOTIFY_SOCKET'] = notify
        process = subprocess.Popen([sys.executable, '-c', HARNESS, str(SCRIPTS), str(self.state), str(self.port)],
                                   env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        self.processes.append(process)
        return process

    def ready(self):
        return dev.probe(f'http://127.0.0.1:{self.port}/')

    def test_sigterm_records_notifies_and_stops_cleanly(self):
        address = str(Path(self.folder.name) / 'notify.sock')
        with socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM) as notifications:
            notifications.bind(address)
            notifications.settimeout(20)
            supervisor = self.start(unit='sidereal-fixture.service', notify=address)
            self.assertTrue(notifications.recv(4096).decode().startswith('READY=1'))
            row = self.row()
            # Same shape as a detached row, so status/ready/backup keep working.
            self.assertTrue(dev.alive(row))
            self.assertEqual(row['supervisor']['pid'], supervisor.pid)
            self.assertEqual(row['supervisor']['unit'], 'sidereal-fixture.service')
            self.assertEqual(os.getpgid(row['pid']), row['pid'], 'child runs in its own process group')
            environment = Path(f"/proc/{row['pid']}/environ").read_bytes().split(b'\0')
            self.assertFalse([item for item in environment if item.startswith((b'NOTIFY_SOCKET=', b'SIDEREAL_SUPERVISOR_UNIT='))],
                             'systemd notification belongs to the supervisor only')
            self.assertEqual((self.state / 'processes.json').stat().st_mode & 0o777, 0o600)
            self.assertTrue(self.ready())
            status = dev.status()['fixture']
            self.assertEqual((status['running'], status['supervised'], status['unit']), (True, True, 'sidereal-fixture.service'))
            supervisor.send_signal(signal.SIGTERM)
            self.assertEqual(supervisor.wait(20), 0)
            self.assertEqual(notifications.recv(4096).decode(), 'STOPPING=1')
        self.assertIsNone(self.row())
        self.assertIsNone(dev.proc(row['pid']), 'child stopped with the supervisor')

    def test_ctrl_c_in_a_terminal_stops_cleanly(self):
        supervisor = self.start()
        self.assertTrue(wait(self.ready))
        child = self.row()['pid']
        supervisor.send_signal(signal.SIGINT)
        self.assertEqual(supervisor.wait(20), 0)
        self.assertIsNone(self.row())
        self.assertIsNone(dev.proc(child))

    def test_unexpected_child_exit_is_a_failure_for_restart(self):
        supervisor = self.start(unit='sidereal-fixture.service')
        self.assertTrue(wait(self.ready))
        os.killpg(self.row()['pid'], signal.SIGKILL)
        self.assertNotEqual(supervisor.wait(20), 0)
        self.assertNotEqual(supervisor.returncode, dev.CONFLICT_EXIT)
        self.assertIsNone(self.row())

    def test_refuses_a_service_already_running_outside_it(self):
        sleeper = subprocess.Popen(['sleep', '60'], start_new_session=True)
        self.processes.append(sleeper)
        with dev.state_lock():
            dev.save({'fixture': {'pid': sleeper.pid, 'start': dev.proc(sleeper.pid), 'command': ['sleep']}})
        supervisor = self.start(unit='sidereal-fixture.service')
        self.assertEqual(supervisor.wait(20), dev.CONFLICT_EXIT)
        self.assertIn('already running', supervisor.stderr.read())
        self.assertEqual(self.row()['pid'], sleeper.pid, 'the detached row is left alone')
        self.assertIsNone(sleeper.poll())

    def test_refuses_a_port_held_by_an_unrecorded_process(self):
        with socket.socket() as holder:
            holder.bind(('127.0.0.1', self.port))
            holder.listen()
            supervisor = self.start()
            self.assertEqual(supervisor.wait(20), dev.CONFLICT_EXIT)
        self.assertIsNone(self.row())

    def test_down_stops_a_manual_supervisor_through_its_signal(self):
        supervisor = self.start()
        self.assertTrue(wait(self.ready))
        child = self.row()['pid']
        with patch.object(dev, 'systemctl') as systemctl:
            dev.down('fixture')
        systemctl.assert_not_called()
        self.assertEqual(supervisor.wait(20), 0, 'a requested stop, not a failure')
        self.assertIsNone(self.row())
        self.assertIsNone(dev.proc(child))


class SystemdHandOffTests(unittest.TestCase):
    """dev.py talks to systemctl only for enabled units that run this checkout."""

    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.state = Path(self.folder.name)
        for patcher in (patch.object(dev, 'STATE', self.state),
                        patch.dict(os.environ, {'SIDEREAL_SYSTEMD': '', 'SIDEREAL_SUPERVISOR_UNIT': ''})):
            patcher.start()
            self.addCleanup(patcher.stop)
        self.sleepers = []

    def tearDown(self):
        for process in self.sleepers:
            if process.poll() is None:
                process.kill()
                process.wait()

    def sleeper(self):
        process = subprocess.Popen(['sleep', '60'], start_new_session=True)
        self.sleepers.append(process)
        return process

    def properties(self, **overrides):
        values = {'LoadState': 'loaded', 'UnitFileState': 'enabled', 'ActiveState': 'active', 'WorkingDirectory': str(dev.ROOT)}
        values.update(overrides)
        return patch.object(dev, 'unit_properties', return_value=values)

    def test_configured_unit_names_match_the_installed_templates(self):
        self.assertEqual(dev.CFG['systemd'], dict(zip(dev.SERVE, UNITS)))
        for unit in UNITS:
            self.assertTrue((INSTALLER.parent / f'{unit}.in').is_file(), unit)

    def test_enabled_unit_for_this_checkout_is_managed(self):
        with self.properties():
            self.assertEqual(dev.managed_unit('database'), 'sidereal-database.service')
            self.assertEqual(dev.managed_unit('dashboard'), 'sidereal-studio.service')
            self.assertIsNone(dev.managed_unit('client'), 'no unit configured')

    def test_units_for_other_checkouts_disabled_or_missing_are_not_managed(self):
        for overrides in ({'WorkingDirectory': '/root/sidereal-release-other'}, {'UnitFileState': 'disabled'},
                          {'LoadState': 'not-found', 'UnitFileState': ''}, {'WorkingDirectory': ''}):
            with self.subTest(overrides=overrides), self.properties(**overrides):
                self.assertIsNone(dev.managed_unit('database'))
        with patch.object(dev.subprocess, 'run', side_effect=FileNotFoundError('systemctl')):
            self.assertIsNone(dev.managed_unit('database'), 'hosts without systemd keep the detached flow')

    def test_escape_hatch_and_supervised_processes_never_use_systemctl(self):
        with self.properties():
            with patch.dict(os.environ, {'SIDEREAL_SYSTEMD': 'off'}):
                self.assertIsNone(dev.managed_unit('database'))
            with patch.dict(os.environ, {'SIDEREAL_SUPERVISOR_UNIT': 'sidereal-database.service'}):
                self.assertIsNone(dev.managed_unit('database'))

    def test_launch_starts_a_managed_unit_instead_of_a_detached_process(self):
        with self.properties(ActiveState='inactive'), patch.object(dev, 'systemctl') as systemctl, \
                patch.object(dev.subprocess, 'Popen') as popen:
            dev.launch('database', ['never-run'])
        systemctl.assert_called_once_with('start', 'sidereal-database.service')
        popen.assert_not_called()
        self.assertEqual(dev.load(), {})

    def test_launch_keeps_a_running_detached_process_during_hand_over(self):
        detached = self.sleeper()
        with dev.state_lock():
            dev.save({'database': {'pid': detached.pid, 'start': dev.proc(detached.pid), 'command': ['sleep']}})
        with self.properties(), patch.object(dev, 'systemctl') as systemctl:
            dev.launch('database', ['never-run'])
        systemctl.assert_not_called()

    def test_down_detached_row_still_signals_the_process_group(self):
        detached = self.sleeper()
        with dev.state_lock():
            dev.save({'database': {'pid': detached.pid, 'start': dev.proc(detached.pid), 'command': ['sleep']}})
        with patch.object(dev, 'systemctl') as systemctl:
            dev.down('database')
        systemctl.assert_not_called()
        self.assertIsNotNone(detached.wait(10))
        self.assertEqual(dev.load(), {})

    def test_down_stops_a_unit_row_through_systemctl(self):
        supervisor, child = self.sleeper(), self.sleeper()
        with dev.state_lock():
            dev.save({'database': {'pid': child.pid, 'start': dev.proc(child.pid), 'command': ['sleep'],
                                   'supervisor': {'pid': supervisor.pid, 'start': dev.proc(supervisor.pid), 'unit': 'sidereal-database.service'}},
                      'client': {'pid': 1, 'start': None, 'command': ['stale']}})
        calls = []

        def systemctl(*arguments):
            # What systemd does: SIGTERM the supervisor, which stops its child and its row.
            calls.append(arguments)
            self.assertIsNone(child.poll(), 'dev.py must not kill a unit-owned child itself')
            for process in (child, supervisor):
                process.terminate()
                process.wait()

        with patch.object(dev, 'systemctl', side_effect=systemctl):
            dev.down('database')
        self.assertEqual(calls, [('stop', 'sidereal-database.service')])
        self.assertEqual(list(dev.load()), ['client'], 'down(name) leaves other rows')

    def test_cold_backup_stops_and_starts_the_database_through_systemd(self):
        from release_backup import backup_database
        root = self.state / 'checkout'
        for name in ('.spacetime-data', '.tools/spacetime/config', '.runtime/public-client'):
            (root / name).mkdir(parents=True)
        (root / '.spacetime-data/state').write_text('fixture')
        (root / 'dev.toml').write_text('fixture')
        (root / '.runtime/public-client/release.json').write_text('{}')
        processes = []

        def unit_row():
            supervisor, child = self.sleeper(), self.sleeper()
            processes.append((supervisor, child))
            return {'pid': child.pid, 'start': dev.proc(child.pid), 'command': ['sleep'],
                    'supervisor': {'pid': supervisor.pid, 'start': dev.proc(supervisor.pid), 'unit': 'sidereal-database.service'}}

        calls = []

        def systemctl(action, unit):
            calls.append((action, unit))
            if action == 'stop':
                for process in processes[-1]:
                    process.terminate()
                    process.wait()
                with dev.state_lock():
                    dev.save({})
            else:
                with dev.state_lock():
                    dev.save({'database': unit_row()})

        with patch.object(dev, 'ROOT', root), patch.object(dev, 'STATE', root / '.runtime'), \
                self.properties(ActiveState='inactive'), patch.object(dev, 'systemctl', side_effect=systemctl), \
                patch.object(dev, 'port_free'), patch.object(dev, 'ready'), patch.object(dev, 'publish') as publish:
            dev.save({'database': unit_row()})
            backup_database(dev)
        self.assertEqual(calls, [('stop', 'sidereal-database.service'), ('start', 'sidereal-database.service')])
        publish.assert_not_called()
        self.assertEqual(len(list((root / '.runtime').glob('recovery-*.tar'))), 1)

    def test_serve_commands_route_to_the_foreground_supervisor(self):
        for service in dev.SERVE:
            with self.subTest(service=service), patch.object(sys, 'argv', ['dev.py', f'{service}-serve']), \
                    patch.object(dev, 'serve', return_value=0) as serve, patch('public_client.command') as public:
                self.assertEqual(dev.main(), 0)
            serve.assert_called_once_with(service)
            public.assert_not_called()

    def test_public_client_serve_command_resolves_the_activated_release(self):
        import public_client
        release = self.state / '.runtime/public-client/releases/r1'
        release.mkdir(parents=True)
        (release / 'index.html').write_text('fixture')
        (self.state / '.runtime/public-client/current').symlink_to(release)
        with patch.object(public_client, 'ROOT', self.state):
            command, _ = public_client.serve_command(dev.CFG)
        self.assertEqual(command[command.index('--outDir') + 1], str(release))
        self.assertEqual(command[command.index('--port') + 1], str(dev.CFG['public_client']['port']))


class InstallerTests(unittest.TestCase):
    """ops/systemd/install.sh against a fixture checkout and a temporary unit directory."""

    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        base = Path(self.folder.name)
        self.root = self.checkout(base / 'live', live=True)
        self.studio = self.checkout(base / 'studio-release')
        self.units = base / 'units'
        self.log = base / 'systemctl.log'
        self.stub = base / 'systemctl'
        # Records calls; `is-enabled` answers from what `enable` recorded.
        self.stub.write_text('#!/bin/sh\necho "$*" >> "%s"\n'
                             'if [ "$1" = is-enabled ]; then grep -qx "enable $2" "%s" && echo enabled || echo disabled; fi\n'
                             % (self.log, self.log))
        self.stub.chmod(0o755)

    def checkout(self, path, live=False):
        (path / 'scripts').mkdir(parents=True)
        (path / 'scripts/dev.py').write_text((SCRIPTS / 'dev.py').read_text())
        (path / 'dev.toml').write_text((SCRIPTS.parent / 'dev.toml').read_text())
        (path / 'node_modules/vite/bin').mkdir(parents=True)
        (path / 'node_modules/vite/bin/vite.js').write_text('')
        if live:
            (path / '.spacetime-data').mkdir()
            (path / '.tools/spacetime').mkdir(parents=True)
            (path / '.tools/spacetime/spacetime').write_text('')
            (path / '.runtime/public-client/current').mkdir(parents=True)
            (path / '.runtime/public-client/current/index.html').write_text('')
        return path

    def install(self, *arguments, stub=True):
        env = dict(os.environ, SYSTEMCTL=str(self.stub)) if stub else dict(os.environ)
        return subprocess.run(['bash', str(INSTALLER), '--root', str(self.root), '--studio-root', str(self.studio),
                               '--python', sys.executable, '--node', sys.executable, '--unit-dir', str(self.units), *arguments],
                              env=env, capture_output=True, text=True)

    def calls(self):
        return self.log.read_text().splitlines() if self.log.exists() else []

    def test_dry_run_reports_everything_and_changes_nothing(self):
        result = self.install('--dry-run', stub=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('DRY RUN', result.stdout)
        for unit in UNITS:
            self.assertIn(f'{unit}: new', result.stdout)
            self.assertIn(f'would run: systemctl enable {unit}', result.stdout)
        self.assertIn('would run: systemctl daemon-reload', result.stdout)
        self.assertIn(f'ExecStart={sys.executable} {self.root.resolve()}/scripts/dev.py database-serve', result.stdout)
        self.assertFalse(self.units.exists())

    def test_install_renders_configured_paths_and_is_idempotent(self):
        first = self.install()
        self.assertEqual(first.returncode, 0, first.stderr)
        database = (self.units / 'sidereal-database.service').read_text()
        studio = (self.units / 'sidereal-studio.service').read_text()
        self.assertIn(f'WorkingDirectory={self.root.resolve()}\n', database)
        self.assertIn(f'WorkingDirectory={self.studio.resolve()}\n', studio)
        self.assertIn(f'ExecStart={sys.executable} {self.studio.resolve()}/scripts/dev.py dashboard-serve', studio)
        self.assertIn(f'Environment=PATH={Path(sys.executable).parent}:', database)
        for unit in UNITS:
            text = (self.units / unit).read_text()
            self.assertNotRegex(text, r'@[A-Z_]+@')
            for setting in ('Type=notify', 'KillMode=mixed', 'Restart=on-failure', 'RestartPreventExitStatus=3',
                            'Environment=SIDEREAL_SUPERVISOR_UNIT=%n', 'WantedBy=multi-user.target'):
                self.assertIn(setting + '\n', text, (unit, setting))
        self.assertIn('TimeoutStopSec=90\n', database)
        self.assertEqual(self.calls().count('daemon-reload'), 1)
        self.assertEqual([call for call in self.calls() if call.startswith('enable')], [f'enable {unit}' for unit in UNITS])
        self.assertFalse(any(call.startswith(('start', 'restart', 'stop')) for call in self.calls()), 'installing starts nothing')

        before = len(self.calls())
        second = self.install()
        self.assertEqual(second.returncode, 0, second.stderr)
        self.assertEqual(second.stdout.count(': unchanged'), 3)
        self.assertEqual(second.stdout.count('already enabled'), 3)
        self.assertNotIn('daemon-reload', self.calls()[before:])
        self.assertNotIn('enable', ' '.join(call for call in self.calls()[before:] if not call.startswith('is-enabled')))

    def test_refuses_roots_that_are_not_ready_to_serve(self):
        old = self.checkout(Path(self.folder.name) / 'old')
        (old / 'scripts/dev.py').write_text('# before the supervised serve mode\n')
        result = subprocess.run(['bash', str(INSTALLER), '--dry-run', '--root', str(self.root), '--studio-root', str(old),
                                 '--python', sys.executable, '--node', sys.executable, '--unit-dir', str(self.units)],
                                capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('predates the supervised serve mode', result.stderr)
        # The studio checkout has no live data: it must never become the database root.
        result = subprocess.run(['bash', str(INSTALLER), '--dry-run', '--root', str(self.studio),
                                 '--python', sys.executable, '--node', sys.executable, '--unit-dir', str(self.units)],
                                capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('live database directory is missing', result.stderr)
        (self.root / 'dev.toml').write_text((self.root / 'dev.toml').read_text().replace('sidereal-studio.service', 'other.service'))
        result = self.install('--dry-run', stub=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('[systemd] does not map', result.stderr)

    def test_uninstall_disables_and_removes(self):
        self.assertEqual(self.install().returncode, 0)
        result = self.install('--uninstall')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(list(self.units.iterdir()), [])
        for unit in UNITS:
            self.assertIn(f'disable --now {unit}', self.calls())
        self.assertEqual(self.calls()[-1], 'daemon-reload')


if __name__ == '__main__':
    unittest.main()
