# === FILE: backend/app/services/text_layout.py ===

import json
import subprocess
import os
import logging

logger = logging.getLogger("mnemos.text_layout")

SCRIPT_PATH = os.path.join(os.path.dirname(__file__), "text_measure.mjs")


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
        return [
            {"wrapped_text": req.get("text", ""), "width": 100, "height": 100}
            for req in requests
        ]


def layout_single_text(text: str, font: str, max_width: float, max_lines: int, line_height: float) -> dict:
    req = {
        "text": text,
        "font": font,
        "maxWidth": max_width,
        "maxLines": max_lines,
        "lineHeight": line_height,
    }
    return layout_texts([req])[0]