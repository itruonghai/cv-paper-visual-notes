"""A small synthetic language/math notebook for offline visual regression."""
import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'skills/cv-paper-visual-notes/scripts'))
from build_notebook import build


def create(root):
    root.mkdir(parents=True, exist_ok=True)
    if (root / 'paper.json').exists(): raise ValueError('Choose a new fixture folder.')
    paper = {
        'paper_id': 'language-math-fixture', 'title': 'Clear language, precise equations', 'version': 'fixture-v1',
        'source_label': 'Synthetic formatting example; not a paper analysis',
        'summary': 'Use familiar wording to explain the operation. Keep the variables, conditions, and mathematical relationships precise.',
        'mode': 'focused', 'writing_profile': 'balanced', 'math_macros': {r'\R': r'\mathbb{R}'},
        'notes_seed': '# My notes\nReader wording stays unchanged.\n',
        'sections': [
            {'id': 'operation', 'title': 'Start with the operation', 'html': r'''
<p id="inline-math-passage">A query \(q_i \in \R^d\) describes what position \(i\) needs. Compare it with each key \(k_j\). The score is \(s_{ij}=q_i^{\mathsf{T}}k_j/\sqrt{d}\).</p>
<p>In this example, normalize each query's scores over the keys:</p>
\[a_{ij}=\frac{\exp(s_{ij})}{\sum_{\ell=1}^{n}\exp(s_{i\ell})}.\]
<p>The denominator sums over keys for the same query. The weights therefore sum to one along that dimension. A mask can change which keys are included.</p>
<p id="small-symbols">Short notation stays in the sentence: \(x_i^{t+1}\), \(\hat{y}_i\), and the condition \(i<j\).</p>
<p id="inline-wrap-probe" style="width:80px"><span style="display:inline-block;width:40px">End</span> \(s=2\)</p>
<details id="math-details"><summary>Technical detail: loss and a small matrix</summary>
\[\begin{aligned}\mathcal{L}_{\mathrm{total}} &= \mathcal{L}_{\mathrm{task}}+\lambda\mathcal{L}_{\mathrm{aux}},\\\lambda &\ge 0.\end{aligned}\]
<p>The coefficient \(\lambda\) controls the auxiliary term's weight. This definition does not establish that a larger weight improves performance.</p>
\[M=\begin{bmatrix}1 & 0 \\ 0 & 1\end{bmatrix}.\]
</details>'''},
            {'id': 'language', 'title': 'Clear wording keeps the technical conditions', 'html': '''<p>During training, only the adapter is updated. The backbone stays frozen. An auxiliary consistency loss helps train the adapter. The auxiliary branch is removed at inference.</p><p>This illustrative description preserves the updated parameters, objective, and training/inference distinction. For a real paper, verify each statement against its method and experiments.</p><div class="table-scroll"><table class="comparison-table"><thead><tr><th>Stage</th><th>Training</th><th>Inference</th></tr></thead><tbody><tr><th>Auxiliary branch</th><td>Supplies an additional consistency signal for the adapter.</td><td>Removed after training; this column must remain visible in print.</td></tr></tbody></table></div>'''},
            {'id': 'markdown-example', 'title': 'Markdown and equations together', 'markdown': r'''**Readable prose** can include \(z_i\) and \(p_i\) without changing their subscripts.

\[
p_i=\frac{\exp(z_i)}{\sum_j\exp(z_j)}.
\]

| Symbol | Meaning in this example |
| --- | --- |
| \(z_i\) | Score before normalization |
| \(p_i\) | Weight after normalization |

Literal code stays code: `$x_i$`. Prices stay text: $5 and $10.
'''}
        ]
    }
    (root / 'paper.json').write_text(json.dumps(paper, indent=2), encoding='utf-8')
    return build(root / 'paper.json', strict=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    print(json.dumps(create(parser.parse_args().output)))
