# === FILE: backend/app/canvas/text_measure.py ===

"""
Server-side text measurement for Excalidraw.
Approximates Excalidraw's text rendering with character-width tables.
"""

from __future__ import annotations
import math
import re

# ── Character width tables at fontSize=16 ──
# UPDATED: Measured against actual Excalidraw rendering.
# Previous values were ~30% too small, causing text overflow.

_BASE_WIDTHS = {
    1: 10.8,   # Virgil (handwritten) — was 8.4, way too small
    2: 9.8,    # Helvetica — was 7.8
    3: 9.6,    # Cascadia (mono) — monospace is predictable, OK
    4: 10.2,   # Excalifont — was 8.0
    5: 9.6,    # Nunito — was 7.6
    6: 10.4,   # Lilita One — was 8.8
    7: 10.0,   # Comic Shanns — was 8.2
}

_NARROW = set("iljtfr!|[](){}.,:;'\"1")
_WIDE = set("mwMWOQGD@#%&")


def _char_width(ch: str, base: float) -> float:
    if ch in _NARROW:
        return base * 0.5
    if ch in _WIDE:
        return base * 1.4
    if ch == " ":
        return base * 0.4
    if ch == "\t":
        return base * 1.8
    if ch.isupper():
        return base * 1.15
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
    base = _BASE_WIDTHS.get(font_family, 10.0) * scale
    line_height = font_size * 1.25

    # Safety margin — Excalidraw's actual rendering can be slightly wider
    effective_max_width = max_width * 0.92

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

            # If a single word exceeds max width, force-break it
            if word_w > effective_max_width and not current_line:
                # Break the word into chunks
                chunk = ""
                chunk_w = 0.0
                for ch in word:
                    cw = _char_width(ch, base)
                    if chunk_w + cw > effective_max_width and chunk:
                        all_lines.append(chunk)
                        if len(all_lines) >= max_lines:
                            break
                        chunk = ch
                        chunk_w = cw
                    else:
                        chunk += ch
                        chunk_w += cw
                if chunk and len(all_lines) < max_lines:
                    current_line = chunk
                    current_w = chunk_w
                continue

            sep = " " if current_line else ""
            sep_w = _line_width(sep, base)

            if current_w + sep_w + word_w <= effective_max_width or not current_line:
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
        "width": min(max(actual_w, 20), max_width),  # clamp to max_width
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