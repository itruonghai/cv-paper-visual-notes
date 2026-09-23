"""Parse authored HTML, embed figure assets, and flag evidence/markup omissions."""
import base64
import html
from html.parser import HTMLParser
import re
from urllib.parse import unquote, urlparse

IMAGE_MIMES = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
               ".webp": "image/webp", ".svg": "image/svg+xml"}
MATH = re.compile(r"(?<!\\)(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\$[^$\n]+?\$)")
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}


class NotebookHTML(HTMLParser):
    def __init__(self, root, math_mode="auto"):
        super().__init__(convert_charrefs=False)
        self.root = root.resolve()
        self.output, self.images, self.warnings, self.figures, self.stack = [], [], [], [], []
        self.pending_text = []
        self.math_mode = math_mode

    def warn(self, text):
        if text not in self.warnings:
            self.warnings.append(text)

    def handle_starttag(self, tag, attrs):
        self.flush_text()
        attributes = dict(attrs)
        if tag == "figure":
            self.figures.append({"caption": False, "source": False, "text": False, "images": []})
        if self.figures:
            if tag == "figcaption":
                self.figures[-1]["caption"] = True
            if tag == "a" and attributes.get("href"):
                self.figures[-1]["source"] = True
        if tag == "img":
            if not attributes.get("src") or not attributes.get("alt", "").strip():
                raise ValueError("Every image needs a src and meaningful alt text.")
            if len([k for k, _ in attrs if k == "src"]) != 1:
                raise ValueError("An image must have exactly one src attribute.")
            if attributes.get("srcset"):
                raise ValueError("Use a single local image src; remove srcset for an offline notebook.")
            source = attributes["src"]
            parsed = urlparse(source)
            if parsed.scheme or parsed.netloc or parsed.query or parsed.fragment:
                raise ValueError(f"Use a local image beneath the paper folder: {source}")
            path = (self.root / unquote(parsed.path)).resolve(strict=True)
            if not path.is_relative_to(self.root) or path.suffix.lower() not in IMAGE_MIMES:
                raise ValueError(f"Expected PNG/JPEG/WebP/SVG beneath the paper folder: {source}")
            self.images.append(path)
            if self.figures:
                self.figures[-1]["images"].append(source)
            else:
                self.warn(f"Image {source} is outside a figure; add a caption and attribution.")
            # The HTML parser handles > inside quoted attributes. Source bytes,
            # including SVG paths and stroke styles, are embedded unchanged.
            uri = "data:" + IMAGE_MIMES[path.suffix.lower()] + ";base64," + base64.b64encode(path.read_bytes()).decode("ascii")
            attrs = [(key, uri if key == "src" else value) for key, value in attrs]
            rendered = " ".join(key if value is None else f'{key}="{html.escape(value, quote=True)}"' for key, value in attrs)
            self.output.append("<img " + rendered + ">")
        else:
            self.output.append(self.get_starttag_text())
        if tag not in VOID:
            self.stack.append(tag)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        self.flush_text()
        if tag == "figure" and self.figures:
            figure = self.figures.pop()
            label = ", ".join(figure["images"]) or "unnamed figure"
            if not figure["caption"] or not figure["text"]:
                self.warn(f"Figure {label} has no meaningful figcaption.")
            if not figure["source"]:
                self.warn(f"Figure {label} has no source link; add one or identify a supplied local source in its caption/provenance.")
        if tag in self.stack:
            self.stack = self.stack[:len(self.stack) - 1 - self.stack[::-1].index(tag)]
        self.output.append(f"</{tag}>")

    def handle_data(self, text):
        self.pending_text.append(text)

    def flush_text(self):
        text = "".join(self.pending_text)
        self.pending_text.clear()
        if not text:
            return
        if self.figures and "figcaption" in self.stack and text.strip():
            self.figures[-1]["text"] = True
        if any(tag in self.stack for tag in ("code", "pre", "script", "style", "math")):
            self.output.append(text)
            return

        def convert(match):
            token = match.group(0)
            display = token.startswith(("$$", "\\["))
            expression = token[2:-2] if token.startswith(("$$", "\\[", "\\(")) else token[1:-1]
            # Avoid treating ordinary currency prose such as "$5 and $10" as math.
            if token.startswith("$") and not display and re.fullmatch(r"\d[\d,.]*\s+[A-Za-z\s]+", expression):
                return token
            if self.math_mode == "auto":
                try:
                    from latex2mathml.converter import convert as to_mathml
                    return to_mathml(html.unescape(expression), display="block" if display else "inline")
                except ImportError:
                    pass
                except Exception as error:
                    self.warn(f"Math conversion failed ({type(error).__name__}); inspect this equation.")
            self.warn("Unrendered LaTeX remains. Use an equation crop, MathML, or optional latex2mathml in this Python runtime.")
            return token

        self.output.append(MATH.sub(convert, text))

    def handle_entityref(self, name):
        self.pending_text.append("&" + name + ";")

    def handle_charref(self, name):
        self.pending_text.append("&#" + name + ";")

    def handle_comment(self, data):
        self.flush_text()
        self.output.append("<!--" + data + "-->")

    def handle_decl(self, decl):
        self.flush_text()
        self.output.append("<!" + decl + ">")

    def finish(self, fragment):
        self.feed(fragment)
        self.close()
        self.flush_text()
        if self.figures:
            self.warn("Unclosed figure element; inspect the section HTML.")
        return "".join(self.output)
