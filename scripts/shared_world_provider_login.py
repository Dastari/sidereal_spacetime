"""Ordinary real-provider authorization-code/PKCE acceptance helper, no GPU.
No password grant is enabled or used for game clients. Tokens stay in0600 files.
"""
import argparse
import base64
import hashlib
import http.cookiejar
import json
import os
from pathlib import Path
import secrets
import urllib.error
import urllib.parse
import urllib.request
from html.parser import HTMLParser

ISSUER = 'https://auth.dastari.net/realms/dastari'
CALLBACK = 'https://sidereal.tail7a58a6.ts.net:8444/auth/callback'
CLIENT = 'sidereal-game'

class LoginForm(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.action = None
        self.inside = False
        self.fields = {}
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'form' and attrs.get('id') == 'kc-form-login':
            self.action = attrs.get('action')
            self.inside = True
        if self.inside and tag == 'input' and attrs.get('name') and attrs.get('type') == 'hidden':
            self.fields[attrs['name']] = attrs.get('value', '')
    def handle_endtag(self, tag):
        if tag == 'form': self.inside = False

class CaptureCallback(urllib.request.HTTPRedirectHandler):
    def __init__(self): self.callback_url = None
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        parsed = urllib.parse.urlsplit(newurl)
        expected = urllib.parse.urlsplit(CALLBACK)
        if (parsed.scheme, parsed.netloc, parsed.path) == (expected.scheme, expected.netloc, expected.path):
            self.callback_url = newurl
            return None
        if parsed.scheme != 'https' or parsed.hostname != 'auth.dastari.net':
            raise RuntimeError('Unexpected provider redirect destination')
        return super().redirect_request(req, fp, code, msg, headers, newurl)

def private_json(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd = os.open(path, os.O_CREAT | os.O_TRUNC | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
    os.fchmod(fd, 0o600)
    with os.fdopen(fd, 'w') as stream: json.dump(data, stream)
    path.chmod(0o600)

def login(credentials, token_file):
    account = json.loads(Path(credentials).read_text())
    verifier = secrets.token_urlsafe(48)
    state, nonce = secrets.token_urlsafe(24), secrets.token_urlsafe(24)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip('=')
    redirect = CaptureCallback()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()), redirect)
    url = ISSUER + '/protocol/openid-connect/auth?' + urllib.parse.urlencode({
        'client_id': CLIENT, 'redirect_uri': CALLBACK, 'response_type': 'code',
        'scope': 'openid profile email', 'state': state, 'nonce': nonce,
        'code_challenge': challenge, 'code_challenge_method': 'S256', 'prompt': 'login',
    })
    with opener.open(url, timeout=20) as response:
        form = LoginForm(); form.feed(response.read().decode())
    if not form.action: raise RuntimeError('Expected ordinary provider login form')
    action = urllib.parse.urlsplit(form.action)
    if action.scheme != 'https' or action.hostname != 'auth.dastari.net':
        raise RuntimeError('Unexpected credential form destination')
    fields = {**form.fields, 'username': account['username'], 'password': account['password'], 'credentialId': ''}
    try:
        with opener.open(urllib.request.Request(form.action, data=urllib.parse.urlencode(fields).encode()), timeout=20) as response:
            response.read()
    except urllib.error.HTTPError as error:
        if error.code not in [301, 302, 303] or not redirect.callback_url:
            raise RuntimeError('Provider sign-in rejected or requires browser action') from None
    if not redirect.callback_url: raise RuntimeError('Provider requires additional interactive action')
    result = urllib.parse.parse_qs(urllib.parse.urlsplit(redirect.callback_url).query)
    if result.get('state') != [state] or len(result.get('code', [])) != 1:
        raise RuntimeError('Provider callback state/code rejected')
    with opener.open(urllib.request.Request(ISSUER + '/protocol/openid-connect/token', data=urllib.parse.urlencode({
        'grant_type': 'authorization_code', 'client_id': CLIENT, 'redirect_uri': CALLBACK,
        'code_verifier': verifier, 'code': result['code'][0],
    }).encode()), timeout=20) as response:
        tokens = json.load(response)
    # Only the real SpacetimeDB host verifies issuer/JWKS and admits these tokens.
    # The helper never fabricates claims or accepts a client-parsed identity.
    if not tokens.get('id_token') or not tokens.get('refresh_token'):
        raise RuntimeError('Provider token response incomplete')
    private_json(token_file, tokens)
    return {'authorizationCodePkce': True, 'tokenFile': str(token_file), 'mode': '0600'}

def logout(token_file):
    path = Path(token_file)
    if not path.exists(): return {'sessionClosed': False, 'tokenFileRemoved': True}
    tokens = json.loads(path.read_text())
    with urllib.request.urlopen(urllib.request.Request(ISSUER + '/protocol/openid-connect/logout', data=urllib.parse.urlencode({
        'client_id': CLIENT, 'refresh_token': tokens['refresh_token'],
    }).encode()), timeout=20) as response:
        assert response.status in [200, 204]
    path.unlink()
    return {'sessionClosed': True, 'tokenFileRemoved': True}

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['login', 'logout'])
    parser.add_argument('--credentials')
    parser.add_argument('--token-file', required=True)
    args = parser.parse_args()
    try:
        result = login(args.credentials, args.token_file) if args.action == 'login' else logout(args.token_file)
        print(json.dumps(result))
    except (urllib.error.HTTPError, urllib.error.URLError):
        raise SystemExit('Provider request failed; sensitive response and URLs suppressed')
