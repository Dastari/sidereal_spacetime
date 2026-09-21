"""v1.0.0: Fill genuine Keycloak PKCE form with the retained review credential.

Open the desired game/Studio sign-in page in a Playwright CLI session first.
CLI echoes submitted code, so its output is captured and discarded, not logged.
"""
import argparse
import json
import os
import tempfile
from pathlib import Path
import stat
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--session', required=True)
    parser.add_argument('--return-url', required=True)
    args = parser.parse_args()
    credential = Path.home() / '.local/share/sidereal-review/account.json'
    if stat.S_IMODE(credential.stat().st_mode) != 0o600:
        raise RuntimeError('Review credential must have mode0600')
    account = json.loads(credential.read_text())
    if account.get('username') != 'sidereal-development-review' or account.get('managedBy') != 'sidereal-development-review-v1':
        raise RuntimeError('Unexpected review identity')
    code = '''async page => {
      if (!page.url().startsWith('https://auth.dastari.net/realms/dastari/')) throw Error('Expected genuine Dastari sign-in page');
      await page.getByRole('textbox',{name:'Username or email'}).fill(%s);
      await page.getByLabel('Password',{exact:true}).fill(%s);
      await page.getByRole('button',{name:'Sign In',exact:true}).click();
      await page.waitForURL(%s,{timeout:30000});
      return {reviewSignInReturned:true};
    }''' % (json.dumps(account['username']), json.dumps(account['password']), json.dumps(args.return_url))
    fd, filename = tempfile.mkstemp(prefix='sidereal-review-signin-', suffix='.js')
    try:
        with os.fdopen(fd, 'w') as stream:
            stream.write(code)
        result = subprocess.run(['bash', str(ROOT / '.agents/skills/playwright/scripts/playwright_cli.sh'),
                                 '-s=' + args.session, 'run-code', '--filename', filename],
                                capture_output=True, text=True)
    finally:
        Path(filename).unlink(missing_ok=True)
    completed = result.returncode == 0 and '"reviewSignInReturned":true' in result.stdout
    print('Review PKCE callback completed.' if completed else 'Review sign-in did not complete; inspect the browser page without exposing credentials.')
    return 0 if completed else 1


if __name__ == '__main__':
    raise SystemExit(main())
