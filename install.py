#!/usr/bin/env python3
"""Install the shared skill for Codex or Claude Code using Python 3.9+."""
import argparse
from datetime import datetime, timezone
import os
from pathlib import Path
import shutil
import tempfile
import uuid

ROOT = Path(__file__).resolve().parent
NAME = "cv-paper-visual-notes"
SOURCE = ROOT / "skills" / NAME


def split_skill(text):
    if not text.startswith("---\n"):
        raise ValueError("Skill must start with YAML frontmatter.")
    frontmatter, separator, body = text[4:].partition("\n---\n")
    if not separator:
        raise ValueError("Skill frontmatter is not closed.")
    return frontmatter, body.lstrip("\n")


def claude_entrypoint():
    metadata, body = split_skill((SOURCE / "SKILL.md").read_text(encoding="utf-8"))
    extra, preamble = split_skill((ROOT / "adapters/claude.md").read_text(encoding="utf-8"))
    heading, separator, remainder = body.partition("\n\n")
    if not separator or not heading.startswith("# "):
        raise ValueError("Expected a title at the start of the shared skill.")
    return f"---\n{metadata}\n{extra}\n---\n\n{heading}\n\n{preamble.rstrip()}\n\n{remainder}"


def default_destination(target):
    if target == "claude":
        return Path(os.environ.get("CLAUDE_CONFIG_DIR", str(Path.home() / ".claude"))) / "skills" / NAME
    current = Path.home() / ".agents" / "skills" / NAME
    legacy = Path(os.environ.get("CODEX_HOME", str(Path.home() / ".codex"))) / "skills" / NAME
    if legacy.exists() and not current.exists():
        return legacy
    return current


def install(target, destination, update=False):
    destination = destination.expanduser().absolute()
    if destination.name != NAME:
        raise ValueError(f"Destination must be the skill folder ending in /{NAME}.")
    if destination.is_symlink():
        raise ValueError("Destination is a symlink. Update its source explicitly instead of replacing it.")
    resolved = destination.resolve()
    if resolved == SOURCE or resolved.is_relative_to(SOURCE) or SOURCE.is_relative_to(resolved):
        raise ValueError("Installation destination must not overlap the shared source.")
    if destination.exists():
        if not destination.is_dir() or not (destination / "SKILL.md").is_file():
            raise ValueError("Destination is not an existing skill directory.")
        if not update:
            raise ValueError(f"Skill already exists at {destination}. Use --update to back it up and replace it.")
    # Prepare the complete new skill before changing an existing installation.
    destination.parent.mkdir(parents=True, exist_ok=True)
    backup = None
    with tempfile.TemporaryDirectory(prefix=".cv-paper-install-", dir=destination.parent) as temp:
        staged = Path(temp) / NAME
        shutil.copytree(SOURCE, staged, ignore=shutil.ignore_patterns("__pycache__", "*.pyc", "runtime.local.json"))
        if target == "claude":
            shutil.rmtree(staged / "agents", ignore_errors=True)
            (staged / "SKILL.md").write_text(claude_entrypoint(), encoding="utf-8")
        local_config = destination / "runtime.local.json"
        if local_config.is_file():
            shutil.copy2(local_config, staged / local_config.name)
        if destination.exists():
            stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
            backup = destination.parent.parent / "skill-backups" / f"{NAME}-{stamp}-{uuid.uuid4().hex[:8]}"
            backup.parent.mkdir(parents=True, exist_ok=True)
            destination.rename(backup)
        try:
            staged.rename(destination)
        except OSError:
            if backup is not None and not destination.exists():
                backup.rename(destination)
            raise
    return destination, backup


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("target", choices=("codex", "claude"))
    parser.add_argument("--dest", type=Path, help="Exact installed skill folder; must end in cv-paper-visual-notes")
    parser.add_argument("--update", action="store_true", help="Back up and replace an existing installation; preserve runtime.local.json")
    args = parser.parse_args()
    try:
        destination, backup = install(args.target, args.dest or default_destination(args.target), args.update)
    except (OSError, ValueError) as error:
        parser.exit(1, f"Cannot install skill: {error}\n")
    print(f"Installed {args.target} skill: {destination}")
    if backup is not None:
        print(f"Previous installation: {backup}")
    print("Start a new conversation if the skill is not visible yet.")


if __name__ == "__main__":
    main()
