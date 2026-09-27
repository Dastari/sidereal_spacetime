"""Meaningful ledger invariants, using an isolated temporary library."""
import argparse
import contextlib
import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import sys

from PIL import Image

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import art_catalog as c


class LedgerTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name);self.lib=self.root/"assets/art-library"
        for key,value in [("ROOT",self.root),("LIB",self.lib)]:
            p=patch.object(c,key,value);p.start();self.addCleanup(p.stop)
        self.key="test.ui";self.ref="test--button";self.path=c.design_path(self.key)
        self.d={"id":self.key,"asset_uuid":"test-only","profile":"ui","mapping_status":"Test fixture only","priority":1,"reference_ids":[self.ref],"current_revision":0,"state":"reference-only","owner_final_signoff":None,"feedback":[],"approvals":[],"revisions":[{"revision":0,"created_at":"test","stage":"reference-only","change":"Fixture","hypothesis":None,"covered_reference_ids":[],"evidence":[],"review":None}]}
        c.write(self.path,self.d)
        self.source=self.root/"reference/art/test.png";self.source.parent.mkdir(parents=True)
        Image.new("RGB",(8,8),(19,47,82)).save(self.source)
        crop=self.lib/f"assets/{self.ref}/revisions/r000/reference.png";crop.parent.mkdir(parents=True)
        Image.open(self.source).crop((0,0,4,4)).save(crop)
        meta={"id":self.ref,"source":"test.png","source_sha256":c.digest(self.source),"source_dimensions_px":[8,8],"box":[0,0,4,4],"crop_revision":0,"crop_path":str(crop.relative_to(self.lib)),"crop_sha256":c.digest(crop),"design_id":self.key}
        c.write(self.lib/f"assets/{self.ref}/reference.json",meta)
        (self.lib/f"assets/{self.ref}/BRIEF.md").write_text("Reference revision: **r000**\n![Exact reference crop](revisions/r000/reference.png)\n")
        ref={"id":self.ref,"name":"Button","source":"test.png","category":"ui","kind":"object","style":"interface","design_id":self.key,"crop_path":meta["crop_path"],"brief":f"assets/{self.ref}/BRIEF.md"}
        c.write(self.lib/"catalog.json",{"source_count":1,"reference_count":1,"design_count":1,"references":[ref]})
        c.write(self.lib/"sources.json",[{"path":"reference/art/test.png","filename":"test.png","duplicate_of":None,"sha256":c.digest(self.source),"width":8,"height":8,"notes":"test"}])
        # Source audit copy is generated independently; its fixed source count is
        # irrelevant to the isolated state-machine behavior under test.
        c.refresh()

    def command(self,command,**kw):
        defaults={"command":command,"design":self.key,"revision":1,"agent":"test","covers":[self.ref],"change":"Test improvement","hypothesis":"Test hypothesis","notes":"Test evidence","context":"Isolated synthetic test fixture; never production evidence"}
        with contextlib.redirect_stdout(io.StringIO()):c.mutate(argparse.Namespace(**(defaults|kw)))

    def add_ready_evidence(self):
        for role in ["native-source","ui-desktop","ui-small","validation"]:
            p=self.root/(role+".txt");p.write_text("SYNTHETIC TEST DATA")
            self.command("evidence",role=role,file=str(p))

    def test_missing_evidence_cannot_be_approved(self):
        self.command("start")
        with self.assertRaisesRegex(ValueError,"Missing evidence"):
            self.command("review",outcome="pass")
        self.assertIsNone(c.read(self.path)["owner_final_signoff"])

    def test_append_preserves_prior_inspection_and_rejects_changed_source(self):
        prior=c.read(self.lib/"sources.json")[0] | {"id":"S01","inspected":True,"inspection_method":"Prior independent review","coverage_status":"Detailed crops pending"}
        c.write(self.lib/"sources.json",[prior])
        with patch.object(c,"SOURCE_NOTES",{}):
            self.assertEqual(c.initial_sources(),[prior])
            Image.new("RGB",(8,8),(99,10,21)).save(self.source)
            with self.assertRaisesRegex(ValueError,"visual inspection"):c.initial_sources()

    def test_new_annotations_do_not_reuse_preserved_source_ids(self):
        prior=c.read(self.lib/"sources.json")[0] | {"id":"S01","inspected":True}
        c.write(self.lib/"sources.json",[prior])
        Image.new("RGB",(8,8),(81,31,11)).save(self.source.with_name("aaa.png"))
        with patch.object(c,"SOURCE_NOTES",{"aaa.png":"Inspected annotation"}):
            sources=c.initial_sources()
        self.assertEqual(next(s for s in sources if s['filename']=='test.png'),prior)
        self.assertEqual(len({s['id'] for s in sources}),2)

    def test_stale_work_and_overwrites_are_rejected(self):
        self.command("start");p=self.root/"source.svg";p.write_text("test")
        self.command("evidence",role="native-source",file=str(p))
        with self.assertRaisesRegex(ValueError,"immutable"):self.command("evidence",role="native-source",file=str(p))
        with self.assertRaisesRegex(ValueError,"Stale"):self.command("feedback",revision=0,author="agent",text="x",message_reference=None)

    def test_approval_does_not_carry_to_new_revision(self):
        self.command("start");self.add_ready_evidence();self.command("review",outcome="pass")
        self.command("signoff",owner_quote="SYNTHETIC TEST APPROVAL",message_reference="test fixture")
        approved=c.read(self.path)["approvals"][0]
        with self.assertRaisesRegex(ValueError,"immutable"):self.command("block")
        self.command("start")
        d=c.read(self.path);self.assertEqual(d["current_revision"],2);self.assertEqual(d["approvals"][0],approved)
        self.assertEqual(c.state_summary()["owner_signed_off"],0)

    def test_explicit_art_only_approval_preserves_missing_technical_evidence(self):
        self.command("start")
        source=self.root/"source.svg";source.write_text("SYNTHETIC NATIVE ART")
        self.command("evidence",role="native-source",file=str(source))
        self.command("signoff",owner_quote="SYNTHETIC EXPLICIT ART APPROVAL",message_reference="test fixture",art_only=True,technical_notes="Actual desktop/small runtime captures and validation are still missing.")
        d=c.read(self.path);r=d["revisions"][1]
        self.assertEqual(d["state"],"signed-off")
        self.assertIsNone(r["review"])
        self.assertIn("Missing evidence roles: ui-desktop, ui-small, validation",d["owner_final_signoff"]["technical_pending"]["readiness_gaps"])
        with contextlib.redirect_stdout(io.StringIO()):c.check()
        (self.lib/r["evidence"][0]["path"]).write_text("CHANGED AFTER APPROVAL")
        with self.assertRaisesRegex(ValueError,"Evidence changed"):c.check()

    def test_owner_feedback_reopens_without_erasing_signed_history(self):
        self.command("start");self.add_ready_evidence();self.command("review",outcome="pass")
        self.command("signoff",owner_quote="SYNTHETIC TEST APPROVAL",message_reference="test fixture")
        before=c.read(self.path)["revisions"][1]
        self.command("feedback",author="owner",text="SYNTHETIC TEST CHANGE",message_reference="test fixture")
        d=c.read(self.path);self.assertIsNone(d["owner_final_signoff"]);self.assertEqual(d["revisions"][1],before)
        self.assertEqual(len(d["approvals"]),1)

    def test_transparency_is_pixel_based(self):
        for name,mode,alpha,expected in [("rgb","RGB",None,False),("opaque","RGBA",255,False),("empty","RGBA",0,False),("cutout","RGBA",0,True)]:
            im=Image.new(mode,(8,8),(20,50,100) if alpha is None else (20,50,100,alpha))
            if expected:im.putpixel((4,4),(20,50,100,255))
            p=self.root/(name+".png");im.save(p);self.assertEqual(c.png_alpha(p),expected,name)

    def test_crop_correction_keeps_exact_history_and_stale_guard(self):
        original=c.read(self.lib/f"assets/{self.ref}/reference.json")
        args=argparse.Namespace(reference=self.ref,expected_revision=0,box=[2,2,7,7],reason="Test crop correction",defer_index=False)
        with contextlib.redirect_stdout(io.StringIO()):c.revise_crop(args);c.check(deep=True)
        current=c.read(self.lib/f"assets/{self.ref}/reference.json")
        self.assertEqual(c.digest(self.lib/original["crop_path"]),original["crop_sha256"])
        self.assertEqual(current["reference_history"][0]["box"],original["box"])
        with self.assertRaisesRegex(ValueError,"Stale"):c.revise_crop(args)

    def test_split_preserves_reference_id_and_unique_membership(self):
        with contextlib.redirect_stdout(io.StringIO()):c.split_design(argparse.Namespace(design=self.key,new_design="test.specific",references=[self.ref],reason="Test explicit canonical split"));c.check()
        self.assertEqual(c.read(self.path)["reference_ids"],[])
        self.assertEqual(c.read(c.design_path("test.specific"))["reference_ids"],[self.ref])
        self.assertEqual(c.read(self.lib/f"assets/{self.ref}/reference.json")["design_id"],"test.specific")


if __name__=="__main__":unittest.main()
