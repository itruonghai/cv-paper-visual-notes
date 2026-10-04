"""Protect TeX before HTML/Markdown parsing and typeset it once, at build time."""
import base64
import html
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import uuid

SKILL = Path(__file__).resolve().parents[1]
VENDOR = SKILL / "assets/vendor/katex"
TAG = re.compile(r'''<!--.*?-->|<![^>]*>|<(/?)([A-Za-z][\w:-]*)(?:\s+(?:[^<>"']|"[^"]*"|'[^']*')*)?\s*/?>''', re.S)
SKIP = {"code", "pre", "script", "style", "math", "textarea"}
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}


def escaped(text, position):
    count = 0
    while position > 0 and text[position - 1] == "\\":
        count += 1
        position -= 1
    return count % 2 == 1


def protect_math(text, markdown=False):
    """Leave code and tag attributes alone; math can contain literal < and &."""
    prefix = "CVMATH" + uuid.uuid4().hex.upper()
    output, slots, stack, warnings = [], [], [], []
    index = 0
    while index < len(text):
        if markdown and (index == 0 or text[index - 1] == "\n"):
            fence = re.match(r"[ ]{0,3}(`{3,}|~{3,})[^\n]*(?:\n|$)", text[index:])
            if fence:
                marker = fence[1]
                tail = index + fence.end()
                close = re.search(r"(?m)^[ ]{0,3}" + re.escape(marker[0]) + "{" + str(len(marker)) + r",}[ \t]*(?:\n|$)", text[tail:])
                end = tail + close.end() if close else len(text)
                output.append(text[index:end]); index = end; continue
        if markdown and text[index] == "`" and not escaped(text, index):
            marker = re.match(r"`+", text[index:])[0]
            close = re.search(r"(?<!`)" + re.escape(marker) + r"(?!`)", text[index + len(marker):])
            if close:
                end = index + len(marker) + close.end()
                output.append(text[index:end]); index = end; continue
        if text[index] == "<":
            tag = TAG.match(text, index)
            if tag:
                closing, name = tag[1], (tag[2] or "").lower()
                if closing:
                    for position in range(len(stack) - 1, -1, -1):
                        if stack[position][0] == name:
                            stack = stack[:position]; break
                elif name and name not in VOID and not tag[0].endswith("/>"):
                    # Rendered equations may pass through this parser again when
                    # Markdown sections are embedded. Do not typeset twice.
                    protected = name in SKIP or bool(re.search(r'class=["\'][^"\']*\bpaper-math\b', tag[0]))
                    stack.append((name, protected))
                output.append(tag[0]); index = tag.end(); continue
        if not any(protected for _, protected in stack) and not escaped(text, index):
            opener = next((token for token in ("\\(", "\\[", "$$", "$") if text.startswith(token, index)), None)
            if opener:
                closer = {"\\(": "\\)", "\\[": "\\]", "$$": "$$", "$": "$"}[opener]
                start = index + len(opener)
                end = text.find(closer, start)
                while end >= 0 and escaped(text, end):
                    end = text.find(closer, end + len(closer))
                if end < 0:
                    if opener != "$": warnings.append("Unclosed math delimiter " + opener + "; fix it before delivery.")
                else:
                    expression = text[start:end]
                    # Single dollars remain a compatibility option, with common
                    # currency forms excluded. Prefer explicit \( ... \).
                    currency = opener == "$" and (
                        not expression or expression[0].isspace() or expression[-1].isspace()
                        or "\n" in expression
                        or (end + 1 < len(text) and text[end + 1].isdigit())
                        or bool(TAG.search(expression))
                        or bool(re.fullmatch(r"\d[\d,.]*\s+[A-Za-z\s,;.]+", expression)))
                    if not currency:
                        token = prefix + str(len(slots)) + "END"
                        slots.append({"token": token, "tex": html.unescape(expression) if not markdown else expression,
                                      "display": opener in ("$$", "\\["), "source": text[index:end + len(closer)]})
                        output.append(token); index = end + len(closer); continue
        output.append(text[index]); index += 1
    return "".join(output), slots, warnings


class MathRenderer:
    def __init__(self, mode="auto", node=None, macros=None):
        self.mode, self.node = mode, node
        self.macros = {} if macros is None else macros
        if not isinstance(self.macros, dict) or any(not isinstance(k, str) or not isinstance(v, str) for k, v in self.macros.items()):
            raise ValueError("math_macros must map TeX command names to string expansions from the paper.")
        self.used = False
        self.warnings = []

    def warn(self, message):
        if message not in self.warnings: self.warnings.append(message)

    def executable(self):
        configured = None
        settings = SKILL / "runtime.local.json"
        if settings.exists():
            configured = json.loads(settings.read_text(encoding="utf-8")).get("node")
        node = self.node or os.environ.get("CV_NOTEBOOK_NODE") or configured or shutil.which("node")
        if not node:
            raise ValueError("Math needs Node.js for the bundled KaTeX renderer. Supply --node /absolute/path/to/node; no global package installation is required.")
        return node

    def restore(self, fragment, slots, warnings=()):
        for message in warnings: self.warn(message)
        if warnings and self.mode != "warn": raise ValueError(warnings[0])
        if not slots: return fragment
        if self.mode == "warn":
            self.warn("Unrendered LaTeX remains (math_mode=warn). Use auto for KaTeX or supply a verified equation crop.")
            rendered = [html.escape(slot["source"], quote=False) for slot in slots]
        else:
            payload = {"expressions": [{"tex": slot["tex"], "display": slot["display"]} for slot in slots], "macros": self.macros}
            try:
                result = subprocess.run([self.executable(), str(SKILL / "scripts/render_math.cjs")],
                                        input=json.dumps(payload), text=True, capture_output=True, timeout=20)
            except (OSError, subprocess.TimeoutExpired) as error:
                raise ValueError(f"Cannot run the bundled math renderer: {error}") from error
            if result.returncode:
                raise ValueError("Math renderer failed: " + result.stderr.strip()[:800])
            values = json.loads(result.stdout)["rendered"]
            rendered = []
            for slot, value in zip(slots, values):
                if "error" in value:
                    raise ValueError(f"Cannot render equation {slot['source'][:180]!r}: {value['error']}. Fix the source/macro or use the original equation crop; do not simplify the mathematics to make it compile.")
                kind = "display" if slot["display"] else "inline"
                rendered.append('<span class="paper-math paper-math-' + kind + '" data-latex="' + html.escape(slot["tex"], quote=True) + '">' + value["html"] + '</span>')
            self.used = True
        replacements = {slot["token"]: value for slot, value in zip(slots, rendered)}
        return re.sub("|".join(map(re.escape, replacements)), lambda match: replacements[match[0]], fragment)

    def markdown(self, source):
        try:
            from markdown_it import MarkdownIt
        except ImportError as error:
            raise ValueError("A section.markdown input needs markdown-it-py in the selected Python. Use a compatible runtime or author section.html; do not pass raw Markdown as HTML.") from error
        protected, slots, warnings = protect_math(source, markdown=True)
        # Trusted, agent-authored sections may include figures and details HTML.
        # Reader notes/replies do not enter this HTML-enabled path.
        parsed = MarkdownIt("commonmark", {"html": True}).enable("table").render(protected)
        parsed = parsed.replace("<table>", '<div class="table-scroll"><table>').replace("</table>", "</table></div>")
        return self.restore(parsed, slots, warnings)

    def css(self):
        if not self.used: return ""
        css = (VENDOR / "katex.min.css").read_text(encoding="utf-8")
        def font(match):
            found = re.search(r"url\((?:['\"])?(fonts/[^)'\"]+\.woff2)(?:['\"])?\)", match[0])
            if not found: raise ValueError("Bundled KaTeX CSS contains a font without an offline WOFF2 asset.")
            encoded = base64.b64encode((VENDOR / found[1]).read_bytes()).decode("ascii")
            return 'src:url(data:font/woff2;base64,' + encoded + ') format("woff2")'
        css = re.sub(r"src:[^;}]+", font, css)
        return '<style data-math-renderer="katex-0.19.0">' + css + '</style>'
