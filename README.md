# CV Paper Visual Notes

Understand a computer vision paper through its **original figures**, a clear technical walkthrough, and editable notes. Works with **Codex** and **Claude Code**.

The skill creates a portable HTML reading notebook with:

- Motivation, limitations of prior methods, novelty, and the actual method design.
- Insights from official project pages, supplementary material, and accessible author explanation/demo videos, with source links and timestamps.
- Original figures captured from the PDF at **200 DPI by default**, with higher resolution when needed.
- **Side-by-side comparisons** of the target and relevant prior methods.
- Ablations and diagnostics that explain model behavior, with controls and caveats.
- Limitations, creative extensions, and concrete experiments to test those ideas.
- Supplementary diagrams when a workflow is unclear, labeled separately from the paper's original figures.
- Persistent Markdown notes and follow-up discussions.

## Install

Clone the repository using Git, then run the installer with Python 3.9 or newer:

```bash
git clone https://github.com/itruonghai/cv-paper-visual-notes.git
cd cv-paper-visual-notes
```

### Codex

```bash
python3 install.py codex
```

The default destination for a fresh installation is `~/.agents/skills/cv-paper-visual-notes`. If the skill already exists only under `$CODEX_HOME/skills` (normally `~/.codex/skills`), the installer reuses that location instead of creating a second copy. Existing installations require `--update`.

Invoke it in Codex:

```text
$cv-paper-visual-notes Explain this paper: <paper URL or PDF path>
```

Codex also supports installing the shared skill directly through `$skill-installer`:

```text
$skill-installer Install https://github.com/itruonghai/cv-paper-visual-notes/tree/main/skills/cv-paper-visual-notes
```

Local discovery and GitHub installation are documented in the [official Codex skill guide](https://learn.chatgpt.com/docs/build-skills).

### Claude Code

```bash
python3 install.py claude
```

The default destination is `~/.claude/skills/cv-paper-visual-notes`, or the `skills` directory under `CLAUDE_CONFIG_DIR` when configured. The installer adds Claude's argument/path instructions and omits Codex's UI metadata. It does not change tool permissions.

Invoke it in Claude Code:

```text
/cv-paper-visual-notes <paper URL or PDF path> deep
```

This installs a local **Claude Code** skill. The [Claude skill documentation](https://code.claude.com/docs/en/skills) explains local skills, invocation, and the separate setup used by Cowork/cloud sessions.

To use both agents, run both install commands. If a newly installed skill is not visible, start a new conversation or restart the client.

### Choose a different location

`--dest` is the complete skill folder, including its final name:

```bash
python3 install.py codex --dest /path/to/project/.agents/skills/cv-paper-visual-notes
python3 install.py claude --dest /path/to/project/.claude/skills/cv-paper-visual-notes
```

## Runtime setup

Installation itself uses only Python's standard library. Reading papers and capturing figures need an appropriate runtime:

| Task | Dependency |
|---|---|
| Build the notebook | Python 3.9+ |
| Capture PDF pages/crops | Pillow plus Poppler `pdftoppm` or PyMuPDF |
| Locate caption candidates | Poppler `pdftotext` |
| Convert supported LaTeX to MathML | Optional `latex2mathml` |
| Check layout, enlargement, and notes export | Optional Node.js, Playwright, and Chrome/Chromium |

Use existing compatible runtimes if available. Otherwise, an isolated Python environment is convenient:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m pip install latex2mathml  # optional equation conversion
```

On macOS with Homebrew, install Poppler with `brew install poppler`. On other systems, use your package manager. PyMuPDF (`python -m pip install pymupdf`) is an alternative page renderer; caption location still needs Poppler.

Tell the agent to use the absolute path to your chosen Python. You can save local hints in `runtime.local.json` beside the installed `SKILL.md`:

```json
{
  "python": "/absolute/path/to/cv-paper-visual-notes/.venv/bin/python",
  "library_root": "/absolute/path/to/paper-notes"
}
```

These are placeholders: replace them with your actual paths. Optional `node`, `playwright`, and `browser` keys point to an existing Node executable, Playwright module directory, and browser executable. The agent reads these hints; the helpers do not automatically load them. See [the runtime guide](skills/cv-paper-visual-notes/references/runtime.md) for bounded browser checks and exact helper commands.

Use the same `library_root` for both agents to continue the same paper notebook. No existing papers are moved automatically.

## Everyday use

```text
Explain this paper in clear language. Focus on the design choices and the most informative ablations.

Give me a quick reading notebook for <paper>.

Compare its workflow side by side with <prior method>.

The training workflow is unclear. Add an explanatory diagram alongside the original figure.

Continue from /path/to/paper-folder and discuss the questions in notes.md.
```

`deep` is the default full walkthrough. `quick` gives a shorter daily read. A focused request such as explaining one figure stays focused. Output language follows the conversation unless you specify another.

Each paper folder contains:

```text
paper.json       Notebook source and per-paper interface settings
notebook.html    Offline reading view with embedded figures
notes.md         Your durable, editable notes
discussion.md    Follow-up responses, created when needed
sources.json     Figure/source provenance
assets/          Original crops and separately labeled explanatory diagrams
```

Browser edits are local drafts. Download the notes and save them as the paper folder's `notes.md`, or provide the download to your agent. Rebuilding preserves an existing notes file.

## Update

From your cloned repository:

```bash
git pull --ff-only
python3 install.py codex --update
python3 install.py claude --update
```

Run only the command for each agent you use. Include the same `--dest` if you installed to a custom location. Before replacing an installation, the installer backs it up outside the skills discovery directory and prints the backup path. It carries forward `runtime.local.json`; other local customizations remain in the backup for comparison. Paper notebooks and their notes live separately and are not changed by installation.

## Repository structure and branches

Both agents use **one `main` branch** and one shared skill:

```text
skills/cv-paper-visual-notes/  Shared instructions, scripts, references, templates
adapters/claude.md            Small Claude-specific frontmatter and instructions
install.py                   Builds the appropriate local installation
tests/                       Installation and notebook regression checks
```

Change shared behavior once under `skills/cv-paper-visual-notes/`. Keep only host-specific behavior in the adapter. Use short-lived branches for individual changes, and tags when you want to mark releases. Permanent `codex` and `claude` branches would make shared fixes harder to keep synchronized.

Run the checks with:

```bash
python3 -m unittest discover -s tests -v
```

The repository contains the skill and its helpers. Downloaded papers, extracted figures, reading notes, and local runtime configuration belong in your own workspace/library.
