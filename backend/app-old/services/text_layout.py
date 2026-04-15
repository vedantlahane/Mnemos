# === FILE: backend/app/services/text_layout.py ===

import json
import subprocess
import os
import logging
import math
import re
import textwrap

logger = logging.getLogger("mnemos.text_layout")

SCRIPT_PATH = os.path.join(os.path.dirname(__file__), "text_measure.mjs")


def _parse_font_size(font: str | None, default: float = 16.0) -> float:
    if not isinstance(font, str):
        return default
    m = re.search(r"(\d+(?:\.\d+)?)px", font)
    if not m:
        return default
    try:
        size = float(m.group(1))
        return size if size > 0 else default
    except Exception:
        return default


def _fallback_wrap(req: dict) -> dict:
    text = str(req.get("text") or "")
    if not text.strip():
        return {"wrapped_text": "", "width": 20, "height": 24}

    max_width = float(req.get("maxWidth") or 600)
    line_height = float(req.get("lineHeight") or 20)
    max_lines = int(req.get("maxLines") or 100)
    font_size = _parse_font_size(req.get("font"))

    # Approximate average glyph width for sans/handwritten UI fonts.
    char_px = max(4.0, font_size * 0.55)
    max_chars = max(1, int(max_width / char_px))

    wrapped_lines: list[str] = []
    for paragraph in text.replace("\r", "").split("\n"):
        if paragraph == "":
            wrapped_lines.append("")
            continue

        lines = textwrap.wrap(
            paragraph,
            width=max_chars,
            break_long_words=True,
            break_on_hyphens=False,
        )
        wrapped_lines.extend(lines or [paragraph])

    if max_lines > 0 and len(wrapped_lines) > max_lines:
        wrapped_lines = wrapped_lines[:max_lines]
        if wrapped_lines:
            tail = wrapped_lines[-1].rstrip()
            wrapped_lines[-1] = (tail[: max(0, len(tail) - 3)] + "...") if len(tail) > 3 else (tail + "...")

    wrapped_text = "\n".join(wrapped_lines)
    max_line_chars = max((len(line) for line in wrapped_lines), default=1)
    est_width = min(max_width, max(20.0, math.ceil(max_line_chars * char_px)))
    est_height = max(24.0, math.ceil(max(1, len(wrapped_lines)) * line_height))

    return {
        "wrapped_text": wrapped_text,
        "width": est_width,
        "height": est_height,
    }


def layout_texts(requests: list[dict]) -> list[dict]:
    if not requests:
        return []
    try:
        proc = subprocess.run(
            ["node", SCRIPT_PATH],
            input=json.dumps(requests),
            text=True,
            capture_output=True,
            check=True,
            timeout=5,
        )
        return json.loads(proc.stdout)
    except Exception as e:
        logger.warning(f"Text layout error: {e}")
        return [_fallback_wrap(req) for req in requests]


def layout_single_text(text: str, font: str, max_width: float, max_lines: int, line_height: float) -> dict:
    req = {
        "text": text,
        "font": font,
        "maxWidth": max_width,
        "maxLines": max_lines,
        "lineHeight": line_height,
    }
    return layout_texts([req])[0]