"""Item material slot tables (themes). A theme only changes slot values, never geometry.

Colours are linear RGB. Emissive slots are (rgb, strength). PBR per slot: roughness, metallic.
Character themes map onto these via CHARACTER_SLOT_LINK (suit_primary -> primary ...), so a crew
role/player colour can drive its gear without new meshes.
"""
from .voxel import ITEM_SLOTS

SLOT_PBR = {
    "primary": (0.46, 0.05), "secondary": (0.42, 0.15), "accent": (0.38, 0.05), "trim": (0.40, 0.25),
    "metal": (0.30, 0.85), "dark": (0.70, 0.0), "grip": (0.85, 0.0), "emit_a": (0.3, 0.0), "emit_b": (0.3, 0.0),
    "glass": (0.05, 0.0),
}

THEMES = {
    # Reference WEAPONS & TOOLS default: pale lilac shells, navy/black recesses, red accents, cyan glow.
    # VERIFY palette: lavender-grey structure (#c8bcd8/#a78db6), charcoal navy (#343652/#16182a),
    # one crimson accent (#d42d4f), cyan emissive (#3fb8ff). trim = mid lavender, not a 2nd accent.
    "orion": dict(primary=(0.52, 0.40, 0.72), secondary=(0.034, 0.037, 0.084), accent=(0.66, 0.026, 0.078),
                  trim=(0.32, 0.26, 0.40), metal=(0.30, 0.28, 0.38), dark=(0.008, 0.009, 0.023),
                  grip=(0.03, 0.03, 0.065), emit_a=((0.05, 0.48, 1.0), 1.4), emit_b=((1.0, 0.07, 0.10), 1.4),
                  glass=(0.35, 0.72, 1.0)),
    # Engineer / repair tools: amber shells, charcoal, yellow accents.
    "engineer": dict(primary=(0.90, 0.46, 0.025), secondary=(0.05, 0.06, 0.12), accent=(0.95, 0.72, 0.04),
                     trim=(0.62, 0.60, 0.66), metal=(0.34, 0.34, 0.38), dark=(0.008, 0.008, 0.012),
                     grip=(0.04, 0.045, 0.09), emit_a=((0.10, 0.75, 1.0), 1.4), emit_b=((1.0, 0.45, 0.06), 1.4),
                     glass=(0.40, 0.80, 1.0)),
    # Security: navy / royal blue / white trim.
    "security": dict(primary=(0.07, 0.12, 0.40), secondary=(0.02, 0.022, 0.05), accent=(0.10, 0.40, 1.0),
                     trim=(0.60, 0.60, 0.66), metal=(0.30, 0.32, 0.38), dark=(0.006, 0.006, 0.012),
                     grip=(0.03, 0.03, 0.05), emit_a=((0.15, 0.55, 1.0), 1.4), emit_b=((1.0, 0.12, 0.10), 1.4),
                     glass=(0.30, 0.60, 1.0)),
    # Medic: white shells, red crosses, green heal glow.
    "medic": dict(primary=(0.82, 0.80, 0.86), secondary=(0.10, 0.10, 0.16), accent=(0.75, 0.02, 0.04),
                  trim=(0.75, 0.02, 0.04), metal=(0.40, 0.40, 0.45), dark=(0.01, 0.01, 0.02),
                  grip=(0.05, 0.05, 0.09), emit_a=((0.15, 1.0, 0.45), 1.4), emit_b=((1.0, 0.15, 0.30), 1.4),
                  glass=(0.55, 1.0, 0.75)),
    # Salvage: rust orange, oil black, worn steel, hazard yellow.
    "salvage": dict(primary=(0.50, 0.20, 0.05), secondary=(0.10, 0.08, 0.07), accent=(0.95, 0.62, 0.03),
                    trim=(0.85, 0.40, 0.03), metal=(0.36, 0.33, 0.30), dark=(0.012, 0.010, 0.008),
                    grip=(0.06, 0.05, 0.045), emit_a=((1.0, 0.55, 0.08), 1.4), emit_b=((1.0, 0.30, 0.04), 1.4),
                    glass=(1.0, 0.65, 0.25)),
    # Recon: olive drab, black, green optics.
    "recon": dict(primary=(0.16, 0.22, 0.09), secondary=(0.03, 0.04, 0.03), accent=(0.34, 0.36, 0.26),
                  trim=(0.20, 0.20, 0.18), metal=(0.26, 0.27, 0.26), dark=(0.006, 0.008, 0.006),
                  grip=(0.035, 0.04, 0.03), emit_a=((0.20, 1.0, 0.25), 1.4), emit_b=((0.55, 1.0, 0.15), 1.4),
                  glass=(0.30, 1.0, 0.40)),
}

VARIANT_ORDER = ["orion", "engineer", "security", "medic", "salvage", "recon"]

CHARACTER_SLOT_LINK = {"primary": "suit_primary", "secondary": "suit_secondary", "accent": "accent",
                       "metal": "metal", "dark": "dark", "emit_a": "emit", "glass": "glass"}


def slot_value(theme, slot, overrides=None):
    if overrides and slot in overrides:
        return overrides[slot]
    return THEMES[theme][slot]


def theme_json():
    out = {}
    for name, th in THEMES.items():
        slots = {}
        for s in ITEM_SLOTS:
            v = th[s]
            rough, metal = SLOT_PBR[s]
            if s.startswith("emit"):
                slots[s] = {"color": list(v[0]), "emissive": list(v[0]), "emissiveStrength": v[1], "roughness": rough, "metallic": metal}
            elif s == "glass":
                slots[s] = {"color": list(v), "emissive": list(v), "emissiveStrength": 0.3, "roughness": rough, "metallic": metal, "alpha": 0.55}
            else:
                slots[s] = {"color": list(v), "roughness": rough, "metallic": metal}
        out[name] = slots
    return out
