"""Validate reader-owned captures without rewriting them; parse linked agent replies."""
import re

ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{0,127}\Z")
ORIGINS = {"notebook-prose", "original-caption", "paper-passage", "user-note", "figure"}


def validate_annotations(data, paper_id, version):
    if not isinstance(data, dict) or type(data.get("schema_version")) is not int or data["schema_version"] != 1:
        raise ValueError("Unsupported annotations.json schema_version; preserve the file and use a compatible reader.")
    if data.get("paper_id") != paper_id or data.get("version") != version:
        raise ValueError("annotations.json belongs to a different paper/version.")
    if not isinstance(data.get("annotations"), list):
        raise ValueError("annotations.json needs an annotations list.")
    ids = set()
    for item in data["annotations"]:
        if not isinstance(item, dict) or not isinstance(item.get("id"), str) or not ID.fullmatch(item["id"]) or item["id"] in ids:
            raise ValueError("Annotation IDs must be unique and portable.")
        ids.add(item["id"])
        for key in ("section_id", "section_title", "content_revision", "comment", "created_at", "updated_at"):
            if not isinstance(item.get(key), str):
                raise ValueError(f"Annotation {item['id']} needs string {key}.")
        if item.get("kind") not in ("text", "figure") or item.get("status") not in ("open", "resolved", "archived"):
            raise ValueError("Unknown annotation kind/status; preserve the original file.")
        if not isinstance(item.get("tags"), list) or any(not isinstance(tag, str) for tag in item["tags"]):
            raise ValueError("Annotation tags must be strings.")
        source = item.get("source")
        if not isinstance(source, dict) or source.get("kind") not in ORIGINS or not isinstance(source.get("ref"), str):
            raise ValueError("Annotation needs an explicit source kind and reference.")
        target = item.get("target")
        fields = ("exact", "prefix", "suffix") if item["kind"] == "text" else ("figure_id", "fingerprint", "caption")
        if not isinstance(target, dict) or any(not isinstance(target.get(field), str) for field in fields):
            raise ValueError("Incomplete annotation target.")
        if item["kind"] == "text" and not target["exact"]:
            raise ValueError("A text annotation must retain its exact selected text.")
    return data


def discussion_replies(text):
    """Reply bodies stay plain Markdown, never executable publisher/reader HTML."""
    pattern = re.compile(r"^<!-- annotation: ([A-Za-z0-9][A-Za-z0-9_-]{0,127}) -->\s*$", re.M)
    matches = list(pattern.finditer(text))
    replies = {}
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        replies.setdefault(match[1], []).append(text[match.end():end].strip())
    return replies
