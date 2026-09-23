# Run the helpers in either agent

Resolve the skill directory from the absolute location of the SKILL.md you loaded. Resolve every helper against that directory, not the current shell directory. In Claude Code the installed entrypoint supplies `${CLAUDE_SKILL_DIR}`. Quote file paths and pass paper URLs/titles as data, not shell expressions.

## Choose a runtime once

Python **3.9 or newer** is supported. `build_notebook.py` uses the standard library, with optional `latex2mathml` for equation conversion. Figure extraction needs **Pillow** and either **PyMuPDF** or Poppler's **pdftoppm**. Caption location needs **pdftotext** from Poppler. Do not assume system Python includes these packages.

If `runtime.local.json` exists beside SKILL.md, read its `python`, `node`, `playwright`, `browser`, and `library_root` hints and verify the referenced executables exist. These are local hints, not portable dependencies or permission grants. Otherwise inspect available runtimes or use the host's bundled dependency locator. Before capture, check the chosen interpreter:

```bash
/absolute/path/to/python -c 'import sys, PIL, shutil; print(sys.version); print(shutil.which("pdftoppm"))'
```

Use the resolved absolute interpreter for subsequent calls. A working Python 3.9 without Pillow can build notebooks but cannot capture figures until a suitable runtime is selected. Do not install packages globally or replace the user's interpreter to solve this.

## Capture without guessing blindly

```bash
/absolute/python /absolute/skill/scripts/find_figures.py /absolute/paper.pdf --output /absolute/work/candidates.json
/absolute/python /absolute/skill/scripts/extract_figure.py /absolute/paper.pdf --page 3 --output /absolute/work/page-3.png
```

View `page-3.png` with the host's image-reading tool. Caption candidates include a bounding box and suggested broad region, but are **not automatic figure detections**. Captions may be above or below figures, span columns, wrap into different blocks, or be absent from scanned PDFs. Choose a region that includes all panels and labels; include the full caption when it is useful, or give its complete relevant meaning in the notebook caption. Avoid cutting through text lines.

Crop with directly observed pixel coordinates to avoid unnecessary normalization arithmetic, and reuse the verified full-page render:

```bash
/absolute/python /absolute/skill/scripts/extract_figure.py /absolute/paper.pdf --page 3 \
  --page-image /absolute/work/page-3.png --bbox-pixels 100 120 1200 800 \
  --output /absolute/paper-folder/assets/figure-1.png --label "Figure 1"
```

Example coordinates must be replaced after viewing the page. `--page-image` requires the helper's matching full-page JSON sidecar; it checks paper hash, page, dimensions, and that the cached DPI meets the requested DPI (200 by default). Re-render the full page at the requested resolution when a cached capture is too small, then choose pixel coordinates on the new image. Normalized `--bbox` remains supported. Inspect the final crop before using it. Do not apply an unverified candidate box automatically.

## Build, lint, and math

```bash
/absolute/python /absolute/skill/scripts/build_notebook.py /absolute/paper-folder/paper.json
```

Warnings identify missing comparison/limitations sections, missing caption/source links, missing provenance, and unrendered LaTeX. `--strict` stops before writing when warnings remain; use it when all applicable warnings can be resolved. Set section `kind` to `comparison` or `limitations` when using custom IDs/titles. `mode: focused` intentionally omits the section-presence requirement. A sourced local PDF can legitimately lack a public link; explain such cases instead of inventing one to satisfy lint.

Figure provenance is merged from used image sidecars into `sources.json`. Existing records and custom fields are preserved. Original web image/SVG assets can use explicit `sources.json` entries instead of synthetic PDF sidecars. Check provenance content as well as file presence.

By default the builder converts delimited LaTeX in prose to MathML **if `latex2mathml` is installed in the selected interpreter**; otherwise it warns. `math_mode: warn` leaves math untouched for inspection. Code blocks and existing MathML are not converted. This is a convenience for supported LaTeX, not a full TeX compiler. Check output against the paper; use an original equation crop for unsupported macros, ambiguous parsing, or a failed conversion. Do not claim that accessing LaTeX source alone makes equations accurate.

## Localize one paper

Copy keys from `assets/ui-strings.json` into that paper's `ui_strings` object and translate the values. Include all keys for a fully translated interface; omitted keys use English with a warning for non-English notebooks. `language` sets the HTML language code. Optional `notes_seed` supplies a translated blank Markdown notes template only when notes.md is absent. Neither setting changes another paper or an existing notes file. Translate authored captions and explanations separately.

## Verify with a timeout

Use an existing Node runtime and Playwright installation. In Codex the dependency locator can expose bundled Node and node_modules; Claude Code can use the same local installation via runtime.local.json. Playwright being absent from one interpreter or global package path does not mean it is absent from the machine.

```bash
/absolute/python /absolute/skill/scripts/verify_notebook.py /absolute/paper-folder/notebook.html \
  --output /absolute/work/notebook-check \
  --node /absolute/path/to/node \
  --playwright /absolute/path/to/node_modules/playwright \
  --browser /absolute/path/to/chromium
```

`--browser` may point to installed Chrome or be omitted if Playwright's Chromium is installed. The helper launches a temporary headless profile, checks figure decoding, enlargement, notes export, browser errors, and desktop/mobile layout, then writes screenshots. The outer check stops after 45 seconds by default. Inspect screenshots yourself; automated UI success does not verify scientific fidelity. If launch fails because of permissions, follow the host's normal permission flow or report the unresolved limitation. Do not add `--no-sandbox`, install a large browser, or keep retrying without evidence it will help. Existing compatible tools may be used instead.

## Shared library

Both agents can use one configured `library_root` or `CV_PAPER_LIBRARY`; no migration is automatic. Reuse the supplied notebook folder before applying any default. At a shared library root, maintain a concise `index.md` linking each notebook with its title, source/version, tags, and one-sentence takeaway. Add cross-paper relationships only when supported by actual reading. Preserve manually written entries. This is a convenience index, not a new required database or background automation.
