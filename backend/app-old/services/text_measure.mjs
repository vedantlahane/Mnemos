import fs from 'fs';
import { createCanvas, GlobalFonts } from 'canvas';

// Pretext needs OffscreenCanvas. Polyfill it with node-canvas
global.OffscreenCanvas = class {
  constructor(w, h) { return createCanvas(w, h); }
};

import { prepare, layoutWithLines } from '@chenglou/pretext';

function processRequests() {
  const input = fs.readFileSync(0, 'utf-8');
  if (!input.trim()) return;

  let requests;
  try {
    requests = JSON.parse(input);
  } catch (e) {
    console.error(JSON.stringify([{ error: 'Invalid JSON input' }]));
    return;
  }

  const responses = requests.map(req => {
    try {
      const { text, font, maxWidth, maxLines, lineHeight } = req;
      
      const safeText = (text || '').replace(/\r/g, ''); // pretext sometimes hates carriage returns
      if (!safeText.trim()) {
        return { wrapped_text: '', width: 20, height: 24 };
      }

      const prepared = prepare(safeText, font);
      // Pretext's layoutWidth is tight.
      const result = layoutWithLines(prepared, maxWidth, lineHeight);
      
      let lines = result.lines.slice(0, maxLines);
      let outText = lines.map(l => l.text).join('\n');
      
      if (result.lines.length > maxLines) {
        const lastLineIndex = lines.length - 1;
        const lastLineText = lines[lastLineIndex].text;
        
        let newLastLine = lastLineText;
        if (newLastLine.length > 3) {
            newLastLine = newLastLine.slice(0, -3) + "...";
        } else {
            newLastLine += "...";
        }
        
        const textParts = outText.split('\n');
        textParts[textParts.length - 1] = newLastLine;
        outText = textParts.join('\n');
      }

      const calcWidth = Math.max(...lines.map(l => l.width), 30);
      const calcHeight = Math.max(24, lines.length * lineHeight);

      return {
        wrapped_text: outText,
        width: Math.ceil(calcWidth),
        height: Math.ceil(calcHeight)
      };
    } catch (e) {
      return { wrapped_text: req.text, width: 200, height: 100, error: e.message };
    }
  });

  console.log(JSON.stringify(responses));
}

processRequests();
