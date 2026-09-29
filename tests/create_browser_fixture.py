"""Create only synthetic notebooks for the browser regression suite."""
import argparse
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'skills/cv-paper-visual-notes/scripts'))
from build_notebook import build


def create(root):
    svg = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="250"><rect width="800" height="250" fill="#e0ebe4"/><text x="40" y="130" font-size="30">Synthetic test figure (not a paper)</text><path d="M40 190L740 190" stroke="#176354" stroke-width="3" stroke-dasharray="5 4"/></svg>'
    sections = [
        {'id': 'comparison', 'title': 'Compare designs', 'html': '<p id="opening">This exact sentence explains the design intention. This second sentence provides context for a careful reader.</p><p data-origin="paper-passage" data-source-ref="fixture.pdf#page=2">SOURCE_QUOTE: This is synthetic quoted evidence.</p><figure id="fig-method"><img src="assets/figure.svg" alt="Synthetic test figure"><figcaption>Fixture image, not a scientific figure. <a href="https://example.org/fixture">Source</a></figcaption></figure><details id="technical"><summary>Technical detail</summary><p>PRINT_TECHNICAL_END_MARKER</p></details>'},
        {'id': 'limitations', 'title': 'Limitations', 'html': '<p>Remaining limitations are questions for discussion.</p>'}]
    data = {'paper_id': 'capture-fixture', 'title': 'Reading capture test notebook', 'version': 'v1', 'summary': 'Synthetic interface test. No scientific claims.', 'notes_seed': '# My notes\nOriginal reader words.\n', 'sections': sections}
    for name in ('base', 'moved', 'rewritten', 'reply', 'edited', 'recropped'):
        folder = root / name
        if (folder / 'paper.json').exists():
            raise ValueError('Use a new fixture directory; never replace an existing paper.')
        (folder / 'assets').mkdir(parents=True)
        # A recapture keeps the figure ID but changes the image bytes.
        (folder / 'assets/figure.svg').write_text(svg.replace('#e0ebe4', '#e4e0eb') if name == 'recropped' else svg, encoding='utf-8')
        variant = json.loads(json.dumps(data))
        if name == 'rewritten':
            variant['sections'][0]['html'] = '<p>A rewritten explanation without the old quote or figure.</p>'
        if name == 'edited':
            # A small wording fix right after a captured sentence changes its stored suffix.
            variant['sections'][0]['html'] = variant['sections'][0]['html'].replace('provides context', 'gives context')
        (folder / 'paper.json').write_text(json.dumps(variant), encoding='utf-8')
        (folder / 'sources.json').write_text(json.dumps({'figures': [{'file': 'assets/figure.svg', 'kind': 'test'}]}), encoding='utf-8')
        build(folder / 'paper.json', strict=True)
        if name == 'reply':
            seed = json.loads(re.search(r'<script id="notebook-seed" type="application/json">(.*?)</script>', (folder / 'notebook.html').read_text(), re.S)[1])
            annotation = {'id': 'ann-linked', 'kind': 'text', 'section_id': 'comparison', 'section_title': 'Compare designs', 'content_revision': seed['sectionRevisions']['comparison'], 'comment': 'A saved question.', 'created_at': '2026-09-28', 'updated_at': '2026-09-28', 'tags': ['question'], 'status': 'open', 'source': {'kind': 'notebook-prose', 'ref': 'notebook.html#comparison'}, 'target': {'exact': 'This exact sentence explains the design intention.', 'prefix': 'Compare designs', 'suffix': ' This second sentence provides context for a care', 'start': 15, 'end': 64}}
            annotation['target']['end'] = annotation['target']['start'] + len(annotation['target']['exact'])
            captures = seed['annotations']; captures['annotations'] = [annotation]
            (folder / 'annotations.json').write_text(json.dumps(captures), encoding='utf-8')
            (folder / 'discussion.md').write_text('Earlier unlinked discussion.\n\n<!-- annotation: ann-linked -->\n## 2026-09-28 — Agent reply\nEvidence-backed answer.\nSource: fixture.pdf, p. 2.\n', encoding='utf-8')
            build(folder / 'paper.json', strict=True)
    (root / 'fixture.json').write_text(json.dumps({'synthetic': True}), encoding='utf-8')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    create(parser.parse_args().output)
