import { createCanvas } from 'canvas';
global.OffscreenCanvas = class {
  constructor(w, h) { return createCanvas(w, h); }
};
import { prepare, measureLineStats, layoutWithLines } from '@chenglou/pretext';

const text = "Mnemos\nI couldn't find any related notes in your knowledge base.\nWhat topics have I captured notes on?\nShow me my recent notes";

// Excalidraw default font
const font = '20px "Virgil"';

const prepared = prepare(text, font);

const result = layoutWithLines(prepared, 300, 25);
console.log(JSON.stringify(result, null, 2));
