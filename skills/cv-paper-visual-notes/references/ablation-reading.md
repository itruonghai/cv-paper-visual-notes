# Read experiments for insight

Choose experiments that answer a design or behavior question, not just those with the largest improvement. Useful candidates include component removal, replacement with a simpler mechanism, sensitivity curves, scaling, robustness, generalization, qualitative failures, and the appendix's negative or surprising findings.

For each selected experiment, put the original table or plot close to a concise analysis:

| Element | What to establish |
| --- | --- |
| Question | Which explanation or design choice is being tested? |
| Intervention | Exactly what changed, including training versus inference changes. |
| Control | What stayed fixed? If this is unclear, say so. |
| Observation | Exact reported values, units, metric direction, dataset/split, and table/figure location. |
| Difference | Compute only comparable differences and show what was subtracted. |
| Supported conclusion | The narrow claim justified under this setting. |
| Remaining ambiguity | Alternative explanations, coupled changes, missing controls, variance, or limited scope. |
| Next test | Optional agent proposal with a predicted discriminating result, explicitly unrun. |

Do not turn every item into a large table. A paragraph beside the evidence is often clearer. Use a compact cross-experiment table when it exposes a pattern.

## Technical checks that change interpretation

- **Removal versus replacement:** Does removing a module also change capacity, compute, optimization, losses, or supervision? A matched replacement can be more informative than deletion.
- **Training versus inference:** Was the ablated model retrained? Switching off a trained component at test time measures a different failure than learning without it.
- **Interactions:** Does the table test combinations of components? Marginal improvements depend on the reference configuration. Do not sum gains measured against different baselines.
- **Sensitivity:** Inspect the range and axis scale. A broad plateau supports a different conclusion from a narrow optimum; untested values remain unknown.
- **Scaling and efficiency:** Compare like-for-like budgets. FLOPs, latency, memory, parameters, and training data measure different costs. Hardware and batch size affect latency.
- **Generalization:** Which dataset, domain, category, or corruption is genuinely unseen? Check for tuning on the reported test set when the source explains selection.
- **Qualitative evidence:** Selected images illustrate mechanisms or failures but do not establish their frequency. Read colorbars, thresholds, and selection criteria.
- **Uncertainty:** Use reported seeds, intervals, or standard deviations. If absent, describe a measured difference without inventing statistical certainty.
- **Missing data:** A dash, absent baseline, or failed run is not zero. Keep “not reported” distinct from “no effect.”

## Keep reasoning levels visible

Use plain labels where ambiguity is possible:

- **Authors' claim:** What the text says.
- **Reported evidence:** What the figure, table, or experiment shows.
- **Interpretation:** A plausible explanation consistent with the observation.
- **Open question / proposed test:** What the current evidence does not resolve.

Explain unexpected or negative results with the same care as positive ones. End with the most useful lessons about the model's behavior, not a recital of all table cells.
