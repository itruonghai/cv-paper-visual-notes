# Clear technical paper explanations

## Write for understanding

Use clear, concrete language that makes the idea and design intention easy to follow. Explain each important choice in this order: **the problem → the intuition → the actual operation → why it may help → the supporting evidence**. State the intuitive explanation before introducing notation or implementation detail.

- Use short, connected sentences with one main idea at a time. Prefer concrete descriptions of what information moves or changes over abstract phrases such as “improves feature interaction.”
- Define a necessary technical term or acronym at first use. Keep the paper's exact component names, then explain what each component does in ordinary language so the reader can match text to the original figure.
- Introduce equations by the question they answer, explain the symbols and relevant dimensions, and describe the operation and its effect. Do not expect the formula alone to explain the mechanism.
- Make the reason for each design choice explicit. Distinguish the authors' stated intention from the agent's inferred rationale; explain what would differ under the earlier approach.
- Keep the overview approachable and put derivations or secondary detail in expandable blocks. Clear language must retain technical conditions, uncertainty, and meaningful differences between methods.

Do not use a toy example or redrawn target-paper figure as a substitute for understanding the original design. An optional supplementary analogy may help only if it is labeled and its limits are explained.

## Clarify an unclear workflow with a diagram

Create an additional explanatory diagram when the paper's presentation makes the idea or workflow difficult to follow. Use it to answer a concrete question: what happens first, what information moves between modules, how an iterative loop works, or how training differs from inference. This is authorized when helpful; it does not require a separate request for each diagram.

Keep the relevant original figure visible alongside or near the explanation. Use the paper's component names and connect diagram steps to the corresponding figure panels, equations, or method sections. Simplify layout and presentation while retaining scientifically important dependencies, conditions, and distinctions. Explain what was omitted.

Label it **Agent-created explanatory diagram**, with the source locations it interprets. Distinguish a hard-to-read explanation from an unspecified mechanism: if the paper does not establish a connection, mark it as inferred or unknown rather than filling the gap as fact. For example, use dashed arrows with an explicit legend for inferred steps. Proposed extensions belong in separately labeled, untested diagrams.

Choose a sequence, flowchart, or module/data-flow view that resolves the confusion, and add a short guide explaining how to read it. Prefer precise SVG or HTML; if using Mermaid, render it to a self-contained SVG for the offline notebook. See [notebook-workflow.md](notebook-workflow.md) for embedding and provenance.


## Build the explanation around evidence

Adapt length to the paper. Keep dedicated, visible sections for **Side-by-side comparison** and **Limitations and potential extensions** unless the user requests a narrower task. Keep a short overview visible and technical detail expandable, without hiding essential caveats. A normal walkthrough covers:

1. **The problem and motivation.** What task, operating constraint, or recurring failure matters? What input and desired output define the problem? Use the paper's motivating figure or real example when available.
2. **Side-by-side comparison: what changed and why?** Select the closest earlier method(s) needed to understand the innovation. Place original architecture or diagnostic figures beside the target paper's original figure, with matched explanation rows so the reader can compare the same question directly. Explain each method's intention, operation, assumptions, bottleneck, and tradeoff. Follow the comparison guidance below; do not replace this section with scattered references or a results-only table.
3. **The novelty.** Distinguish inherited components from new changes. Connect each claimed contribution to the specific prior limitation it addresses, the design decision that implements it, and the experiment that supports it. Attribute novelty to the authors; do not claim historical priority without checking it.
4. **How the method actually works.** Walk through the original architecture in its own terminology. Trace a real input through representations, modules, interactions, and outputs. Explain relevant tensor dimensions, equations, objectives, gradient paths, frozen/trainable components, and the difference between training and inference. State what is unspecified rather than inventing shapes or implementation details. Use official code to clarify only when helpful, citing the file/revision and any discrepancy with the paper.
5. **What experiments establish.** Give the evaluation setting and comparability constraints, then prioritize the ablations and diagnostics below. Show the original tables/plots used as evidence. Main benchmark results provide context, not the whole explanation.
6. **Limitations and potential extensions.** Discuss when the design may fail, what its evidence does not establish, and promising ways to extend it. Separate demonstrated failure modes, authors' acknowledged limitations, and inferred concerns. Develop creative ideas with a concrete mechanism and a test, following the guidance below.
7. **Notes and discussion.** Provide space for the reader's understanding, confusing figures, illustration requests, disagreements, and follow-up experiments. Leave personal answers blank. Suggest a few paper-specific discussion prompts separately.

For every important figure, answer: **what to look at → how to read it → what it supports → what it cannot establish**. Cite figure/table numbers, panels, PDF page numbers, and source links near the explanation. Do not impose arbitrary figure counts or pad weak evidence to fill a template.

## Make comparisons easy to see

Begin the comparison section with the shared problem and the key change in one or two plain-language sentences. Use method columns with aligned rows: **original figure; intended solution; information available; key operation; bottleneck addressed; remaining cost or limitation; supporting evidence**. Select rows that reveal the design difference, rather than filling irrelevant cells. Keep original labels and explain how corresponding components map across figures.

Compare the same stage or function on both sides. If methods differ in task, data, supervision, training budget, or evaluation, state that beside the comparison. Separate source-documented limitations from criticisms made only by the target paper. Preserve attribution for each figure and make each independently enlargeable. Use a clearly labeled simplified comparison only as a supplement to the original figures.

End with a short explanation of **what changed, why that change could address the bottleneck, and what tradeoff remains**. If several prior methods matter, use focused comparison pairs or a readable matrix. Never shrink multiple original figures until they become illegible. See [notebook-workflow.md](notebook-workflow.md) for the aligned comparison layout.

## Discuss limitations and creative extensions

Give this discussion its own section with two visible parts: **Where the method is limited** and **What could be extended**. Link each important point to a figure, experiment, assumption, or missing control.

For limitations, explain the affected setting, the consequence for the method, and whether the point is **observed**, **acknowledged by the authors**, or **an inferred concern that needs testing**. Avoid generic criticisms that could apply to any paper.

For each promising extension, explain:

- **Starting point:** the specific limitation, surprising result, or reusable strength motivating the idea.
- **Proposed change:** what module, objective, data, interaction, or application would change, and why that might help.
- **How to test it:** a small experiment, matched baseline/control, and the observation that would support or weaken the idea.
- **Tradeoff and uncertainty:** likely cost, implementation obstacle, or reason it might fail.

Be creative: consider alternative mechanisms, combinations with relevant methods, new settings, or a simpler design suggested by ablations. Label these as **agent-proposed, untested ideas**, not reported results or established novelty. Distinguish a practical next experiment from a more speculative direction when useful. Close with paper-specific questions the reader can debate with an agent, leaving room for their own proposals.
