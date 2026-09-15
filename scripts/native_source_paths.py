"""Resolve preserved native source pins without depending on an author's checkout."""
from pathlib import Path

LEGACY_ROOT = '/root/sidereal_spacetime/'


def checkout_source_path(path, root):
    # Keep signed provenance records unchanged; translate only at the file boundary.
    relative = Path(str(path).removeprefix(LEGACY_ROOT))
    if relative.is_absolute() or '..' in relative.parts:
        raise ValueError('Native source pin is outside the checkout')
    root = Path(root).resolve()
    resolved = (root / relative).resolve()
    if not resolved.is_relative_to(root):
        raise ValueError('Native source pin escapes the checkout')
    return resolved
