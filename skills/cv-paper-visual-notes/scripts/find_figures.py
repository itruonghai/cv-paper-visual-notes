#!/usr/bin/env python3
"""Suggest caption locations and conservative crop regions; visual confirmation is required.

Uses Poppler pdftotext. Text locations are not reliable figure boundaries.
"""
import argparse
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import xml.etree.ElementTree as ET

CAPTION = re.compile(r"^(Figure|Fig\.?|Table)\s+([A-Z]?\d+(?:\.\d+)*|[IVX]+)\s*[:.]", re.I)


def locate(pdf, page=None):
    executable = shutil.which("pdftotext")
    if not executable:
        raise ValueError("pdftotext is required; use an installed Poppler runtime.")
    command = [executable, "-bbox-layout", "-enc", "UTF-8"]
    if page:
        command += ["-f", str(page), "-l", str(page)]
    command += [str(pdf), "-"]
    result = subprocess.run(command, capture_output=True, check=True, timeout=30)
    # Some PDF glyph mappings emit XML-forbidden control characters (including
    # the ViT v2 PDF). Drop only those characters, and report that normalization.
    xml, removed = re.subn(r"[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]", "", result.stdout.decode("utf-8"))
    document = ET.fromstring(xml)
    ns = {"x": "http://www.w3.org/1999/xhtml"}
    candidates = []
    for index, element in enumerate(document.findall(".//x:page", ns), start=page or 1):
        width, height = float(element.attrib["width"]), float(element.attrib["height"])
        for block in element.findall(".//x:block", ns):
            lines = block.findall("x:line", ns)
            for start, line in enumerate(lines):
                words = line.findall("x:word", ns)
                first = " ".join("".join(word.itertext()) for word in words)
                match = CAPTION.match(first)
                if not match:
                    continue
                # Preserve the rest of this text block, including multiline captions.
                # Oversized proposals are safer than silently cutting the final line.
                tail = lines[start:]
                text = " ".join(" ".join("".join(word.itertext()) for word in item.findall("x:word", ns)) for item in tail)
                box = [min(float(item.attrib["xMin"]) for item in tail),
                       min(float(item.attrib["yMin"]) for item in tail),
                       max(float(item.attrib["xMax"]) for item in tail),
                       max(float(item.attrib["yMax"]) for item in tail)]
                is_table = match.group(1).lower() == "table"
                # This deliberately proposes a broad region, not a claimed detector.
                left, right = max(0, box[0] / width - .02), min(1, box[2] / width + .02)
                top, bottom = ((max(0, box[1] / height - .01), .98) if is_table
                               else (.02, min(1, box[3] / height + .01)))
                candidates.append({"label": ("Table" if is_table else "Figure") + " " + match.group(2),
                                   "pdf_page_1_based": index, "caption_text_candidate": text,
                                   "caption_bbox_normalized": [box[0] / width, box[1] / height, box[2] / width, box[3] / height],
                                   "bbox_proposal": [left, top, right, bottom],
                                   "status": "needs-visual-confirmation",
                                   "note": "Caption anchor only. Inspect the full page; figure/table direction, columns, caption grouping, and boundaries may differ."})
    return {"source_pdf": str(pdf), "candidates": candidates,
            "removed_xml_control_characters": removed,
            "renderer_diagnostics": result.stderr.decode("utf-8", errors="replace").strip(),
            "warning": "Proposals are not verified figure crops. Scanned PDFs and nonstandard captions may yield no candidates."}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pdf", type=Path)
    parser.add_argument("--page", type=int)
    parser.add_argument("--output", type=Path, help="Optional JSON output; otherwise print")
    args = parser.parse_args()
    if args.page is not None and args.page < 1:
        parser.error("Page must be positive.")
    try:
        result = locate(args.pdf.resolve(strict=True), args.page)
        text = json.dumps(result, indent=2, ensure_ascii=False) + "\n"
        if args.output:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(text, encoding="utf-8")
            print(json.dumps({"output": str(args.output.resolve()), "candidates": len(result["candidates"])}))
        else:
            print(text, end="")
    except subprocess.CalledProcessError as error:
        parser.exit(1, "Cannot locate captions: " + error.stderr.decode("utf-8", errors="replace").strip() + "\n")
    except subprocess.TimeoutExpired:
        parser.exit(1, "Caption search exceeded 30 seconds; inspect a smaller page range.\n")
    except (OSError, ValueError, ET.ParseError) as error:
        parser.exit(1, "Cannot locate captions: " + str(error) + "\n")


if __name__ == "__main__":
    main()
