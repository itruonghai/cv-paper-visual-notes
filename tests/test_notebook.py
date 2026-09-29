import base64
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "skills/cv-paper-visual-notes/scripts"))
from build_notebook import build, embed_images
from annotation_data import discussion_replies


class NotebookTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / "assets").mkdir()
        self.svg = b'<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><path d="M0 5L80 35" stroke="black" stroke-dasharray="3 2"/></svg>'
        (self.root / "assets/figure.svg").write_bytes(self.svg)

    def paper(self):
        return {
            "paper_id": "test-notebook", "title": "Test notebook", "version": "fixture",
            "summary": "A software fixture, not a paper explanation.", "math_mode": "warn",
            "sections": [
                {"id": "comparison", "title": "Comparison", "html": '<figure><img src="assets/figure.svg" alt="x > y"><figcaption>Test source. <a href="https://example.org/paper">Source</a></figcaption></figure>'},
                {"id": "limitations", "title": "Limitations", "html": "<p>Test fixture.</p>"}
            ]
        }

    def test_quoted_operator_and_svg_strokes_survive_embedding(self):
        result = embed_images('<img alt="x > y" src="assets/figure.svg">', self.root)
        self.assertIn('alt="x &gt; y"', result)
        self.assertIn(base64.b64encode(self.svg).decode(), result)

    def test_rebuild_preserves_notes_and_source_annotations(self):
        source = self.root / "paper.json"
        source.write_text(json.dumps(self.paper()))
        notes = b"# My notes\nPreserve these words exactly.\n"
        (self.root / "notes.md").write_bytes(notes)
        sources = {"figures": [{"file": "assets/figure.svg", "custom": "Keep my attribution"}]}
        (self.root / "sources.json").write_text(json.dumps(sources))
        result = build(source, strict=True)
        self.assertEqual(result["warnings"], [])
        self.assertEqual((self.root / "notes.md").read_bytes(), notes)
        self.assertEqual(json.loads((self.root / "sources.json").read_text()), sources)

    def test_strict_lint_failure_does_not_create_output_files(self):
        data = self.paper()
        data["sections"] = [{"id": "intro", "title": "Intro", "html": r"<p>$\frac{a}{b}$</p>"}]
        source = self.root / "paper.json"
        source.write_text(json.dumps(data))
        with self.assertRaisesRegex(ValueError, "lint failed"):
            build(source, strict=True)
        for filename in ("notebook.html", "notes.md", "sources.json", "annotations.json"):
            self.assertFalse((self.root / filename).exists())

    def test_rebuild_preserves_capture_bytes_and_embeds_linked_reply(self):
        source = self.root / "paper.json"
        source.write_text(json.dumps(self.paper()))
        capture = {"id": "ann-test", "kind": "text", "section_id": "limitations", "section_title": "Limitations",
                   "content_revision": "previous", "comment": "Why? <script>alert(1)</script>",
                   "created_at": "2026-09-28", "updated_at": "2026-09-28", "status": "open", "tags": ["question"],
                   "target": {"exact": "Test fixture.", "prefix": "", "suffix": ""},
                   "source": {"kind": "notebook-prose", "ref": "notebook.html#limitations"}, "custom": {"keep": True}}
        data = {"schema_version": 1, "paper_id": "test-notebook", "version": "fixture", "annotations": [capture]}
        original = (json.dumps(data, indent=4) + "\n\n").encode()
        (self.root / "annotations.json").write_bytes(original)
        (self.root / "discussion.md").write_text("<!-- annotation: ann-test -->\n## 2026-09-28\nReply with evidence.\n")
        build(source)
        self.assertEqual((self.root / "annotations.json").read_bytes(), original)
        html = (self.root / "notebook.html").read_text()
        self.assertNotIn('<script>alert(1)</script>', html)
        self.assertIn('"ann-test": ["## 2026-09-28', html)
        self.assertEqual(json.loads((self.root / "annotations.json").read_text())["annotations"][0]["status"], "open")

    def test_unsupported_capture_schema_stops_without_output(self):
        source = self.root / "paper.json"
        source.write_text(json.dumps(self.paper()))
        original = '{"schema_version": 99, "annotations": ["preserve"]}'
        (self.root / "annotations.json").write_text(original)
        with self.assertRaisesRegex(ValueError, "Unsupported"):
            build(source)
        self.assertEqual((self.root / "annotations.json").read_text(), original)
        for name in ("notes.md", "sources.json", "notebook.html"):
            self.assertFalse((self.root / name).exists())

    def test_generated_figure_id_survives_inserting_a_different_figure(self):
        from notebook_html import NotebookHTML
        fragment = self.paper()["sections"][0]["html"]
        original = NotebookHTML(self.root, math_mode="warn", section_id="comparison")
        original.finish(fragment)
        (self.root / "assets/other.svg").write_bytes(self.svg)
        updated = NotebookHTML(self.root, math_mode="warn", section_id="comparison")
        updated.finish(fragment.replace("figure.svg", "other.svg") + fragment)
        self.assertTrue(original.figure_ids.issubset(updated.figure_ids))

    def test_repeated_figure_without_unique_ids_is_rejected(self):
        from notebook_html import NotebookHTML
        fragment = self.paper()["sections"][0]["html"]
        with self.assertRaisesRegex(ValueError, "unique"):
            NotebookHTML(self.root).finish(fragment + fragment)

    def test_multiple_dated_replies_are_associated_without_html_execution(self):
        text = "Old discussion.\n<!-- annotation: ann-one -->\n## Monday\nFirst\n<!-- annotation: ann-two -->\nSecond\n<!-- annotation: ann-one -->\nThird"
        self.assertEqual(discussion_replies(text), {"ann-one": ["## Monday\nFirst", "Third"], "ann-two": ["Second"]})


if __name__ == "__main__":
    unittest.main()
