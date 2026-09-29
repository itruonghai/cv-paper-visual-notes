# Reading captures and agent replies

Use this reference when creating/revising annotation anchors or continuing a discussion. The notebook supports text highlights/comments and comments on whole figures. Region boxes, reading progress, cloud synchronization, and library-wide search are separate future work.

## Reader workflow

Select text, choose **Highlight or comment on selection**, and optionally add a comment/tag. A figure has **Comment on this figure**. The visible capture panel lists captures by section, filters tags and open questions, jumps to their source, and exports a verbatim Markdown digest. Its digest is a deterministic collection of excerpts and comments, not an AI synthesis.

The general notes editor remains independent. `notes.md` contains reader-owned prose; `annotations.json` contains structured captures. Use **Connect paper folder → Save to folder**, or download both files and put them beside `paper.json`. The folder must match the paper ID/version. Opening a notebook alone never grants write access. Browser drafts do not synchronize devices and agents cannot read them until saved or supplied.

Direct folder saving uses the browser's feature-detected File System Access API and a user gesture. Cancellation, revoked permission, or an unsupported browser leaves download/export available. Before writing, compare both current file contents with the last-read copies. If they changed, stop and offer to load folder notes/merge captures. Current notes remain in previous-text/recovery downloads. To keep a draft instead, export it before loading, compare the versions, then import the intended notes.

Each explicit save stores the previous two files in `.reading-backups/`. The two writes are **not an atomic transaction**: report exactly which succeeded if the second fails. Cooperating tabs use a browser lock where available; external editors cannot share that lock. Content checks and backups mitigate races, but do not promise arbitrary concurrent-editor transactions. Avoid editing the same files in another app during a save.

## Stable anchors and source identity

- Keep authored section IDs and explicit `<figure id="fig-method">` IDs stable across explanation updates. For older content without figure IDs, the builder derives an ID from the section and asset paths, not the figure's ordinal position. Repeated assets in a section need explicit IDs. IDs must be unique across the notebook.
- Text anchors retain the exact selected string, surrounding prefix/suffix, section ID, section revision, and offsets. Offsets apply only to the same revision. Across revisions, a unique exact/context match attaches normally. If the exact text is still unique but its context changed on one side (a nearby wording fix), the highlight stays attached and is flagged; the reader chooses **Confirm this position** to store the new context, with the prior target kept in history. Repeated, rewritten, missing, or ambiguous targets stay readable in **Needs reattachment**. The reader can select a new passage and explicitly reattach; prior targets remain in history.
- A figure comment stores its stable figure ID, asset paths, and image fingerprint. If the same figure ID now has different image bytes or a different section (for example, after a higher-resolution recapture), the comment stays on that figure but is flagged; the reader chooses **Keep comment on updated figure** to accept it, and the prior target is kept in history. A missing figure ID needs reattachment. Keep figure IDs stable when recapturing so comments follow the figure. Whole-figure comments do not change image pixels. This release does not claim to map region coordinates through a recrop.
- Default text source kind is `notebook-prose`. A paraphrased caption is also notebook prose. Mark a genuine original caption or paper quotation explicitly:

```html
<p data-origin="paper-passage" data-source-ref="https://example.org/paper.pdf#page=4">A short, verified quotation.</p>
<figcaption data-origin="original-caption" data-source-ref="https://example.org/paper.pdf#page=4">A short original caption excerpt.</figcaption>
```

Source quotations still need correct attribution. Mark only the actual quoted span, not an entire section that mixes quotation and interpretation. A selection spanning different origins falls back to notebook prose. Do not present selected notebook prose as verbatim paper evidence.

The quote/context approach follows the [W3C Text Quote Selector](https://www.w3.org/TR/annotation-model/#text-quote-selector); the local schema below is a small application format, not a claim of full W3C compatibility. Folder access follows the [browser File System Access API](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access).

## Portable file contract

`annotations.json` has `schema_version: 1`, exact `paper_id` and `version`, a `revision`, `updated_at`, and an `annotations` list. Each record contains:

| Field | Meaning |
|---|---|
| `id` | Stable unique ID; use it verbatim in a reply. |
| `kind` | `text` or `figure`. |
| `section_id`, `section_title`, `content_revision` | Original notebook context. |
| `target` | Text: `exact`, `prefix`, `suffix`, `start`, `end`. Figure: `figure_id`, `fingerprint`, `files`, `caption`. |
| `source` | `{kind, ref}`; kind is `notebook-prose`, `original-caption`, `paper-passage`, `user-note`, or `figure`. |
| `comment`, `tags` | Reader wording and optional tags; preserve exactly. |
| `status` | `open`, `resolved`, or `archived`; reader-controlled. |
| `created_at`, `updated_at` | ISO timestamps. |

Preserve additional fields, including target history and conflict provenance. Imports reject other papers/versions, unsupported schemas, and malformed/duplicate IDs without replacing current records. Reimporting unchanged IDs does not duplicate captures. Concurrent changes to the same ID are retained as a separately identified record with `conflict_of` pointing to the original; neither wording is discarded. Archive unwanted copies after review. Normal edits and rebuilds retain the original ID.

Rebuilding reads and embeds notes, captures, and discussion but never rewrites existing notes/capture files. If the annotation schema is unsupported, stop the build before writing outputs and retain the file for a compatible reader. Do not “repair” it by resetting to an empty list. Export/import enables moving notebooks; browser storage is not a portable backup. Recovery downloads also retain otherwise unreadable browser draft text.

## Complete the agent round trip

1. Read the current saved/supplied `notes.md`, `annotations.json`, `discussion.md`, and relevant notebook/source sections. If the user supplies a copied prompt, its excerpts are available, but do not assume unsaved browser records exist on disk.
2. Address selected captures, or open comments/questions if none are selected. Preserve original wording, origin, and IDs. Separate source evidence, interpretation, and proposed experiments.
3. Append one dated reply block per addressed annotation to `discussion.md`. Each block begins with an exact marker line:

```markdown
<!-- annotation: ann-REPLACE_WITH_ACTUAL_ID -->
## YYYY-MM-DD — Agent reply

Response: …

Source and evidence: PDF page/figure/table, companion source, or timestamp.

Interpretation / proposed test: …

Still open: …
```

Copy the real ID from the record. Multiple reply blocks may share an ID; all display under that capture after rebuilding. Legacy/unlinked discussion text remains visible in the full discussion section. Discussion Markdown is displayed as plain text so reader content cannot execute HTML.

4. Rebuild and confirm replies appear beside the intended capture. Never change its `status` merely because an answer exists. If asked to improve an explanation, update the relevant notebook section while retaining IDs; check changed anchors and flag those needing reattachment.

Do not turn a paper-specific suggestion into a global skill preference without the reader's intent. Do not infer a lack of note-taking from empty disk files. Keep a configured library index without moving or reconciling existing folders automatically.

## Validation when the implementation changes

Use isolated fixtures and temporary browser profiles. Cover select/capture/reload/export/import, repeated import, wrong/future schema, source kinds, two-tab edits (simultaneous and sequential edits of one capture), unchanged, slightly edited, and rewritten anchors, recaptured figures, deleted figures, moved notebooks with imported captures, linked replies without auto-resolution, folder cancellation/denial/conflict/partial failure, and full print output. Print must expand technical details temporarily and include all current notes/captures; hidden previous-text/snapshot copies must not appear as current notes. Restore disclosure states after printing. Routine paper updates need preservation/anchor checks, not an exhaustive rerun of implementation tests.
