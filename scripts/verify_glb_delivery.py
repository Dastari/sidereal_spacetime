"""Read-only wire-byte proof against the exact current immutable client tree."""
import argparse
import gzip
import hashlib
import json
from pathlib import Path
import time
import urllib.request
import urllib.error

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--origin', default='https://sidereal.dastari.net')
    parser.add_argument('--expect-gzip', action='store_true')
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        raise SystemExit('Preserve existing delivery evidence; choose a new output')
    home = ROOT / '.runtime/public-client'
    record = json.loads((home / 'release.json').read_text())
    folder = Path(record['release'])
    results = []
    def get(path, headers):
        request = urllib.request.Request(args.origin + path, headers=headers)
        start = time.monotonic()
        try:
            response = urllib.request.urlopen(request, timeout=60)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            return response.status, dict(response.headers), response.read(), time.monotonic() - start
    for path in ['/assets/crew/components/modular-crew.glb', '/assets/assembly/parts.glb']:
        expected = (folder / path.lstrip('/')).read_bytes()
        digest = hashlib.sha256(expected).hexdigest()
        item = {'path': path, 'decodedSha256': digest, 'decodedBytes': len(expected)}
        for label, encoding in [('identity', 'identity'), ('gzip', 'gzip')]:
            status, headers, body, duration = get(path, {'Accept-Encoding': encoding})
            headers = {k.lower(): v for k, v in headers.items()}
            coded = headers.get('content-encoding')
            decoded = gzip.decompress(body) if coded == 'gzip' else body
            assert status == 200 and hashlib.sha256(decoded).hexdigest() == digest
            assert headers.get('content-type') == 'model/gltf-binary'
            assert coded is None if label == 'identity' else (coded == 'gzip' if args.expect_gzip else coded is None)
            item[label] = {'wireBytes': len(body), 'encoding': coded, 'secondsLocalNetwork': duration, 'headers': headers}
            if args.expect_gzip:
                assert headers.get('vary') == 'Accept-Encoding'
                unchanged = get(path, {'Accept-Encoding': encoding, 'If-None-Match': headers['etag']})
                assert unchanged[0] == 304 and unchanged[2] == b''
        if args.expect_gzip:
            partial = get(path, {'Accept-Encoding': 'gzip', 'Range': 'bytes=0-15', 'If-Range': item['identity']['headers']['etag']})
            assert partial[0] == 206 and partial[2] == expected[:16]
            disabled = get(path, {'Accept-Encoding': 'gzip;q=0'})
            assert disabled[0] == 200 and disabled[2] == expected
            item['conditionalAndRangePass'] = True
        results.append(item)
    assert json.loads((home / 'release.json').read_text()) == record, 'Concurrent public release changed during proof'
    report = {'client': record, 'delivery': json.loads((home / 'delivery.json').read_text()) if (home / 'delivery.json').exists() else None,
        'origin': args.origin, 'assets': results, 'expectGzip': args.expect_gzip}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open('x') as stream:
        json.dump(report, stream, indent=2)
    print(json.dumps({'client': record['sha256'], 'assets': [{k: row[k] for k in ['path', 'decodedSha256', 'decodedBytes']} | {'identityWire': row['identity']['wireBytes'], 'gzipWire': row['gzip']['wireBytes']} for row in results], 'evidence': str(args.output)}, indent=2))


if __name__ == '__main__':
    main()
