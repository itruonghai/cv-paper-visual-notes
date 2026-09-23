import base64
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "skills/cv-paper-visual-notes/scripts"))
from build_notebook import build, embed_images


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
        for filename in ("notebook.html", "notes.md", "sources.json"):
            self.assertFalse((self.root / filename).exists())


if __name__ == "__main__":
    unittest.main()
