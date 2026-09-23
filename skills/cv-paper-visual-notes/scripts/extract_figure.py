#!/usr/bin/env python3
"""Render a PDF page, then crop without changing its scientific content.

Requires Pillow and either PyMuPDF or the pdftoppm executable (Poppler).
Coordinates refer to the displayed page, including page rotation.
"""
import argparse
import hashlib
import io
import json
import math
from pathlib import Path
import shutil
import subprocess
import tempfile
import sys


def sha256_file(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pdf", type=Path)
    parser.add_argument("--page", type=int, required=True, help="One-based PDF page")
    boxes = parser.add_mutually_exclusive_group()
    boxes.add_argument("--bbox", type=float, nargs=4, default=[0, 0, 1, 1],
                        metavar=("LEFT", "TOP", "RIGHT", "BOTTOM"))
    boxes.add_argument("--bbox-pixels", type=int, nargs=4, help="Crop coordinates on the rendered full-page image")
    parser.add_argument("--page-image", type=Path, help="Reuse a full-page PNG and provenance sidecar from this helper")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--source-url", default="")
    parser.add_argument("--label", default="")
    parser.add_argument("--dpi", type=int, default=200,
                        help="PDF capture resolution (default: 200; use 300 or higher for blurry labels or dense figures)")
    parser.add_argument("--overwrite", action="store_true")
    args = parser.parse_args()
    if args.page < 1 or not 36 <= args.dpi <= 600:
        parser.error("Page must be positive; DPI must be between 36 and 600.")
    left, top, right, bottom = args.bbox
    if not (all(math.isfinite(v) for v in args.bbox)
            and 0 <= left < right <= 1 and 0 <= top < bottom <= 1):
        parser.error("Bounding box must satisfy 0 <= left < right <= 1 and 0 <= top < bottom <= 1.")
    if args.output.suffix.lower() != ".png":
        parser.error("Output must have a .png extension.")
    sidecar = args.output.with_suffix(".json")
    if not args.overwrite and (args.output.exists() or sidecar.exists()):
        parser.error("Output already exists; use a different name or --overwrite.")
    try:
        from PIL import Image
    except ImportError:
        parser.error("Pillow is required. Use a Python runtime with Pillow installed.")
    try:
        import fitz
    except ImportError:
        fitz = None
    args.pdf = args.pdf.resolve(strict=True)
    digest = sha256_file(args.pdf)
    if args.page_image is not None:
        cached = json.loads(args.page_image.with_suffix(".json").read_text(encoding="utf-8"))
        if (cached.get("source_sha256") != digest or cached.get("pdf_page_1_based") != args.page
                or cached.get("bbox_normalized") != [0, 0, 1, 1]):
            parser.error("Cached image must be a full-page render of this PDF and page.")
        if cached["render_dpi"] < args.dpi:
            parser.error(f"Cached page is {cached['render_dpi']} DPI, below the requested {args.dpi} DPI. Re-render the full page at the requested DPI and select pixel coordinates on the new image.")
        args.dpi = cached["render_dpi"]
        with Image.open(args.page_image) as rendered:
            page_image = rendered.convert("RGB")
        if list(page_image.size) != cached.get("displayed_page_pixels"):
            parser.error("Cached image dimensions do not match its provenance.")
        renderer = cached["renderer"] + " (cached full page)"
    elif fitz is not None:
        with fitz.open(args.pdf) as document:
            if args.page > len(document):
                parser.error(f"PDF has only {len(document)} pages.")
            pixels = document[args.page - 1].get_pixmap(dpi=args.dpi, alpha=False)
            page_image = Image.open(io.BytesIO(pixels.tobytes("png"))).convert("RGB")
        renderer = "PyMuPDF"
    else:
        executable = shutil.which("pdftoppm")
        if executable is None:
            parser.error("Use a runtime with PyMuPDF, or put Poppler's pdftoppm on PATH.")
        with tempfile.TemporaryDirectory(prefix="paper-figure-") as directory:
            prefix = str(Path(directory) / "page")
            subprocess.run([executable, "-f", str(args.page), "-l", str(args.page),
                            "-singlefile", "-r", str(args.dpi), "-png", str(args.pdf), prefix],
                           check=True, capture_output=True, timeout=45)
            with Image.open(prefix + ".png") as rendered:
                page_image = rendered.convert("RGB")
        renderer = "Poppler pdftoppm"
    width, height = page_image.size
    if args.bbox_pixels is not None:
        x0, y0, x1, y1 = args.bbox_pixels
        if not (0 <= x0 < x1 <= width and 0 <= y0 < y1 <= height):
            parser.error(f"Pixel box must fit within the {width}x{height} page image.")
        left, top, right, bottom = x0 / width, y0 / height, x1 / width, y1 / height
        args.bbox = [left, top, right, bottom]
    pixel_box = [math.floor(left * width), math.floor(top * height),
                 math.ceil(right * width), math.ceil(bottom * height)]
    if args.bbox_pixels is not None:
        pixel_box = args.bbox_pixels
    crop = page_image.crop(pixel_box)
    metadata = {
        "kind": "original-pdf-crop", "label": args.label,
        "source_url": args.source_url, "source_pdf": str(args.pdf),
        "source_sha256": digest, "pdf_page_1_based": args.page,
        "bbox_normalized": args.bbox, "bbox_pixels": pixel_box,
        "render_dpi": args.dpi, "renderer": renderer,
        "displayed_page_pixels": [width, height],
        "image_pixels": list(crop.size), "image_file": args.output.name,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    crop.save(args.output, format="PNG", dpi=(args.dpi, args.dpi))
    sidecar.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"image": str(args.output.resolve()), "provenance": str(sidecar.resolve())}))


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as error:
        details = (error.stderr or b"").decode("utf-8", errors="replace").strip()
        sys.exit("Cannot render PDF page: " + (details or "renderer failed; check the page number and PDF."))
    except subprocess.TimeoutExpired:
        sys.exit("PDF rendering exceeded 45 seconds. Check this PDF/page or use another installed renderer.")
    except (OSError, ValueError, KeyError) as error:
        sys.exit("Cannot extract figure: " + str(error))
