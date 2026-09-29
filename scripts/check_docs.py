"""Guard what the repository tracks. The Sidereal wiki is the source of truth for documentation.

- Markdown is allowed only where agents or tools load it (AGENTS.md, CLAUDE.md, README.md, the
  PIVOT.md root marker, agent skills, served dashboard help, hash-pinned art-library notes).
- Review media and logs stay out of git: screenshots, renders, captures and evidence belong on the
  wiki (web copies) and in /root/sidereal-art-archive (exact originals), or in output/ (ignored).
- Relative links in the kept root documents must resolve.
Runs in `npm run check` and CI. A file re-added from docs/migrated-to-wiki.json is reported with its wiki page.
"""
from pathlib import Path, PurePosixPath
import fnmatch
import json
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
errors = []

MARKDOWN_ALLOWED = (
    'AGENTS.md', 'CLAUDE.md', 'README.md', 'PIVOT.md',
    '.agents/skills/**', '.claude/skills/**',
    'docs/public/*.md',
    # Review notes pinned by SHA-256 in sibling evidence JSON (retiring with the framed Wayfarer).
    'assets/art-library/framed-wayfarer/armor-correction-review-20260914/*.md',
)
# Review media may not live beside code or documentation. Runtime assets, app public data, the art
# library's model sources and skills keep their own images.
MEDIA = ('*.png', '*.jpg', '*.jpeg', '*.webp', '*.gif', '*.mp4', '*.webm', '*.mov')
MEDIA_FORBIDDEN_UNDER = ('docs/', 'reference/', 'output/', 'ops/', 'scripts/', 'packages/', 'apps/client/src/',
                         'apps/dashboard/src/')
LOG_ALLOWED = (
    # Evidence logs pinned in framed-Wayfarer ledgers (retiring with the framed Wayfarer).
    'assets/art-library/framed-wayfarer/**',
)


def matches(path, patterns):
    return any(fnmatch.fnmatchcase(path, p) or (p.endswith('/**') and path.startswith(p[:-2])) for p in patterns)


def tracked():
    try:
        out = subprocess.run(['git', 'ls-files', '-z'], cwd=ROOT, capture_output=True, check=True).stdout
    except (OSError, subprocess.CalledProcessError):
        return None
    return [p for p in out.decode().split('\0') if p]


migrated_path = ROOT / 'docs/migrated-to-wiki.json'
MIGRATED = json.loads(migrated_path.read_text())['files'] if migrated_path.exists() else {}
files = tracked()
if files is not None:
    for path in files:
        name = PurePosixPath(path).name.lower()
        if name.endswith('.md') and not matches(path, MARKDOWN_ALLOWED):
            wiki = MIGRATED.get(path, {}).get('wiki')
            errors.append(f'{path}: Markdown documents belong on the wiki, not in the repo'
                          + (f' (this one lives at {wiki})' if wiki else ' (see .agents/skills/sidereal-wiki)'))
        if any(fnmatch.fnmatchcase(name, m) for m in MEDIA) and (path.startswith(MEDIA_FORBIDDEN_UNDER) or '/' not in path):
            errors.append(f'{path}: review media goes to the wiki/archive or output/, not git')
        if name.endswith('.log') and not matches(path, LOG_ALLOWED):
            errors.append(f'{path}: logs are not tracked (output/ or the progress folder)')

documents = [ROOT / 'README.md', ROOT / 'AGENTS.md', ROOT / 'PIVOT.md', *(ROOT / 'docs/public').glob('*.md')]
for path in documents:
    text = path.read_text()
    for target in re.findall(r'\]\(([^)]+)\)', text):
        if '://' in target or target.startswith(('#', 'mailto:')):
            continue
        if not (path.parent / target.split('#')[0]).exists():
            errors.append(f'{path.relative_to(ROOT)} missing {target}')
if errors:
    raise SystemExit('\n'.join(errors))
print(f'Checked {len(documents)} project documents and {len(files or [])} tracked paths (Markdown, media, logs).')
