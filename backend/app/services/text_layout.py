# === FILE: backend/app/services/text_layout.py ===
"""
Server-side text measurement — approximates Excalidraw's text layout
without a browser. Uses character-width tables for Excalidraw's fonts.
"""

from __future__ import annotations
import math
import re
import logging

logger = logging.getLogger("mnemos.text_layout")

# ── Character width tables (approximate) ──
# Excalidraw font families: 1=Virgil(hand), 2=Helvetica, 3=Cascadia(mono), 4=Excalifont

# Average character widths at fontSize=16 for each font family
_AVG_CHAR_WIDTHS = {
    1: 8.4,   # Virgil (handwritten) — wider
    2: 7.8,   # Helvetica
    3: 9.6,   # Cascadia (monospace)
    4: 8.0,   # Excalifont
}

# Narrower characters
_NARROW_CHARS = set("iljtfr!|[](){}.,:;'\"")
# Wider characters
_WIDE_CHARS = set("mwMWOQGD@#%&")

_WHITESPACE_RE = re.compile(r"\s+")


def _char_width(ch: str, base_width: float) -> float:
    if ch in _NARROW_CHARS:
        return base_width * 0.55
    if ch in _WIDE_CHARS:
        return base_width * 1.35
    if ch == " ":
        return base_width * 0.45
    if ch.isupper():
        return base_width * 1.1
    return base_width


def _measure_line(text: str, base_width: float) -> float:
    """Measure pixel width of a single line of text."""
    if not text:
        return 0.0
    return sum(_char_width(ch, base_width) for ch in text)


def _font_scale(font_size: int) -> float:
    return font_size / 16.0


def get_font_string(font_size: int, font_family: int) -> str:
    """Build a font identifier string for layout functions."""
    return f"{font_size}:{font_family}"


def _parse_font(font: str) -> tuple[int, int]:
    """Parse 'fontSize:fontFamily' string."""
    parts = font.split(":")
    try:
        return int(parts[0]), int(parts[1]) if len(parts) > 1 else 1
    except (ValueError, IndexError):
        return 16, 1


def layout_single_text(
    text: str,
    font: str,
    max_width: float,
    max_lines: int = 100,
    line_height: float = 20.0,
) -> dict:
    """
    Wrap text to fit within max_width, respecting word boundaries.
    Returns {wrapped_text, width, height, line_count}.
    """
    if not text or not text.strip():
        return {"wrapped_text": "", "width": 20, "height": line_height + 4, "line_count": 1}

    font_size, font_family = _parse_font(font)
    scale = _font_scale(font_size)
    base_width = _AVG_CHAR_WIDTHS.get(font_family, 8.0) * scale

    # Split into paragraphs first (preserve intentional line breaks)
    paragraphs = text.split("\n")
    all_lines: list[str] = []

    for para in paragraphs:
        if not para.strip():
            all_lines.append("")
            continue

        words = para.split(" ")
        current_line = ""
        current_width = 0.0

        for word in words:
            word_width = _measure_line(word, base_width)
            separator = " " if current_line else ""
            sep_width = _measure_line(separator, base_width)

            if current_width + sep_width + word_width <= max_width or not current_line:
                current_line += separator + word
                current_width += sep_width + word_width
            else:
                all_lines.append(current_line)
                if len(all_lines) >= max_lines:
                    break
                current_line = word
                current_width = word_width

        if current_line and len(all_lines) < max_lines:
            all_lines.append(current_line)

        if len(all_lines) >= max_lines:
            break

    # Truncate if over max_lines
    if len(all_lines) > max_lines:
        all_lines = all_lines[:max_lines]
        if all_lines:
            all_lines[-1] = all_lines[-1].rstrip() + "…"

    wrapped_text = "\n".join(all_lines)
    actual_width = max(_measure_line(line, base_width) for line in all_lines) if all_lines else 20
    actual_height = len(all_lines) * line_height + 4  # small padding

    return {
        "wrapped_text": wrapped_text,
        "width": max(actual_width, 20),
        "height": max(actual_height, line_height + 4),
        "line_count": len(all_lines),
    }


def layout_texts(requests: list[dict]) -> list[dict]:
    """Batch layout for multiple text blocks."""
    results = []
    for req in requests:
        text = req.get("text", "")
        font = req.get("font", "16:1")
        max_width = req.get("maxWidth", 600)
        max_lines = req.get("maxLines", 100)
        line_height = req.get("lineHeight", 20.0)
        results.append(layout_single_text(text, font, max_width, max_lines, line_height))
    return results