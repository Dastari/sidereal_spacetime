#!/usr/bin/env python3
"""Local art reference inventory and append-only design review workflow.

Read assets/art-library/WORKFLOW.md. This tool never publishes game content.
"""
from pathlib import Path
from collections import Counter, defaultdict
from contextlib import contextmanager
import argparse
import datetime
import fcntl
import hashlib
import json
import os
import re
import shutil
import struct
import sys
import tempfile
import uuid
import zlib

from art_library.annotations import ITEMS, SOURCE_NOTES
from art_library.profiles import proposal, design_family, style

ROOT = Path(__file__).resolve().parents[1]
LIB = ROOT / "assets/art-library"
SCHEMA = "sidereal.art-library.v1"
INITIAL_DATE = "2026-09-08"


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


_ARCHIVED = None


def archived():
    """Reference/review media moved out of git (assets/art-library/ARCHIVED.json): relative path -> record."""
    global _ARCHIVED
    if _ARCHIVED is None:
        path = LIB / "ARCHIVED.json"
        _ARCHIVED = json.loads(path.read_text()) if path.exists() else {"files": {}}
    return _ARCHIVED


def present(path, sha256):
    """True when `path` exists with `sha256`, or it was archived out of git with that exact hash.
    If the archive is mounted locally (ARCHIVED.json archive_root), the archived copy is verified too."""
    if path.exists():
        return digest(path) == sha256
    try:
        rel = str(path.resolve().relative_to(LIB.resolve()))
    except ValueError:
        return False
    record = archived()["files"].get(rel)
    if not record or record["sha256"] != sha256:
        return False
    copy = Path(os.environ.get("SIDEREAL_ART_ARCHIVE", archived().get("archive_root", ""))) / "sidereal_spacetime/assets/art-library" / rel
    return digest(copy) == sha256 if copy.is_file() else True


def valid_revision_history(design):
    """Reference extraction starts at r000; new native companions may begin at r001.

    The latter requires explicit provenance rather than fabricating a missing r000.
    Interior gaps and deleted reference history remain invalid.
    """
    start = design.get("first_recorded_revision", 0)
    if type(start) is not int or start not in (0, 1):
        return False
    if start == 1 and (design.get("reference_ids") or not design.get("history_note")):
        return False
    return bool(design["revisions"]) and [r["revision"] for r in design["revisions"]] == list(range(start, design["current_revision"] + 1))


def revision_record(design, number):
    return next(r for r in design["revisions"] if r["revision"] == number)


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def read(path):
    return json.loads(path.read_text())


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    text=json.dumps(value,indent=2,ensure_ascii=False)+"\n"
    if path.exists() and path.read_text()==text:return
    with tempfile.NamedTemporaryFile(mode="w",dir=path.parent,delete=False) as f:
        f.write(text);tmp=Path(f.name)
    os.replace(tmp,path)


@contextmanager
def locked():
    lock=ROOT/".runtime/art-library.lock";lock.parent.mkdir(parents=True,exist_ok=True)
    with lock.open("w") as f:
        fcntl.flock(f,fcntl.LOCK_EX)
        yield


def within(path, base=None):
    base=base or LIB
    path=path.resolve()
    if not path.is_relative_to(base.resolve()):raise ValueError("Path must stay inside the art library")
    return path


def design_path(key):
    if not re.fullmatch(r"[a-z0-9][a-z0-9.-]*",key):raise ValueError("Invalid design ID")
    return LIB/"designs"/key/"design.json"


def initial_sources():
    from PIL import Image
    files=sorted(p for p in (ROOT/"reference/art").rglob("*") if p.is_file())
    registered={s['filename']:s for s in read(LIB/'sources.json')} if (LIB/'sources.json').exists() else {}
    reserved={s['id'] for name,s in registered.items() if name not in SOURCE_NOTES and 'id' in s}
    used=set();next_id=max([int(s['id'][1:]) for s in registered.values() if re.fullmatch(r'S\d+',s.get('id',''))]+[0])+1
    seen={};sources=[]
    for i,p in enumerate(files):
        with Image.open(p) as im:width,height=im.size
        sha=digest(p);same=seen.get(sha)
        # Prefer the correctly labeled source as the duplicate's canonical source.
        if p.name=="asteroids-and-mining.png":same="modular-components-computers.png"
        if p.name=="modular-components-computers.png":same=None
        seen[sha]=p.name
        canonical=same or p.name
        if canonical not in SOURCE_NOTES:
            prior=registered.get(p.name)
            if prior and prior.get('inspected') and prior['sha256']==sha:
                # Other focused queues may have inspected a source while leaving
                # detailed crops pending. Preserve their actual audit unchanged.
                sources.append(prior)
                used.add(prior['id'])
                continue
            raise ValueError(f"New source requires visual inspection/annotation: {p}")
        source_id=registered.get(p.name,{}).get('id',f'S{i+1:02}')
        if source_id in used or source_id in reserved:
            while f'S{next_id:02}' in used or f'S{next_id:02}' in reserved:next_id+=1
            source_id=f'S{next_id:02}';next_id+=1
        used.add(source_id)
        sources.append(dict(id=source_id,path=str(p.relative_to(ROOT)),filename=p.name,
                            sha256=sha,width=width,height=height,duplicate_of=same,
                            inspected=True,inspection_method="Opened individually with view_image; manual visual annotation",
                            inspected_at=INITIAL_DATE,notes=SOURCE_NOTES[canonical],
                            coverage_status="annotated-initial-pass; crop/contact-sheet review remains explicit"))
    return sources


def extract(append=False):
    from PIL import Image,ImageDraw,ImageFont
    sources=initial_sources();by_name={s["filename"]:s for s in sources}
    write(LIB/"sources.json",sources)
    families=defaultdict(list);index=[]
    for i,a in enumerate(ITEMS):
        src=by_name[a["source"]];x1,y1,x2,y2=a["box"]
        if not (0<=x1<x2<=src["width"] and 0<=y1<y2<=src["height"]):raise ValueError(f"Invalid crop: {a['id']} {a['box']}")
        directory=LIB/"assets"/a["id"];reference=directory/"revisions/r000/reference.png"
        reference.parent.mkdir(parents=True,exist_ok=True)
        with Image.open(ROOT/src["path"]) as im:
            crop=im.crop(a["box"])
            if reference.exists():
                with Image.open(reference) as old:
                    if old.mode!=crop.mode or old.size!=crop.size or old.tobytes()!=crop.tobytes():
                        raise ValueError(f"Immutable crop differs: {a['id']}. Add a new reference revision; never replace r000.")
            else:crop.save(reference)
        p=proposal(a);family=design_family(a)
        record={**a,"schema":SCHEMA,"reference_uuid":str(uuid.uuid5(uuid.NAMESPACE_URL,"sidereal.reference:"+a["id"])),
                "source_sha256":src["sha256"],"source_dimensions_px":[src["width"],src["height"]],
                "crop_revision":0,"crop_sha256":digest(reference),"crop_path":str(reference.relative_to(LIB)),
                "style":style(a),"design_id":family,"proposal":p,
                "reconstruction_status":"tracked-in-design-ledger","crop_review":"initial-manual-annotation; not owner-approved",
                "provenance":"Owner-supplied local concept reference; original authorship/license not established. Retain as local reference, not a runtime texture.",
                "identification_confidence":"medium" if not a["observation"] else "see observation",
                "unseen_geometry":"Back, underside, occluded interfaces and exact depth are inferred and require design review."}
        recfile=directory/"reference.json"
        if recfile.exists():
            existing=read(recfile)
            for key in ["id","source","source_sha256","reference_uuid"]:
                if existing[key]!=record[key]:raise ValueError(f"Reference identity changed: {a['id']} / {key}")
            # Re-running discovery must preserve reviewed briefs and corrected crops.
            record=existing
            family=record["design_id"]
        write(recfile,record);families[family].append(record)
        index.append({"id":a["id"],"name":a["name"],"source":a["source"],"category":a["category"],"profile":p["profile"],"kind":a["kind"],"style":style(a),"design_id":family,"crop_path":record["crop_path"],"brief":f"assets/{a['id']}/BRIEF.md","reference_uuid":record["reference_uuid"]})
        brief=f"""# {a['name']}

Reference ID: `{a['id']}`  
Stable reference UUID: `{record['reference_uuid']}`  
Design queue: [{family}](../../designs/{family}/DESIGN.md)  
Reference revision: **r000**. Final asset sign-off is tracked against exact design revisions and explicit covered reference IDs; see the linked design ledger.

![Exact reference crop](revisions/r000/reference.png)

Source: [{a['source']}](../../../../reference/art/{a['source']}) · Original pixel rectangle `{a['box']}` (left, top, right-exclusive, bottom-exclusive). SHA-256: `{src['sha256']}`.

## Identification and design

{a['name']} is cataloged as **{a['category']} / {a['kind']}**, with the **{record['style']}** appearance. {a['observation'] or 'The isolated reference rectangle preserves the visible subject and any adjacent labels/background. Read the original when resolving silhouette or interfaces.'}

{p['role']}

Use the shared [style and pipeline contract](../../STYLE_AND_PIPELINE.md) and [iteration workflow](../../WORKFLOW.md). {record['unseen_geometry']}

## Scale and gameplay proposal — unapproved

- Dimensions: `{p['dimensions_m']}` metres, **Blender X width / Y length-depth / Z height**; null means screen/effect space.
- Dry mass: `{p['dry_mass_kg']}` kg; health: `{p['health_hp']}` HP. Null means not independently applicable or must compile from child definitions.
- Origin: {p['origin']}. Approach/maintenance clearance: `{p['interaction_clearance_m']}` m.
- Proposed sockets: {', '.join('`'+s+'`' for s in p['sockets']) or 'None; define only if the final asset needs attachment.'}
- Scale basis: {p['scale_basis']}
- Confidence: {p['confidence']}.

```json
{json.dumps(p['proposed_stats'],indent=2)}
```

{p['balance_basis']} These are category-based starting briefs, **not individually measured specifications**. Before modeling this appearance, revise dimensions/ports/stats against its actual silhouette, existing definitions and selected variant. Transparent glass, vertical travel, teleport/cloak/warp effects and economy remain their own implementation gates.

## Recreation sequence

"""+"\n".join(f"{j+1}. {step}" for j,step in enumerate(p['blender_steps']))+"""

## Iteration evidence

The exact source crop above exists. A reconstructed cutout, editable Blender source, GLB, Blender render and actual in-game screenshots are **not implied** by this reference record. Consult the design ledger for saved artifacts, failures, current revision, feedback and explicit owner approval. Do not relabel a concept image as a Blender render or runtime screenshot.
"""
        if not (directory/"BRIEF.md").exists():(directory/"BRIEF.md").write_text(brief)
    write(LIB/"catalog.json",{"schema":SCHEMA,"created":INITIAL_DATE,"source_count":len(sources),"reference_count":len(index),"design_count":len(families),"references":index})
    for family,refs in families.items():
        path=design_path(family)
        if not path.exists():
            write(path,{"schema":SCHEMA,"id":family,"asset_uuid":str(uuid.uuid5(uuid.NAMESPACE_URL,"sidereal.art-design:"+family)),
                        "reference_ids":[r["id"] for r in refs],"mapping_status":"proposed shared production family; inspect and split distinct geometry before implementation",
                        "current_revision":0,"state":"reference-only","owner_final_signoff":None,
                        "priority":10 if family.startswith("pale-studless.wall") or family.startswith("pale-studless.floor") else 20 if any(x in family for x in ["door","bed","console","engine"]) else 50,
                        "profile":refs[0]["proposal"]["profile"],"assigned_to":None,"blocker":None,
                        "feedback":[],"approvals":[],"revisions":[{"revision":0,"created_at":INITIAL_DATE,"stage":"reference-only","change":"Reference inventory and provisional scale/gameplay brief","hypothesis":None,"covered_reference_ids":[],"evidence":[],"review":None}]})
        else:
            d=read(path)
            new_ids=[r["id"] for r in refs]
            if d["reference_ids"]!=new_ids:
                if not append or not set(d["reference_ids"])<=set(new_ids):raise ValueError("Design reference membership changed; use --append for strictly additive inventory: "+family)
                added=[key for key in new_ids if key not in d["reference_ids"]]
                d["reference_ids"]=new_ids
                d.setdefault("inventory_history",[]).append({"at":now(),"added_reference_ids":added,"reason":"Additional visually identified source items; existing approvals retain their exact original coverage"})
                write(path,d)
    contacts()
    refresh()
    print(f"Extracted {len(index)} reference crops from {len(sources)} sources into {len(families)} proposed design queues.")


def contacts():
    from PIL import Image,ImageDraw,ImageFont
    index=read(LIB/"catalog.json")["references"]
    by_name={s["filename"]:s for s in read(LIB/"sources.json")}
    # Per-source contact sheets keep every current crop visible and numbered.
    font=ImageFont.load_default(size=13)
    grouped=defaultdict(list)
    for r in index:grouped[r["source"]].append(r)
    for filename,refs in grouped.items():
        s=by_name[filename];out=LIB/"sources"/filename[:-4];out.mkdir(parents=True,exist_ok=True)
        page_count=(len(refs)+47)//48;links=[]
        for page in range(page_count):
            batch=refs[page*48:(page+1)*48];sheet=Image.new("RGB",(1200,((len(batch)+5)//6)*174),(23,31,45));draw=ImageDraw.Draw(sheet)
            for j,r in enumerate(batch):
                x=(j%6)*200;y=(j//6)*174
                with Image.open(LIB/r["crop_path"]) as im:
                    im=im.convert("RGB");im.thumbnail((190,139));sheet.paste(im,(x+(200-im.width)//2,y+(141-im.height)//2))
                label=f"{page*48+j+1:03} {r['name']}"
                draw.text((x+5,y+143),label[:28],font=font,fill=(236,240,248))
                if len(label)>28:draw.text((x+5,y+158),label[28:56],font=font,fill=(183,200,222))
            name=f"contact-{page+1:02}.jpg";sheet.save(out/name,quality=88);links.append(name)
        # Overlay uses numbers corresponding to the detailed source table.
        with Image.open(ROOT/s["path"]) as im:
            im=im.convert("RGB");draw=ImageDraw.Draw(im)
            for j,r in enumerate(refs):
                box=read(LIB/"assets"/r["id"]/"reference.json")["box"]
                draw.rectangle(box,outline=(255,194,69),width=2)
                x,y=box[:2];draw.rectangle((x,y,x+31,y+17),fill=(10,18,33));draw.text((x+2,y+1),f"{j+1:03}",font=font,fill=(255,229,156))
            im.save(out/"annotated.jpg",quality=90)
        lines=[f"# {filename}","",s["notes"],"",f"Source SHA-256: `{s['sha256']}`. Visually inspected {INITIAL_DATE}. Rectangles are an initial extraction pass; dense/occluded crops require review.","", "[Annotated source](annotated.jpg)",""]
        lines.extend(f"![Contact sheet {j+1}]({link})" for j,link in enumerate(links))
        lines.extend(["","| No. | Reference | Kind | Design |","| --- | --- | --- | --- |"])
        lines.extend(f"| {j+1:03} | [{r['name']}](../../{r['brief']}) | {r['kind']} | [{r['design_id']}](../../designs/{r['design_id']}/DESIGN.md) |" for j,r in enumerate(refs))
        (out/"SOURCE.md").write_text("\n".join(lines)+"\n")


def load_designs():
    designs = [read(p) for p in sorted((LIB/"designs").glob("*/design.json"))]
    # Concurrent specialist draft ledgers may use state/notes/artifacts. Render
    # those explicitly unfinished records without rewriting their source or
    # inventing reference coverage, review, or approval evidence.
    for design in designs:
        for revision in design["revisions"]:
            if "stage" not in revision and revision.get("state") == "in-progress":
                revision.setdefault("stage", "in-progress")
                revision.setdefault("change", revision.get("notes", "Specialist draft in progress."))
                revision.setdefault("hypothesis", "")
                revision.setdefault("review", None)
                revision.setdefault("evidence", revision.get("artifacts", []))
                revision.setdefault("covered_reference_ids", [])
    return designs


def state_summary():
    ds=load_designs();catalog=read(LIB/"catalog.json")
    def has(d,role):return any(e["role"]==role for e in d["revisions"][-1]["evidence"])
    return dict(reference_count=catalog["reference_count"],source_count=catalog["source_count"],design_count=len(ds),
                stages=dict(Counter(d["state"] for d in ds)),owner_signed_off=sum(d["owner_final_signoff"] is not None and d["owner_final_signoff"]["revision"]==d["current_revision"] for d in ds),
                current_cutout_designs=sum(has(d,"cutout") for d in ds),
                current_blender_designs=sum(has(d,"blender-source") for d in ds),
                current_runtime_pairs=sum(has(d,"runtime-close") and has(d,"runtime-top") for d in ds),
                references_with_current_cutout=sum(len(d["revisions"][-1]["covered_reference_ids"]) for d in ds if has(d,"cutout")),
                references_with_current_owner_signoff=sum(len(d["owner_final_signoff"]["covered_reference_ids"]) for d in ds if d["owner_final_signoff"] and d["owner_final_signoff"]["revision"]==d["current_revision"]),
                evidence_count=sum(len(r["evidence"]) for d in ds for r in d["revisions"]))


def refresh():
    catalog=read(LIB/"catalog.json");refs={r["id"]:r for r in catalog["references"]};ds=load_designs()
    for d in ds:
        folder=design_path(d["id"]).parent
        lines=[f"# {d['id']}","",f"Stable asset UUID: `{d['asset_uuid']}`", "",f"Current design revision: **r{d['current_revision']:03}**. State: **{d['state']}**. Owner final sign-off for current revision: **{'YES' if d['owner_final_signoff'] and d['owner_final_signoff']['revision']==d['current_revision'] else 'NO'}**.","",d["mapping_status"],"", "[Canonical machine-readable ledger](design.json) · [Agent workflow](../../WORKFLOW.md)","", "## Revision history",""]
        lines[2:2]=["**Replacement model direction:** author Blender meshes and materials; TypeScript voxel-solid art is being phased out. Preserve authored visual surfaces and keep required gameplay proxies separate. Read [the migration contract](../../../../docs/blender_asset_migration.md) and [workflow](../../WORKFLOW.md).", ""]
        for r in d["revisions"]:
            lines.extend([f"### r{r['revision']:03} — {r['stage']}","",r["change"],"",f"Hypothesis: {r['hypothesis'] or 'No reconstruction yet.'}","",f"Review: {json.dumps(r['review'],ensure_ascii=False) if r['review'] else 'No completed review.'}",""])
            for e in r["evidence"]:lines.append(f"- [{e['role']}]({Path(e['path']).relative_to(folder.relative_to(LIB))}) — {e['sha256']}; {e.get('notes','')}")
            if not r["evidence"]:lines.append("No reconstruction, Blender or runtime evidence saved for this revision.")
            lines.append("")
        lines.extend(["## Feedback and approvals","", "```json",json.dumps({"feedback":d["feedback"],"approvals":d["approvals"],"owner_final_signoff":d["owner_final_signoff"]},indent=2,ensure_ascii=False),"```","","## Source appearances and candidate variants","", "Keep every crop. Similar function does not prove identical geometry; split this family into separate designs when needed. Each approval must state exactly which reference IDs/variants it covers. Historical/baseline appearances can remain comparison-only and do not need reproduction as current target art.","","| Reference | Kind | Brief |","| --- | --- | --- |"])
        for key in d["reference_ids"]:
            a=refs[key];lines.append(f"| [{a['name']}](../../{a['crop_path']}) | {a['kind']} | [Scale, stats, recreation](../../{a['brief']}) |")
        (folder/"DESIGN.md").write_text("\n".join(lines)+"\n")
    stats=state_summary();write(LIB/"status.json",stats)
    lines=["# Sidereal living art library", "", "Start here for asset work and progress reviews. Read [WORKFLOW.md](WORKFLOW.md) before changing a design. The JSON ledgers are authoritative; regenerate this index after every edit with `python3 scripts/art_catalog.py index`.","","**Reference and review media are not in git.** Exact reference crops, boards, renders, comparison sheets and revision screenshots moved out on 2026-09-26: web-sized copies with each design's ledger text are in the Sidereal wiki (https://wiki.sidereal.dastari.net/Art/Library), exact originals are in `/root/sidereal-art-archive/` (verify with `sha256sum -c MANIFEST.sha256`), and [ARCHIVED.json](ARCHIVED.json) lists every moved file and hash. Put new review media there, not in git; keep model sources, textures and runtime inputs here.","",f"**{stats['source_count']} source files visually inspected; {stats['reference_count']} exact reference crops; {stats['design_count']} proposed shared design queues; {stats['owner_signed_off']} current revisions signed off by the owner.**", "", "[Browse visual library](index.html) · [Source audit](SOURCE_AUDIT.md) · [Style, scale and pipeline](STYLE_AND_PIPELINE.md) · [Current status](status.json) · [Individual character components](character-components/INDEX.md)","", "## Honest current scope", "", "Every registered source was opened individually. Cataloged references have initial manually authored rectangles, contact sheets and item briefs. Sources added during cargo work are explicitly marked as pending detailed crop annotation in the source audit. Dense crops may retain adjacent/occluded pieces and need visual refinement. Reference crops are not reconstructed cutouts. Shared design queues are provisional; variant compatibility and individual silhouettes must be resolved before implementation. Production cutouts, Blender assets and actual runtime evidence exist only where listed in the revision ledger. Nothing is implicitly final or published.", "", "## Resume prompt", "", "> Read assets/art-library/INDEX.md and WORKFLOW.md. Inspect status.json and the current design ledger. Work through unsigned assets in priority order, preserving every revision and crop. Resolve a specific reference/variant, implement the next feedback-driven improvement, validate and capture Blender and actual in-game evidence. Update the ledger, feedback and this index after each iteration. Request owner feedback when evidence is ready; never infer approval or loop indefinitely without new evidence. Continue other unblocked unsigned designs while waiting.","", "## Design queues", "", "| Priority | Design | References | Revision | State | Owner final sign-off |", "| --- | --- | --- | --- | --- | --- |"]
    lines[2:2]=["**Owner model direction:** TypeScript voxel-solid art is being phased out in favor of Blender-authored models, meshes and materials. Preserve authored surfaces in the visual export; any required occupancy/collision/damage representation is separate. Read [Blender model migration](../../docs/blender_asset_migration.md).", "", "[Redesign current equipment — agent prompt](prompts/REDESIGN_CURRENT_EQUIPMENT.md) · [Equipment inventory and work queue](CURRENT_EQUIPMENT.md) · [Cargo collection and size matrix](CARGO_COLLECTION.md) · [Mapped ship floor kit](shipyard-floor/README.md)", "", f"Saved current reconstruction evidence: **{stats['current_cutout_designs']} design cutouts, {stats['current_blender_designs']} Blender sources and {stats['current_runtime_pairs']} runtime view pairs**, covering {stats['references_with_current_cutout']} source appearances. Other reference entries still require reconstruction. Saved evidence does not imply owner acceptance.", ""]
    for d in sorted(ds,key=lambda d:(d["priority"],d["id"])):
        approved=d["owner_final_signoff"] and d["owner_final_signoff"]["revision"]==d["current_revision"]
        lines.append(f"| {d['priority']} | [{d['id']}](designs/{d['id']}/DESIGN.md) | {len(d['reference_ids'])} | r{d['current_revision']:03} | {d['state']} | {'YES — see exact coverage' if approved else 'NO'} |")
    lines.extend(["", "## Every extracted reference", "", "The following list includes objects, separately visible components, variants, animation poses, UI controls and scene/context examples. Each has a separate image and brief. Repeated illustrative stars, anonymous tiny debris specks, decorative grid lines and text glyphs are represented by their effect/background/UI design, not treated as new gameplay items.","", "| Reference | Source | Category | Design |", "| --- | --- | --- | --- |"])
    lines.extend(f"| [{r['name']}]({r['brief']}) | {r['source']} | {r['category']} | [{r['design_id']}](designs/{r['design_id']}/DESIGN.md) |" for r in catalog["references"])
    (LIB/"INDEX.md").write_text("\n".join(lines)+"\n")
    audit=["# Source inspection and extraction audit","", "All 33 supplied source files were opened with `view_image`. There are 32 byte-distinct images. The misleading asteroid filename is the same construction sheet as modular-components-computers; alien-ship-2 depicts human raiders. Before/after images are evidence categories, not approval records.","","| Source | Size | Duplicate of | Crops | Notes |","| --- | --- | --- | --- | --- |"]
    for s in read(LIB/"sources.json"):
        canonical=s["duplicate_of"] or s["filename"];count=sum(r["source"]==canonical for r in catalog["references"])
        audit.append(f"| [{s['filename']}](sources/{canonical[:-4]}/SOURCE.md) | {s['width']} × {s['height']} | {s['duplicate_of'] or '—'} | {count} | {s['notes']} |")
    audit.extend(["","## Coverage limits to preserve during review","","A rectangle proves an extraction, not correct segmentation or production readiness. The dense sheets contain small labels and overlapping exploded pieces; audit the numbered overlays and contact sheets before using an individual crop as a modeling target. Correcting a crop must create a new reference revision and retain r000. Back faces, hidden furniture and blurred background objects are unknown; reconstruction assumptions belong in the revision notes. Families may contain incompatible source designs and should be split explicitly when comparison reveals this.","","The original source design claims 1 m construction units, 4-voxel-tall characters and various inconsistent ship stats. Those claims are preserved as source context. The active 2 m tile, metric simulation, fixed RPG elevation, material preservation and authority contracts govern production."])
    (LIB/"SOURCE_AUDIT.md").write_text("\n".join(audit)+"\n")
    from art_library.gallery import render_gallery
    render_gallery(LIB,catalog,ds,stats)


def png_alpha(path):
    """Verify 8-bit non-interlaced RGBA/gray-alpha pixels, not just the header.

    A painted checkerboard, fully opaque alpha and fully empty image all fail.
    Uses stdlib so ledger operations do not depend on the art virtualenv.
    """
    raw=path.read_bytes()
    if len(raw)<33 or raw[:8]!=b"\x89PNG\r\n\x1a\n":return False
    w,h,depth,color,compression,filtering,interlace=struct.unpack(">IIBBBBB",raw[16:29])
    if depth!=8 or color not in (4,6) or compression or filtering or interlace or not 0<w<=8192 or not 0<h<=8192:return False
    bpp=4 if color==6 else 2;stride=w*bpp;compressed=[];offset=8
    try:
        while offset+12<=len(raw):
            size=struct.unpack(">I",raw[offset:offset+4])[0];kind=raw[offset+4:offset+8]
            if kind==b"IDAT":compressed.append(raw[offset+8:offset+8+size])
            offset+=size+12
        stream=zlib.decompress(b"".join(compressed))
        if len(stream)!=(stride+1)*h:return False
        previous=bytearray(stride);transparent=False;visible=False
        for y in range(h):
            start=y*(stride+1);kind=stream[start];row=bytearray(stream[start+1:start+stride+1])
            if kind>4:return False
            for x in range(stride):
                left=row[x-bpp] if x>=bpp else 0;above=previous[x];corner=previous[x-bpp] if x>=bpp else 0
                if kind==1:predict=left
                elif kind==2:predict=above
                elif kind==3:predict=(left+above)//2
                elif kind==4:
                    p=left+above-corner;dist=[abs(p-left),abs(p-above),abs(p-corner)]
                    predict=[left,above,corner][dist.index(min(dist))]
                else:predict=0
                row[x]=(row[x]+predict)&255
            alpha=row[bpp-1::bpp];transparent|=min(alpha)<255;visible|=max(alpha)>0
            if transparent and visible:return True
            previous=row
    except (ValueError,zlib.error,struct.error):return False
    return False


def split_design(args):
    catalog=read(LIB/"catalog.json");oldpath=design_path(args.design);old=read(oldpath)
    path=design_path(args.new_design)
    if path.exists():raise ValueError("Destination design already exists")
    selected=set(args.references)
    if not selected or not selected<=set(old["reference_ids"]):raise ValueError("References must belong to the source family")
    if any(selected & set(r["covered_reference_ids"]) for r in old["revisions"]):
        raise ValueError("These references have design history; retain that history and make an explicit reviewed migration")
    ordered=[key for key in old["reference_ids"] if key in selected]
    entry={"at":now(),"from":old["id"],"to":args.new_design,"reference_ids":ordered,"reason":args.reason}
    new={**old,"id":args.new_design,"asset_uuid":str(uuid.uuid5(uuid.NAMESPACE_URL,"sidereal.art-design:"+args.new_design)),
         "reference_ids":ordered,"derived_from":entry,"mapping_status":"Explicit canonical target selected from a production family. "+args.reason,
         "current_revision":0,"state":"reference-only","owner_final_signoff":None,"assigned_to":None,"blocker":None,"feedback":[],"approvals":[],
         "revisions":[{"revision":0,"created_at":now(),"stage":"reference-only","change":args.reason,"hypothesis":None,"covered_reference_ids":[],"evidence":[],"review":None}]}
    new.pop("inventory_history",None);old["reference_ids"]=[key for key in old["reference_ids"] if key not in selected]
    old.setdefault("inventory_history",[]).append(entry)
    for a in catalog["references"]:
        if a["id"] not in selected:continue
        a["design_id"]=args.new_design;meta_path=LIB/"assets"/a["id"]/"reference.json";meta=read(meta_path)
        meta.setdefault("design_mapping_history",[]).append(entry);meta["design_id"]=args.new_design;write(meta_path,meta)
        brief=LIB/a["brief"];brief.write_text(brief.read_text().replace(f"[{old['id']}](../../designs/{old['id']}/DESIGN.md)",f"[{args.new_design}](../../designs/{args.new_design}/DESIGN.md)"))
    write(path,new);write(oldpath,old);catalog["design_count"]=len(load_designs());write(LIB/"catalog.json",catalog);refresh()
    print(f"Created {args.new_design}; retained mapping history in {old['id']}")


def revise_crop(args):
    from PIL import Image
    catalog=read(LIB/"catalog.json")
    match=next((a for a in catalog["references"] if a["id"]==args.reference),None)
    if not match:raise ValueError("Unknown reference")
    directory=within(LIB/"assets"/args.reference);path=directory/"reference.json";meta=read(path)
    if args.expected_revision!=meta["crop_revision"]:raise ValueError("Stale crop revision")
    source=ROOT/"reference/art"/meta["source"]
    if digest(source)!=meta["source_sha256"]:raise ValueError("Source pixels changed")
    x1,y1,x2,y2=args.box;w,h=meta["source_dimensions_px"]
    if not (0<=x1<x2<=w and 0<=y1<y2<=h):raise ValueError("Invalid crop rectangle")
    rev=meta["crop_revision"]+1;target=directory/"revisions"/f"r{rev:03}"/"reference.png"
    if target.exists():raise ValueError("Reference revision already exists")
    target.parent.mkdir(parents=True,exist_ok=True)
    with Image.open(source) as im:im.crop(args.box).save(target)
    meta.setdefault("reference_history",[]).append({k:meta[k] for k in ["crop_revision","crop_path","crop_sha256","box"]})
    meta.update(crop_revision=rev,crop_path=str(target.relative_to(LIB)),crop_sha256=digest(target),box=args.box,
                crop_review="Agent corrected visible-object framing; not owner-approved",crop_correction_reason=args.reason)
    write(path,meta);match["crop_path"]=meta["crop_path"];write(LIB/"catalog.json",catalog)
    brief=directory/"BRIEF.md";text=brief.read_text()
    text=re.sub(r"Reference revision: \*\*r\d+\*\*",f"Reference revision: **r{rev:03}**",text)
    text=re.sub(r"!\[Exact reference crop\]\(revisions/r\d+/reference.png\)",f"![Exact reference crop](revisions/r{rev:03}/reference.png)",text)
    text+=f"\n## Reference crop correction r{rev:03}\n\n{args.reason} Current rectangle: `{args.box}`. Earlier source crop revisions remain preserved; this is still an exact source-pixel extraction.\n"
    brief.write_text(text)
    if not args.defer_index:refresh()
    print(f"Corrected {args.reference}: reference r{rev:03}")


def required_roles(d):
    if d["profile"]=="ui":return {"native-source","ui-desktop","ui-small","validation"}
    if d["profile"]=="inventory-icon":return {"native-source","cutout","ui-desktop","validation"}
    if d["profile"]=="vfx":return {"native-source","cutout","runtime-close","runtime-top","validation"}
    if d["profile"]=="animation":return {"blender-source","blender-close","runtime-close","runtime-top","validation"}
    return {"blender-source","glb","cutout","blender-close","runtime-close","runtime-top","validation"}


def ready(d,r):
    errors=[];roles={e["role"] for e in r["evidence"]}
    if missing:=required_roles(d)-roles:errors.append("Missing evidence roles: "+", ".join(sorted(missing)))
    if not r["covered_reference_ids"]:errors.append("No explicit reference/variant coverage")
    if not r["review"] or r["review"].get("outcome")!="pass":errors.append("Agent review has not passed")
    for e in r["evidence"]:
        p=within(LIB/e["path"])
        if not present(p,e["sha256"]):errors.append("Missing/changed evidence: "+e["path"])
        elif e["role"]=="cutout" and p.exists() and not png_alpha(p):errors.append("Cutout lacks an alpha channel: "+e["path"])
        if e["role"].startswith("runtime") or e["role"].startswith("ui-"):
            if not e.get("capture_context"):errors.append("Runtime/UI evidence lacks capture context")
    return errors


def check(deep=False):
    errors=[];catalog=read(LIB/"catalog.json");sources=read(LIB/"sources.json");original_images={}
    expected={s["path"] for s in sources};actual={str(p.relative_to(ROOT)) for p in (ROOT/"reference/art").rglob("*") if p.is_file()}
    if expected!=actual:errors.append("Source inventory changed; inspect new/removed files")
    for s in sources:
        if not (ROOT/s["path"]).exists() or digest(ROOT/s["path"])!=s["sha256"]:errors.append("Source changed: "+s["path"])
    ids=set()
    for ref in catalog["references"]:
        if ref["id"] in ids:errors.append("Duplicate reference ID: "+ref["id"])
        ids.add(ref["id"]);meta=read(LIB/"assets"/ref["id"]/"reference.json");p=within(LIB/meta["crop_path"])
        if not present(p,meta["crop_sha256"]):errors.append("Crop changed: "+ref["id"])
        if not (LIB/ref["brief"]).exists():errors.append("Missing brief: "+ref["id"])
        history=meta.get("reference_history",[])
        for previous in history:
            prior=within(LIB/previous["crop_path"])
            if not present(prior,previous["crop_sha256"]):errors.append("Historical crop changed: "+str(prior))
        if ref["crop_path"]!=meta["crop_path"] or ref["design_id"]!=meta["design_id"]:errors.append("Catalog/reference pointer mismatch: "+ref["id"])
        if deep:
            from PIL import Image
            if meta["source"] not in original_images:
                with Image.open(ROOT/"reference/art"/meta["source"]) as im:original_images[meta["source"]]=im.copy()
            original=original_images[meta["source"]]
            for version in [*history,meta]:
                if not (LIB/version["crop_path"]).exists():continue  # archived out of git; hash verified above
                with Image.open(LIB/version["crop_path"]) as crop:
                    expected_crop=original.crop(version["box"])
                    if expected_crop.size!=crop.size or expected_crop.mode!=crop.mode or expected_crop.tobytes()!=crop.tobytes():errors.append("Crop pixels not exact: "+ref["id"])
    for im in original_images.values():im.close()
    membership=Counter(key for d in load_designs() for key in d["reference_ids"])
    if set(membership)!=ids or any(count!=1 for count in membership.values()):errors.append("Every reference must have exactly one current design mapping")
    for d in load_designs():
        if len(set(d["reference_ids"]))!=len(d["reference_ids"]) or not set(d["reference_ids"])<=ids:errors.append("Invalid design references: "+d["id"])
        if not valid_revision_history(d):errors.append("Non-contiguous history: "+d["id"])
        for r in d["revisions"]:
            if not set(r["covered_reference_ids"])<=set(d["reference_ids"]):errors.append("Invalid coverage: "+d["id"])
            for e in r["evidence"]:
                p=within(LIB/e["path"])
                if not present(p,e["sha256"]):errors.append("Evidence changed: "+e["path"])
        approval=d["owner_final_signoff"]
        for accepted in d["approvals"]:
            if accepted.get("scope")!="final-design-only; no runtime publication implied":continue
            revision=revision_record(d,accepted["revision"])
            if accepted["evidence_hashes"]!={e["path"]:e["sha256"] for e in revision["evidence"]}:errors.append("Historical approval artifact set changed: "+d["id"])
        if approval:
            revision=revision_record(d,approval["revision"])
            if not approval["owner_quote"] or not approval["message_reference"]:errors.append("Missing owner approval evidence: "+d["id"])
            if approval["covered_reference_ids"]!=revision["covered_reference_ids"]:errors.append("Approval coverage mismatch: "+d["id"])
            errors.extend(d["id"]+": "+e for e in ready(d,revision))
        if d["state"]=="signed-off" and (not approval or approval["revision"]!=d["current_revision"]):errors.append("False final status: "+d["id"])
    if read(LIB/"status.json")!=state_summary():errors.append("Stale generated index/status; run index")
    if errors:raise ValueError("\n".join(errors))
    print(f"Validated {len(sources)} source hashes, {len(ids)} crop hashes/briefs, {len(load_designs())} revision ledgers"+(" and every crop's exact pixels." if deep else "."))


def mutate(args):
    path=design_path(args.design);d=read(path)
    if args.command=="start":
        if d["state"]=="in-progress":raise ValueError("Finish/checkpoint current work before starting another revision")
        covered=args.covers or []
        if not covered or not set(covered)<=set(d["reference_ids"]):raise ValueError("Supply explicit --covers reference IDs from this design")
        revision=d["current_revision"]+1;folder=path.parent/"revisions"/f"r{revision:03}"
        folder.mkdir(parents=True,exist_ok=False)
        d["current_revision"]=revision;d["state"]="in-progress";d["assigned_to"]=args.agent;d["blocker"]=None
        d["revisions"].append(dict(revision=revision,created_at=now(),stage="in-progress",change=args.change,hypothesis=args.hypothesis,covered_reference_ids=covered,evidence=[],review=None))
    else:
        if args.revision!=d["current_revision"]:raise ValueError("Stale revision; re-read design.json")
        r=d["revisions"][-1]
        if args.command=="evidence":
            if r["revision"]==0 or r["stage"]=="signed-off":raise ValueError("Start a new working revision before adding evidence")
            src=Path(args.file).resolve()
            if not src.is_file():raise ValueError("Evidence file does not exist")
            name=args.role+src.suffix;destination=path.parent/"revisions"/f"r{r['revision']:03}"/name
            if destination.exists():raise ValueError("Evidence is immutable; use a new revision or a distinct role")
            if args.role=="cutout" and not png_alpha(src):raise ValueError("Cutout must be a real PNG with alpha, not a painted checkerboard")
            if (args.role.startswith("runtime") or args.role.startswith("ui-")) and not args.context:raise ValueError("Supply capture context: actual app/URL, camera, viewport, asset hash, commit, renderer")
            shutil.copy2(src,destination)
            r["evidence"].append(dict(role=args.role,path=str(destination.relative_to(LIB)),sha256=digest(destination),bytes=destination.stat().st_size,notes=args.notes or "",capture_context=args.context,recorded_at=now()))
            r["review"]=None
            r["stage"]="in-progress";d["state"]="in-progress"
        elif args.command=="feedback":
            if args.author=="owner" and not args.message_reference:raise ValueError("Owner feedback requires a real message reference")
            d["feedback"].append(dict(revision=r["revision"],author=args.author,text=args.text,message_reference=args.message_reference,recorded_at=now(),resolved_by_revision=None))
            if args.author=="owner":
                d["state"]="changes-requested"
                # Retain the old signed revision and approval history unchanged.
                # The new request withdraws current-final designation; next work
                # starts a new revision rather than mutating accepted artifacts.
                d["owner_final_signoff"]=None
                if r["stage"]!="signed-off":r["stage"]="changes-requested"
        elif args.command=="review":
            if r["stage"]=="signed-off":raise ValueError("Signed-off history is immutable; reopen by starting a new revision")
            r["review"]=dict(outcome=args.outcome,notes=args.notes,recorded_at=now())
            errors=ready(d,r)
            if args.outcome=="pass" and errors:raise ValueError("Cannot mark ready: "+"; ".join(errors))
            d["state"]="awaiting-owner" if args.outcome=="pass" else "changes-requested"
            r["stage"]=d["state"];d["assigned_to"]=None
        elif args.command=="signoff":
            if r["stage"]=="signed-off":raise ValueError("This revision already has final sign-off")
            errors=ready(d,r)
            if errors:raise ValueError("Cannot sign off: "+"; ".join(errors))
            if not args.owner_quote.strip() or not args.message_reference.strip():raise ValueError("Explicit owner quote and actual message reference required")
            evidence_hashes={e["path"]:e["sha256"] for e in r["evidence"]}
            approval=dict(revision=r["revision"],owner_quote=args.owner_quote,message_reference=args.message_reference,recorded_at=now(),covered_reference_ids=r["covered_reference_ids"],evidence_hashes=evidence_hashes,scope="final-design-only; no runtime publication implied")
            d["approvals"].append(approval);d["owner_final_signoff"]=approval;d["state"]="signed-off";r["stage"]="signed-off"
        elif args.command=="block":
            if r["stage"]=="signed-off":raise ValueError("Signed-off history is immutable; start a new revision")
            d["blocker"]=args.notes;d["state"]="blocked";r["stage"]="blocked";d["assigned_to"]=None
    write(path,d);refresh();print(f"{d['id']}: r{d['current_revision']:03}, {d['state']}")


def main():
    parser=argparse.ArgumentParser(description=__doc__);subs=parser.add_subparsers(dest="command",required=True)
    for name in ["index","status","contacts"]:subs.add_parser(name)
    p=subs.add_parser("extract");p.add_argument("--append",action="store_true")
    p=subs.add_parser("split");p.add_argument("design");p.add_argument("new_design");p.add_argument("--references",nargs="+",required=True);p.add_argument("--reason",required=True)
    p=subs.add_parser("revise-crop");p.add_argument("reference");p.add_argument("--expected-revision",type=int,required=True);p.add_argument("--box",type=int,nargs=4,required=True);p.add_argument("--reason",required=True);p.add_argument("--defer-index",action="store_true")
    p=subs.add_parser("check");p.add_argument("--deep",action="store_true")
    p=subs.add_parser("start");p.add_argument("design");p.add_argument("--change",required=True);p.add_argument("--hypothesis",required=True);p.add_argument("--covers",nargs="+",required=True);p.add_argument("--agent",default="agent")
    for name in ["evidence","feedback","review","signoff","block"]:
        p=subs.add_parser(name);p.add_argument("design");p.add_argument("--revision",type=int,required=True)
        if name=="evidence":
            p.add_argument("--role",required=True,choices=["concept","cutout","blender-source","native-source","glb","blender-close","blender-top","runtime-close","runtime-top","runtime-back","runtime-context","ui-desktop","ui-small","validation","comparison","animation","material-debug","voxel-data","specification","capture-record","build-log","recipe"]);p.add_argument("--file",required=True);p.add_argument("--notes");p.add_argument("--context")
        elif name=="feedback":
            p.add_argument("--author",choices=["owner","agent"],required=True);p.add_argument("--text",required=True);p.add_argument("--message-reference")
        elif name=="review":p.add_argument("--outcome",choices=["pass","fail"],required=True);p.add_argument("--notes",required=True)
        elif name=="signoff":p.add_argument("--owner-quote",required=True);p.add_argument("--message-reference",required=True)
        elif name=="block":p.add_argument("--notes",required=True)
    args=parser.parse_args()
    try:
        with locked():
            if args.command=="extract":extract(args.append)
            elif args.command=="revise-crop":revise_crop(args)
            elif args.command=="split":split_design(args)
            elif args.command=="index":refresh();print("Regenerated living index, design pages, status and visual browser.")
            elif args.command=="contacts":contacts();print("Regenerated contact sheets and annotated sources from current crops.")
            elif args.command=="status":print(json.dumps(state_summary(),indent=2))
            elif args.command=="check":check(args.deep)
            else:mutate(args)
    except (ValueError,FileNotFoundError) as e:
        parser.exit(1,str(e)+"\n")


if __name__=="__main__":main()
