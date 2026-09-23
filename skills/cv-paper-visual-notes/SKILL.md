---
name: cv-paper-visual-notes
description: "Explain computer vision papers using original figures, clear technical walkthroughs, side-by-side comparisons, ablations, and editable notes. Use for daily paper study, paper notes, explaining a figure, or walking through a paper and its limitations/extensions; not for drafting a new research manuscript."
---

# CV Paper Visual Notes

Create a visual HTML reading notebook with durable Markdown notes. Explain why the paper exists, how its design works, and what the experiments actually establish. Use the conversation language unless the user specifies another.

## Core preferences

- Preserve the target paper's original figures. Default to PDF-page screenshot crops at 200 DPI. Use 250–300 DPI or higher when small labels, thin lines, or dense panels still look blurry at the intended display size. Reuse verified captures only when their resolution is adequate; recapture blurry 150-DPI assets from the PDF. Do not substitute redrawn diagrams or toy examples, or hunt for vector assets just for extra sharpness.
- Explain the original figure's labels, arrows, panels, axes, and evidence. Keep its attribution and relevant context. Detailed crops may supplement a full figure.
- When the paper's explanation is unclear, especially its workflow, create a supplementary diagram to clarify the idea. Keep the relevant original figure alongside or nearby, map the diagram to the paper's terminology, and label agent-created explanations and inferred steps explicitly. Follow the diagram guidance in references/writing.md.
- Compare prior methods and the target side by side, using original figures and aligned explanations of what changed, why, and the tradeoff. Label any supplementary simplification.
- Use clear language: intuition before notation, necessary terms defined, and concrete operations connected to their purpose. Preserve technical precision.
- Prioritize informative ablations and behavior over leaderboard recitation. Distinguish authors' claims, reported evidence, interpretation, and untested ideas.
- Preserve the reader's notes verbatim. Agent responses belong in discussion.md. Browser drafts need export before another agent can read them.

## Procedure

1. **Identify and resume.** Accept a PDF, URL/arXiv ID, title, or existing notebook folder. Ask only if the paper is missing or ambiguous. Read existing paper.json, notes.md, discussion.md, and source provenance before editing. Match the exact paper version.
2. **Choose scope and location.** Default to a full walkthrough (`mode: deep`). If requested, `quick` gives roughly a ten-minute reading experience: motivation, key design figure, one focused comparison, the most informative ablation, and a short limitation/extension discussion. Keep technical depth available for later expansion in the same folder. Use `focused` only for a deliberately narrow request, such as explaining one figure. Reuse an existing paper folder; otherwise prefer the user's library, then `CV_PAPER_LIBRARY`, then `library_root` in optional runtime.local.json beside this skill, then workspace outputs/papers/<stable-id>/<version>/. Do not move an existing library automatically. If starting in the home directory without a configured library, establish a Documents location rather than scattering output in home.
3. **Read the sources.** Consult the full paper, captions, and relevant appendix/supplement. Use primary sources for earlier methods. Retrieve official code or version-matched LaTeX source only when it resolves a real ambiguity; rendered PDF/HTML remains the reference for the published layout. Record missing evidence rather than filling gaps from memory.
4. **Capture figures.** Follow [references/notebook-workflow.md](references/notebook-workflow.md). Inspect a full-page render before cropping, and inspect the crop afterwards. The optional caption locator proposes anchors, not trusted figure boundaries. Direct file/download/PDF tools are the default. Native desktop control is unnecessary for normal capture or verification.
5. **Write the walkthrough.** Read [references/writing.md](references/writing.md). Keep motivation, novelty, technical design, experiments, and notes connected. Full and quick notebooks both have visible side-by-side comparison and limitations/potential-extensions sections. Creative extensions must name a motivating result, concrete change, useful test, and tradeoff; mark them untested.
6. **Interpret experiments.** Read [references/ablation-reading.md](references/ablation-reading.md). State the intervention, control, metric/values, supported conclusion, and confounds. Do not infer significance, independence, or generality from an uncontrolled or unreplicated difference.
7. **Build and verify.** Resolve absolute helper paths from this SKILL.md location and use the runtime recipe in [references/runtime.md](references/runtime.md). Build with lint warnings; correct substantive warnings or document why they do not apply. Lint does not prove scientific correctness. Inspect rendered original figures against notebook figures, especially curves, dashes, axes, legends, and arrows. Use the bounded browser checker and inspect its screenshots. Report incomplete visual verification if the environment prevents it; do not repeatedly retry a hanging browser.
8. **Deliver and continue.** Link the notebook and editable notes with the main takeaway and a useful open question. For follow-ups, preserve reader wording, append dated responses to discussion.md, and revise requested explanations. Use assets/discussion-template.md when starting a discussion file; do not create empty discussions for every paper. Keep a concise library index only when working in a configured shared library; preserve its existing entries.

## Portability

The scripts and notebook format work in Codex and Claude Code. Optional runtime.local.json supplies local executable paths and a shared library; never assume the first python3 on PATH has the needed packages. Do not change global interpreter or tool permissions to run this skill. Per-paper ui_strings and notes_seed handle localization without editing shared templates.

Subagents are optional only when the user authorizes them and the task benefits; they are not required for daily reading. Do not automatically fetch LaTeX source, launch multiple agents, or expand a focused question into a full literature review.
