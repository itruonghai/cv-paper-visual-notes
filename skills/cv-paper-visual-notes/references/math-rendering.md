# Equations in paper explanations

The default builder renders LaTeX with a pinned, bundled **KaTeX 0.19.0** during the build. The HTML includes its CSS and WOFF2 fonts, with accessible MathML alongside the visible output. No CDN, network access, or browser-side typesetting is needed to read it. This keeps the equation layout ready before highlights attach. The vendor folder contains the upstream license, package integrity, and file hashes.

Node.js is required only when a section contains TeX. No global KaTeX installation is needed. Choose an existing runtime with `--node /absolute/path/to/node`, then `CV_NOTEBOOK_NODE`, then the skill's optional `runtime.local.json` `node` value; otherwise the helper tries PATH. Plain HTML without TeX still builds with Python's standard library. Unsupported commands or missing runtimes stop the build before rewriting output; they do not silently produce raw LaTeX. `math_mode: "warn"` is an explicit diagnostic mode, not a finished-reading mode.

## Author correctly

- Use `\(x_i\)` for short inline math and `\[...\]` for a display equation. `$x_i$` and `$$...$$` remain supported for existing notebooks. Explicit delimiters avoid confusing prices with equations.
- Use normal inline style; do not add `\displaystyle` to small expressions. Put long objectives, stacked fractions, matrices, cases, and aligned steps in display math. Do not make an inline expression tiny or cut terms merely to fit a line.
- Write each expression within one authored text span. Avoid emphasis/HTML tags inside its TeX. Literal comparison signs and alignment ampersands are protected before the HTML parser sees them. In JSON, escape backslashes as JSON requires, or use a JSON serializer.
- Keep the paper's notation and explain symbols nearby. Supply verified custom definitions in a per-paper `math_macros` object, for example `{"\\R": "\\mathbb{R}"}`. Do not invent an expansion for an unknown paper macro.
- Unsupported mathematical syntax must be corrected from the source, or replaced by an original equation crop plus a symbol explanation. KaTeX covers math syntax, not a full LaTeX document/preamble. Do not change the mathematical claim to make it compile.
- Existing valid MathML and equation figures remain supported. Code samples stay code. Do not put intended rendered mathematics in backticks or a code fence.

Example Python data (the raw strings preserve backslashes):

```python
paper = {
    "writing_profile": "balanced",
    "math_macros": {r"\R": r"\mathbb{R}"},
    "sections": [{
        "id": "attention",
        "title": "How the weights are formed",
        "html": r'''<p>The query is \(q_i \in \R^d\). Each key has the same dimension.</p>
        <p>For this illustrative example, normalize each query's scores over the keys:</p>
        \[a_{ij}=\frac{\exp(q_i^{\mathsf{T}}k_j/\sqrt{d})}{\sum_{\ell}\exp(q_i^{\mathsf{T}}k_{\ell}/\sqrt{d})}\]
        <p>The denominator sums over keys for the same query. Use the actual paper's normalization when explaining a real method.</p>'''
    }]
}
```

The example illustrates formatting; it is not a claim that every paper uses this equation.

## Markdown is an explicit input format

A section contains exactly one of `html` or `markdown`. For `markdown`, use an existing Python with `markdown-it-py` (included in the repository requirements). The builder protects math before Markdown parsing, then renders it; underscores/backslashes inside equations are not interpreted as emphasis or escapes. Inline/fenced code is excluded. Markdown tables get a scrollable wrapper. Trusted authored sections can still use HTML figures and details blocks for precise comparison layouts.

Do not paste raw Markdown into `section.html` and assume it will render. Markdown support here applies to paper explanations. `notes.md`, saved comments, and `discussion.md` remain reader-owned text; this update does not reinterpret their content or add a live Markdown preview.

## Verify appearance and meaning

Build, then use the bounded browser checker. Verify equations are present, fonts loaded, and expressions readable offline at desktop and narrow widths. Inspect inline baselines, sub/superscripts, limits, signs, accents, brackets, fractions, alignment, and display overflow. Compare notation against the cited paper, not only against the source string. A renderer can typeset a mathematically wrong transcription perfectly.

The checker detects oversized inline math and mobile clipping. Move a long equation to display form; reflow a wide derivation with an `aligned` environment. Horizontal scrolling is available for display math, but for print the expression must fit the page at readable size. Inspect the printed output for changes that affect equation layout. Ensure text highlights near or across math survive reload; the hidden accessibility copy is excluded from annotation text offsets to avoid duplicated formula text.

Technical sources: [KaTeX rendering API](https://katex.org/docs/api), [inline/display options](https://katex.org/docs/options), and [why explicit math delimiters help](https://docs.mathjax.org/en/latest/input/tex/delimiters.html). The selective language profile is described in [writing.md](writing.md).
