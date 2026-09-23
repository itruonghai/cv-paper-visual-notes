#!/usr/bin/env python3
"""Build an offline visual notebook from trusted, locally authored paper.json.

Uses only the Python standard library. Preserves any existing notes.md verbatim.
Section HTML is authored by the agent; this is not an untrusted HTML sanitizer.
"""
import argparse
import hashlib
import html
import json
from pathlib import Path
import re
from urllib.parse import urlparse


SKILL_DIR = Path(__file__).resolve().parents[1]
# Import sibling support even when loaded via importlib from another working directory.
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
from notebook_html import NotebookHTML


def embed_images(fragment, root):
    return NotebookHTML(root, math_mode="warn").finish(fragment)


def build(source, strict=False):
    source = source.resolve(strict=True)
    root = source.parent
    data = json.loads(source.read_text(encoding="utf-8"))
    for field in ("paper_id", "title", "version", "summary"):
        if not isinstance(data.get(field), str) or not data[field].strip():
            raise ValueError(f"Missing nonempty string field: {field}")
    source_url = data.get("source_url", "")
    if not isinstance(source_url, str) or (source_url and urlparse(source_url).scheme not in ("https", "http")):
        raise ValueError("source_url must be an HTTP(S) link to the paper.")
    source_label = source_url or data.get("source_label", "User-provided PDF; see sources.json")
    sections = data.get("sections")
    if not isinstance(sections, list) or not sections:
        raise ValueError("Provide at least one section.")
    warnings = []
    math_mode = data.get("math_mode", "auto")
    if math_mode not in ("auto", "warn"):
        raise ValueError("math_mode must be auto or warn.")
    image_paths = set()
    identifiers = set()
    navigation, content = [], []
    for section in sections:
        identifier = section["id"]
        if not re.fullmatch(r"[a-z][a-z0-9-]*", identifier) or identifier in identifiers or identifier == "reader-notes":
            raise ValueError(f"Section ID must be unique and lowercase hyphenated: {identifier}")
        identifiers.add(identifier)
        title = html.escape(section["title"])
        parser = NotebookHTML(root, math_mode=math_mode)
        fragment = parser.finish(section["html"])
        image_paths.update(parser.images)
        warnings.extend(f"{identifier}: {warning}" for warning in parser.warnings)
        navigation.append(f'<a href="#{identifier}">{title}</a>')
        content.append(f'<section class="chapter" id="{identifier}"><h2>{title}</h2>{fragment}</section>')
    mode = data.get("mode", "deep")
    if mode not in ("quick", "deep", "focused"):
        raise ValueError("mode must be quick, deep, or focused.")
    if mode != "focused":
        for kind, words in (("comparison", ("compar", "prior-method")), ("limitations", ("limit", "extension"))):
            if not any(section.get("kind") == kind or any(word in section["id"] for word in words) for section in sections):
                warnings.append(f"Missing {kind} section. Set section.kind explicitly for custom IDs; use mode=focused for a deliberately narrow request.")
    sources_path = root / "sources.json"
    sources = json.loads(sources_path.read_text(encoding="utf-8")) if sources_path.exists() else {"paper": {"title": data["title"], "version": data["version"], "source_url": source_url}, "figures": []}
    if not isinstance(sources, dict) or not isinstance(sources.get("figures", []), list):
        raise ValueError("sources.json must be an object with a figures list.")
    records = sources.setdefault("figures", [])
    for path in sorted(image_paths):
        relative = path.relative_to(root).as_posix()
        # Legacy basename-only records are safe only when the basename is unique.
        aliases = {relative}
        if sum(other.name == path.name for other in image_paths) == 1:
            aliases.add(path.name)
        matches = [record for record in records if isinstance(record, dict) and record.get("file") in aliases]
        sidecar = path.with_suffix(".json")
        if sidecar.exists():
            provenance = json.loads(sidecar.read_text(encoding="utf-8"))
            if not isinstance(provenance, dict):
                raise ValueError(f"Provenance sidecar must be an object: {sidecar}")
            if not matches:
                matches = [{"file": relative}]
                records.extend(matches)
            matches[0]["extraction"] = provenance
        elif not matches:
            warnings.append(f"No provenance for {relative}: supply its sidecar or an entry in sources.json.")
    defaults = json.loads((SKILL_DIR / "assets/ui-strings.json").read_text(encoding="utf-8"))
    overrides = data.get("ui_strings", {})
    if not isinstance(overrides, dict) or any(not isinstance(value, str) for value in overrides.values()):
        raise ValueError("ui_strings must be an object containing string values.")
    unknown = set(overrides) - set(defaults)
    if unknown:
        raise ValueError("Unknown UI string keys: " + ", ".join(sorted(unknown)))
    ui = dict(defaults, **overrides)
    if not data.get("language", "en").lower().startswith("en") and set(overrides) != set(defaults):
        warnings.append("Some interface strings fall back to English; provide per-paper ui_strings to translate them.")
    if strict and warnings:
        raise ValueError("Notebook lint failed:\n- " + "\n- ".join(warnings))
    notes_path = root / "notes.md"
    if notes_path.exists():
        notes = notes_path.read_text(encoding="utf-8")
    else:
        notes = data.get("notes_seed", (SKILL_DIR / "assets/notes-template.md").read_text(encoding="utf-8"))
        replacements = {key.upper(): data[key] for key in ("title", "paper_id", "version")}
        replacements["SOURCE_URL"] = source_label
        notes = re.sub(r"\{\{([A-Z_]+)\}\}", lambda match: replacements.get(match.group(1), match.group(0)), notes)
    seed = {"paperId": data["paper_id"], "version": data["version"], "notes": notes,
            "notesHash": hashlib.sha256(notes.encode("utf-8")).hexdigest(), "ui": ui}
    substitutions = {
        "TITLE": html.escape(data["title"]), "VERSION": html.escape(data["version"]),
        "SOURCE_LINK": (f'<a href="{html.escape(source_url, quote=True)}" target="_blank" rel="noopener">{html.escape(ui["read_source"])}</a>'
                        if source_url else html.escape(source_label)),
        "LANGUAGE": html.escape(data.get("language", "en"), quote=True),
        "SUMMARY": html.escape(data["summary"]), "NAV": "\n".join(navigation),
        "CONTENT": "\n".join(content),
        "SEED": json.dumps(seed, ensure_ascii=True).replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026"),
    }
    substitutions.update({"UI_" + key.upper(): html.escape(value, quote=True) for key, value in ui.items()})
    template = (SKILL_DIR / "assets/notebook-template.html").read_text(encoding="utf-8")
    notebook = re.sub(r"\{\{([A-Z_]+)\}\}", lambda match: substitutions[match.group(1)], template)
    output = root / "notebook.html"
    if not notes_path.exists():
        with notes_path.open("x", encoding="utf-8") as file:
            file.write(notes)
    output.write_text(notebook, encoding="utf-8")
    sources_path.write_text(json.dumps(sources, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return {"notebook": str(output), "notes": str(notes_path), "sections": len(sections), "warnings": list(dict.fromkeys(warnings))}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("paper_json", type=Path)
    parser.add_argument("--strict", action="store_true", help="Fail before writing when lint warnings remain")
    args = parser.parse_args()
    try:
        result = build(args.paper_json, strict=args.strict)
        for warning in result["warnings"]:
            print("Warning: " + warning, file=sys.stderr)
        print(json.dumps(result))
    except (ValueError, KeyError, OSError, TypeError) as error:
        parser.exit(1, f"Cannot build notebook: {error}\n")


if __name__ == "__main__":
    main()
