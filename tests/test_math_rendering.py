import hashlib
import importlib.util
import json
from pathlib import Path
import re
import shutil
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "skills/cv-paper-visual-notes/scripts"))
from build_notebook import build
from math_rendering import MathRenderer, protect_math, VENDOR
from notebook_html import NotebookHTML


class MathParsingTests(unittest.TestCase):
    def test_code_attributes_currency_and_existing_mathml_are_not_equations(self):
        fragment = r'<p title="$attribute$">Costs $5 and $10. <code>$literal$</code><math><mtext>$existing$</mtext></math> For \(i<j\), use $x_i$.</p>'
        protected, slots, warnings = protect_math(fragment)
        self.assertEqual([s["tex"] for s in slots], ["i<j", "x_i"])
        self.assertEqual(warnings, [])
        for literal in ('title="$attribute$"', '$5 and $10', '<code>$literal$</code>', '<mtext>$existing$</mtext>'):
            self.assertIn(literal, protected)

    def test_markdown_code_is_excluded_and_tex_underscores_are_preserved(self):
        source = r'Inline `$literal$`, \(q_i^{\mathsf{T}}k_j\).' + '\n```latex\n\\(not rendered\\)\n```\n'
        protected, slots, warnings = protect_math(source, markdown=True)
        self.assertEqual([s["tex"] for s in slots], [r'q_i^{\mathsf{T}}k_j'])
        self.assertIn(r'\(not rendered\)', protected)
        self.assertEqual(warnings, [])

    def test_unclosed_explicit_delimiter_reports_a_problem(self):
        _, slots, warnings = protect_math(r'<p>Bad \(x_i</p>')
        self.assertFalse(slots)
        self.assertTrue(warnings)
        with self.assertRaisesRegex(ValueError, "Unclosed"):
            NotebookHTML(ROOT).finish(r'<p>Bad \(x_i</p>')

    def test_vendor_integrity_matches_recorded_file_hashes(self):
        info = json.loads((VENDOR / "provenance.json").read_text())
        for name, digest in info["files_sha256"].items():
            self.assertEqual(hashlib.sha256((VENDOR / name).read_bytes()).hexdigest(), digest, name)


@unittest.skipUnless(shutil.which("node"), "Node is needed for bundled KaTeX")
class MathRenderingTests(unittest.TestCase):
    def test_inline_and_display_math_render_before_html_parsing(self):
        parser = NotebookHTML(ROOT)
        output = parser.finish(r'<p>For \(i<j\), use \(x_i^{t+1}\).</p>\[\begin{aligned}y &= Wx+b\\p_i &= \frac{e^{z_i}}{\sum_j e^{z_j}}\end{aligned}\]')
        self.assertEqual(output.count('class="paper-math paper-math-inline"'), 2)
        self.assertEqual(output.count('class="paper-math paper-math-display"'), 1)
        self.assertIn('<msubsup>', output)
        self.assertIn('<mfrac>', output)
        self.assertIn('data-latex="i&lt;j"', output)
        self.assertEqual(parser.warnings, [])
        css = parser.math_renderer.css()
        self.assertIn('data:font/woff2;base64,', css)
        self.assertTrue(all(url.startswith('data:') for url in re.findall(r'url\(([^)]+)\)', css)))

    def test_paper_macros_resolve_and_invalid_commands_fail_visibly(self):
        renderer = MathRenderer(macros={r'\R': r'\mathbb{R}'})
        output = NotebookHTML(ROOT, math_renderer=renderer).finish(r'\(x\in\R^d\)')
        self.assertIn('data-latex=', output)
        for bad in [r'\(\undefinedcommand{x}\)', r'\(\href{https://example.org}{x}\)']:
            with self.assertRaisesRegex(ValueError, 'Cannot render equation'):
                NotebookHTML(ROOT).finish(bad)

    def test_renderer_failure_leaves_existing_notebook_and_reader_files_unchanged(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            paper = {'paper_id': 'test', 'title': 'Test', 'version': 'v1', 'summary': 'Test', 'mode': 'focused',
                     'sections': [{'id': 'method', 'title': 'Method', 'html': r'<p>\(\undefinedcommand{x}\)</p>'}]}
            source = root / 'paper.json'; source.write_text(json.dumps(paper))
            (root / 'notebook.html').write_bytes(b'Previous notebook')
            (root / 'notes.md').write_bytes(b'Exact reader words\r\n')
            with self.assertRaisesRegex(ValueError, 'Cannot render equation'): build(source)
            self.assertEqual((root / 'notebook.html').read_bytes(), b'Previous notebook')
            self.assertEqual((root / 'notes.md').read_bytes(), b'Exact reader words\r\n')
            self.assertFalse((root / 'annotations.json').exists())

    @unittest.skipUnless(importlib.util.find_spec('markdown_it'), 'Optional Markdown dependency unavailable')
    def test_markdown_renders_once_with_math_code_and_table_layout(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / 'paper.json'
            source.write_text(json.dumps({'paper_id': 'md-test', 'title': 'Markdown test', 'version': 'v1', 'summary': 'Test', 'mode': 'focused',
                'sections': [{'id': 'method', 'title': 'Method', 'markdown': '**Bold** with ' + r'\(q_i^{\mathsf{T}} k_j\)' + ' and `$literal$`.\n\n| Item | Meaning |\n| --- | --- |\n| A | B |'}]}))
            build(source, strict=True)
            output = (root / 'notebook.html').read_text()
            self.assertIn('<strong>Bold</strong>', output)
            self.assertIn('<code>$literal$</code>', output)
            self.assertIn('<div class="table-scroll"><table>', output)
            self.assertEqual(output.count('class="paper-math paper-math-inline"'), 1)
            self.assertNotIn('CVMATH', output)

    def test_profile_validation_rejects_unrecognized_values_without_writing(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); source = root / 'paper.json'
            data = {'paper_id': 'test', 'title': 'Test', 'version': 'v1', 'summary': 'Test', 'writing_profile': '70% compliant',
                    'sections': [{'id': 'intro', 'title': 'Intro', 'html': '<p>Test.</p>'}]}
            source.write_text(json.dumps(data))
            with self.assertRaisesRegex(ValueError, 'writing_profile'): build(source)
            self.assertFalse((root / 'notebook.html').exists())


if __name__ == '__main__': unittest.main()
