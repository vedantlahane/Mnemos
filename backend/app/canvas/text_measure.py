"""
Server-side text measurement for Excalidraw.
Approximates Excalidraw's text rendering with character-width tables.
"""

from __future__ import annotations
import math
import re

# ── Character width tables at fontSize=16 ──

_BASE_WIDTHS = {
    1: 8.4,   # Virgil
    2: 7.8,   # Helvetica
    3: 9.6,   # Cascadia (mono)
    4: 8.0,   # Excalifont
    5: 7.6,   # Nunito
    6: 8.8,   # Lilita One
    7: 8.2,   # Comic Shanns
}

_NARROW = set("iljtfr!|[](){}.,:;'\"1")
_WIDE = set("mwMWOQGD@#%&")


def _char_width(ch: str, base: float) -> float:
    if ch in _NARROW:
        return base * 0.55
    if ch in _WIDE:
        return base * 1.35
    if ch == " ":
        return base * 0.45
    if ch == "\t":
        return base * 1.8
    if ch.isupper():
        return base * 1.1
    return base


def _line_width(text: str, base: float) -> float:
    if not text:
        return 0.0
    return sum(_char_width(ch, base) for ch in text)


def measure_text(
    text: str,
    font_size: int = 16,
    font_family: int = 1,
    max_width: float = 600,
    max_lines: int = 200,
) -> dict:
    """
    Wrap and measure text for Excalidraw.
    Returns: {wrapped_text, width, height, line_count}
    """
    if not text or not text.strip():
        lh = font_size * 1.25
        return {"wrapped_text": "", "width": 20, "height": lh + 4, "line_count": 1}

    scale = font_size / 16.0
    base = _BASE_WIDTHS.get(font_family, 8.0) * scale
    line_height = font_size * 1.25

    paragraphs = text.split("\n")
    all_lines: list[str] = []

    for para in paragraphs:
        if not para.strip():
            all_lines.append("")
            if len(all_lines) >= max_lines:
                break
            continue

        words = para.split(" ")
        current_line = ""
        current_w = 0.0

        for word in words:
            word_w = _line_width(word, base)
            sep = " " if current_line else ""
            sep_w = _line_width(sep, base)

            if current_w + sep_w + word_w <= max_width or not current_line:
                current_line += sep + word
                current_w += sep_w + word_w
            else:
                all_lines.append(current_line)
                if len(all_lines) >= max_lines:
                    break
                current_line = word
                current_w = word_w

        if current_line and len(all_lines) < max_lines:
            all_lines.append(current_line)
        if len(all_lines) >= max_lines:
            break

    if len(all_lines) > max_lines:
        all_lines = all_lines[:max_lines]
        if all_lines:
            all_lines[-1] = all_lines[-1].rstrip() + "…"

    wrapped = "\n".join(all_lines)
    actual_w = max((_line_width(l, base) for l in all_lines), default=20)
    actual_h = len(all_lines) * line_height + 4

    return {
        "wrapped_text": wrapped,
        "width": max(actual_w, 20),
        "height": max(actual_h, line_height + 4),
        "line_count": len(all_lines),
    }


def measure_text_batch(requests: list[dict]) -> list[dict]:
    return [
        measure_text(
            text=r.get("text", ""),
            font_size=r.get("font_size", 16),
            font_family=r.get("font_family", 1),
            max_width=r.get("max_width", 600),
            max_lines=r.get("max_lines", 200),
        )
        for r in requests
    ]