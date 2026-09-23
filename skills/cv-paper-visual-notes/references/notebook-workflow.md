# Build a reusable paper notebook

## Paper folder

Keep these together in the chosen paper directory:

```text
paper.json             Title, stable ID, version, source, section content
notebook.html          Portable reading view with embedded figures
notes.md               Reader-owned notes, editable by the reader or on explicit request
discussion.md          Agent responses and resolved/open follow-ups, when discussions occur
sources.json           Source/figure provenance, including prior papers
assets/                Original figure and table crops; optional separate annotations
```

Keep downloaded PDFs and full-page working renders in a workspace `work/` directory or an existing source cache. Link to the source PDF as well as recording its exact version. Do not overwrite user notes when rebuilding. Different paper versions should have separate folders and explicit relationships.

## Acquire and preserve original figures

Read the actual PDF pages and captions before selecting crops. The default is a screenshot-style crop from a rendered PDF page, preserving the complete figure as it appears in the paper. Start at 200 DPI and use 250–300 DPI or higher for small labels, thin lines, or dense panels when needed. Aim for comfortably clear figures at the intended display size. This is a programmatic PDF capture and does not need a physical screen or desktop interaction. Extracting an individual embedded bitmap can lose vector arrows, text, multi-panel composition, or legends; rendering the page preserves their composition.

Reuse cached page renders for multiple crops when they meet the requested resolution. Recapture blurry 150-DPI assets from the PDF; enlarging those pixels will not restore detail. Keep already verified figure assets when sufficiently clear. Inspect the crop at its intended notebook size or one-click enlarged view. If essential text or marks are unreadable, increase resolution for that figure or provide a focused panel crop alongside the full figure. Stop when it is readable. Do not hunt for author SVGs, upscale images, or compare extra renderers just to obtain sharper output when the PDF capture is already adequate.

Acquire sources through direct HTTP downloads, supplied files, or available read APIs before considering interactive browser tooling. If a known download fails, report the concrete access limitation and choose an available route. Do not use desktop control to fetch ordinary static paper assets. Notebook testing can use an isolated headless browser with a temporary profile; it does not need the user's active browser or desktop. Use the host's file-opening affordance simply to show the result when helpful. Concrete commands and dependency checks are in [runtime.md](runtime.md).

If PDF capture is unavailable or inadequate, use an original author image or SVG that matches the selected version. Existing verified assets can also be reused. Preserve SVG assets as SVG; the notebook builder embeds their bytes as `image/svg+xml` image URLs. Confirm the asset is self-contained: external fonts, linked images, or styles may require a PDF fallback. Do not inline publisher SVG markup into the notebook DOM, rewrite paths, or strip styling to make it fit.

Generic SVG-to-PNG conversion is not a fidelity guarantee. One observed failure with ImageMagick `convert` on arXiv-exported SVGs preserved glyphs and point markers but lost connecting curves, axes, gridlines, and line samples in the legend. Avoid that conversion route for these assets. If a downstream format requires PNG, render the unchanged SVG through a browser's native image renderer or crop a verified PDF rendering; compare against the original at readable size. Keep the original asset and record the conversion route.

For every converted figure, check complete panels, solid/dashed/dotted lines, markers, arrows, error bars, axes, gridlines, colorbars, and legend samples. If the rendered result has only isolated markers where the original has curves, stop using it and repair the render. Inspect all sibling figures produced by the same converter. Do not infer scientific meaning from damaged imagery.

Use available PDF tools or a direct PDF-page screenshot tool. The bundled helper requires Pillow and either PyMuPDF (`import fitz`) or Poppler's `pdftoppm` on PATH; a bundled Python runtime may provide the Python dependencies. It uses Poppler automatically if PyMuPDF is unavailable. Both routes capture the rendered page without desktop control. Do not invent an extracted figure when no rendering route works.

```bash
/absolute/python /absolute/skill/scripts/extract_figure.py /path/to/paper.pdf \
  --page 4 --bbox 0.07 0.12 0.93 0.49 \
  --output /path/to/paper-folder/assets/fig-2.png \
  --source-url https://example.org/paper.pdf --label "Figure 2"
```

Resolve the helper and interpreter to absolute paths as described in runtime.md. The helper defaults to 200 DPI; use `--dpi 300` or higher when more detail is needed. `--page` is one-based. The optional bounding box is normalized `(left, top, right, bottom)` relative to the displayed PDF page, including its rotation; `--bbox-pixels` accepts directly observed image coordinates instead. Omit both to render the full page for inspection. Inspect the resulting crop; coordinates are chosen from the actual page, never guessed blindly. Do not use image generation or super-resolution to recover illegible scientific details; recapture the relevant region from the PDF if necessary.

The helper writes a JSON sidecar containing the PDF hash, page, crop, source URL, and figure label. The builder merges used sidecars into `sources.json`; enrich these records with paper title/version, source location, and original/reproduced versus supplementary illustration status. Check every figure against its caption. Include caption context in your own words; preserve exact labels and numeric values.

For prior methods, retrieve their primary papers and choose figures that explain the relevant mechanism or limitation. If unavailable, provide a sourced text comparison and mark the missing visual. Do not use the new paper's criticism as independent proof of the earlier method's limitations. A supplementary comparison schematic should state what was simplified and link to the corresponding original.

## Notebook source and build

Create `paper.json` as UTF-8 JSON with these fields:

- `paper_id`: stable identifier, independent of today's date and folder location.
- `title`, `version`: exact source metadata.
- `source_url`: HTTP(S) primary-source URL when available. For an uploaded PDF without a public URL, omit it and provide `source_label` describing the supplied file; record the local file identity in `sources.json`.
- `language`: optional document language code, default `en`. Supply per-paper `ui_strings` using keys from `assets/ui-strings.json`; never edit the shared template just to translate one paper. Optional `notes_seed` translates the initial blank notes file without changing existing notes.
- `mode`: `deep` (default), `quick`, or `focused`. Quick/deep retain comparison and limitations sections; focused covers a deliberately narrow request.
- `summary`: a compact motivation → design → evidence explanation in plain text.
- `sections`: a list of objects with a unique lowercase hyphenated `id`, `title`, and `html`. Set optional `kind` to `comparison` or `limitations` for those sections if custom IDs are used.

The `html` is an agent-authored fragment using paragraphs, figures, tables, lists, and `<details><summary>…</summary>…</details>` for technical depth. Do not paste arbitrary publisher HTML or scripts. The builder is for trusted locally authored content, not an HTML sanitizer. Use semantic markup and descriptive alt text. Keep tables in `<div class="table-scroll">` wrappers. Use `<div class="callout">` for an evidence qualification or a clearly labeled inference.

Use relative image paths beneath the paper folder. The builder embeds PNG/JPEG/WebP/SVG figures into the final HTML and rejects missing or external image paths. An original SVG uses the same `<img src="assets/figure.svg">` pattern; no raster conversion is needed. Example figure markup shape:

```html
<figure>
  <img src="assets/fig-2.png" alt="Describe the actual architecture and highlighted relationship">
  <figcaption>Original Figure 2, PDF p. 4, selected paper version.
    <a href="https://example.org/paper.pdf#page=4">Source</a>.
    Caption context in your own words.</figcaption>
</figure>
```

Replace example values with verified metadata; examples are not paper facts. Figure enlargement is built in. Keep the original unannotated image available whenever adding a separate annotated version. For important math, use legible HTML/MathML or an original equation crop plus a variable explanation. The optional latex2mathml path and lint warnings are explained in [runtime.md](runtime.md); inspect converted equations against the source.

For an agent-created explanatory diagram, save a separate asset such as `assets/workflow-explained.svg` and use the same figure markup and enlargement. Its visible caption must say “Agent-created explanatory diagram,” cite the paper passages/figures it interprets, and explain any simplifications or inferred connections. Add a `sources.json` figure record with the relative `file`, `kind: "agent-created-explanation"`, source locations, and any assumptions; do not give it an original-PDF-crop identity. Keep the original source figure nearby. Use self-contained SVG/HTML or pre-rendered Mermaid without an external runtime. Check the rendered diagram's arrows and labels against its cited evidence.

```bash
/absolute/python /absolute/skill/scripts/build_notebook.py /path/to/paper-folder/paper.json
```

This creates `notebook.html`, creates `notes.md` only if absent, and merges used figure sidecars into `sources.json` while preserving existing source records. It reports lint warnings; `--strict` fails before writing when warnings remain. The notebook is self-contained for offline reading, except outbound source links. It has responsive navigation, expandable technical detail, figure enlargement, and a notes editor. Adapt styles if needed to serve the paper's content; keep the build independent of hosting and external JavaScript libraries.

## Side-by-side comparison layout

Create a dedicated `sections` entry such as `id: "side-by-side-comparison"`, titled in clear language: “Side-by-side comparison: what changed and why?” Keep it visible in the notebook navigation.

Use a semantic table with `class="comparison-table"` inside a `class="table-scroll"` wrapper. Give the wrapper `tabindex="0"`, `role="region"`, and a descriptive `aria-label` so horizontal scrolling is accessible. Put the compared method names in column headers with `scope="col"`; put the matched questions in row headers with `scope="row"`.

Each method gets its own column. Place each original figure and its attribution in the corresponding cell of a shared figure row. Use the existing `<figure>`, `<img>`, and `<figcaption>` markup so enlargement works. Follow with matched rows that explain intention, information, operation, bottleneck, tradeoff, and evidence. Keep the cells brief and concrete; put long derivations in the method section. Cite the source near each factual comparison.

The template preserves readable column widths and allows horizontal scrolling on small screens. Include a short instruction to scroll when needed. Use focused pairs when additional methods would make the table unwieldy. Preserve each figure's aspect ratio and full relevant context; different figure layouts do not justify distorting or recropping away important information.

Add a `class="comparison-takeaway"` paragraph below the table explaining the design change and its intention in plain language. If a source figure is unavailable, identify the missing visual in its cell and retain a sourced textual comparison.

## Limitations and extension discussion layout

Create a separate `sections` entry such as `id: "limitations-and-extensions"`. Use clear subheadings for limitations and proposed extensions, with the key ideas visible before expandable details.

For each limitation, show its source or reason and whether it is observed, author-acknowledged, or inferred. For each extension, place the motivating finding next to the proposed change, rationale, smallest useful test, and likely tradeoff. Label creative ideas as untested. Reuse a relevant original figure crop when it helps locate the proposed change; keep agent annotations separate.

Finish with a few focused discussion prompts tied to these ideas. The notes template has matching spaces for comparison questions, limitations, and potential extensions. Existing `notes.md` files remain reader-owned; do not insert the new headings into an existing file unless the user asks to update it.

## Notes and discussion continuity

`notes.md` is the durable, agent-readable copy. The browser editor keeps a best-effort local draft, keyed by paper ID and version. Browser storage may be unavailable, cleared, or isolated across file locations. The UI states this and provides Markdown export and import. Export downloads a file; it does not silently write over the paper folder's `notes.md`. Tell the reader to place the exported file there or supply it in the next discussion. Directly editing `notes.md` is also supported.

On rebuild, embed the current `notes.md` as the file snapshot. A conflicting browser draft triggers explicit “Keep my draft” and “Use the file snapshot” choices. Choosing the file preserves the previous editor text in a separate downloadable area and in the browser draft when storage is available. Neither button writes notes.md. Never claim that another agent can see unexported browser edits.

For a discussion, read the supplied/current notes, target the referenced figures or claims, and append responses to `discussion.md` with date, note/figure anchor, supporting source, and open/resolved status. Rebuild the relevant explanation when asked to improve it. Keep user notes verbatim unless the user asks to edit or organize them. Do not turn a paper-specific comment into a global skill preference without the user's intent.

## Final check

- Compare each displayed figure with an original source rendering; check connecting lines, dash patterns, markers, arrows, error bars, axes, gridlines, legends, labels, panel coverage, colorbars, captions, and attribution. A readable caption and surviving markers do not establish figure fidelity.
- Verify that text claims and values match the cited version, table, and experimental setting.
- Read the overview and comparison takeaway for clarity: can a reader explain the problem, design intention, and key difference without decoding undefined jargon?
- Confirm the dedicated comparison and limitations/extension sections are present. Check that comparison cells address the same questions and that creative proposals are visibly untested.
- Open the built HTML in an isolated headless browser at desktop and narrow widths; inspect long figures, technical details, tables, navigation, and enlargement. Prefer local file rendering where supported; otherwise use a temporary loopback-only static server. Keep native desktop control and the user's active browser out of routine verification.
- Test note editing/export/import and rebuild behavior when changes affect the template or helpers. For routine paper content, confirm the notes file is preserved and the UI loads.
- Link the notebook and notes in the final response. Mention any missing sources or unverified visual behavior concisely.
