/**
 * NLP Intent Parser
 * Detects natural language commands and converts them to structured intents.
 *
 * DESIGN PRINCIPLE: Only intercept messages when the user's intent is *explicit*.
 * Anything ambiguous should fall through to the AI chat so the assistant can
 * actually respond. We never silently swallow a message to create a sticky note
 * unless the user literally said "write …" / "add sticky …" / etc.
 */

export interface NLPIntent {
  type: "write" | "add" | "draw" | "diagram" | "capture" | "search" | "find" | "ask" | "none"
  content: string
  subType?: "sticky" | "note"
  confidence: number
}

// Only trigger on explicit write prefixes - the user must clearly ask to
// put text on the canvas.
const WRITE_KEYWORDS = [
  "write down on canvas",
  "write down on the canvas",
  "write down",
  "write on canvas",
  "write that on canvas",
  "write this on canvas",
  "write on the canvas",
  "add to canvas",
  "add on canvas",
  "add to the canvas",
  "add on the canvas",
  "put on canvas",
  "put on the canvas",
  "put that on canvas",
  "draw text",
  "add text to canvas",
  "add text",
  "write",  // "write X" — explicit intent
]

// Sticky/note creation: must mention "sticky" or "note" explicitly
const ADD_KEYWORDS = ["create sticky", "add sticky", "add a sticky", "create note", "add note", "insert sticky", "insert note"]

const CAPTURE_KEYWORDS = ["capture this", "save this", "record this", "log this", "memorize", "remember this"]
const SEARCH_KEYWORDS = ["search for", "search my notes", "search notes"]
const FIND_KEYWORDS = ["find on canvas", "search canvas", "find on page"]

// Diagram generation patterns
const DIAGRAM_KEYWORDS = [
  "draw diagram",
  "create diagram",
  "make diagram",
  "draw flowchart",
  "create flowchart",
  "make flowchart",
  "draw mindmap",
  "create mindmap",
  "make mindmap",
  "draw mind map",
  "create mind map",
  "make mind map",
  "diagram",
  "flowchart",
  "visualize",
  "draw a flow",
  "create a flow",
  "draw timeline",
  "create timeline",
  "compare",
]

// ── Typo tolerance for common write-intent patterns ──
const WRITE_TYPO_PATTERNS = [
  /^writ(?:e|t|te)?\s+(?:that|this)?\s*(?:on\s+(?:the\s+)?canvas)?\s*/i,
  /^wrie\s+(?:that|this)?\s*(?:on\s+(?:the\s+)?canvas)?\s*/i,
  /^ad+\s+to\s+(?:the\s+)?canvas\s*/i,
  /^put\s+(?:that|this|it)?\s*(?:on\s+(?:the\s+)?canvas)?\s*/i,
]


/**
 * Extract the main content from a sentence after removing keyword prefixes
 */
function extractContent(text: string, keywords: string[]): string {
  const lower = text.toLowerCase().trim()

  for (const keyword of keywords) {
    const regex = new RegExp(`^${keyword}\\s+`, "i")
    if (regex.test(lower)) {
      return text.replace(regex, "").trim()
    }
  }

  return text.trim()
}

/**
 * Parse natural language input and detect intent.
 *
 * The parser is intentionally *conservative*. If there's any doubt, it returns
 * type: "ask" so the message goes to the AI chat backend instead of silently
 * performing a canvas action the user didn't intend.
 */
export function parseNLPIntent(input: string): NLPIntent {
  if (!input || input.trim().length === 0) {
    return { type: "none", content: "", confidence: 0 }
  }

  const text = input.trim()
  const lower = text.toLowerCase()

  // Skip explicit commands (they start with /)
  if (text.startsWith("/")) {
    return { type: "none", content: "", confidence: 0 }
  }

  // ── WRITE intent: only with very explicit keywords ──
  for (const keyword of WRITE_KEYWORDS) {
    if (lower.startsWith(keyword)) {
      const content = extractContent(text, [keyword])
      if (content.length > 0) {
        return {
          type: "write",
          content,
          confidence: 0.95,
        }
      }
    }
  }

  // ── WRITE intent: typo-tolerant patterns ──
  for (const pattern of WRITE_TYPO_PATTERNS) {
    const match = lower.match(pattern)
    if (match) {
      const content = text.slice(match[0].length).trim()
      if (content.length > 0) {
        return {
          type: "write",
          content,
          confidence: 0.90,
        }
      }
    }
  }

  // ── ADD intent: must mention sticky/note explicitly ──
  for (const keyword of ADD_KEYWORDS) {
    if (lower.startsWith(keyword)) {
      const content = extractContent(text, [keyword])
      if (content.length > 0) {
        const subType = lower.includes("sticky") ? "sticky" : "note"
        return {
          type: "add",
          content,
          subType,
          confidence: 0.95,
        }
      }
    }
  }

  // ── DIAGRAM intent: draw diagram/flowchart/mindmap ──
  for (const keyword of DIAGRAM_KEYWORDS) {
    if (lower.startsWith(keyword)) {
      const content = extractContent(text, [keyword])
      if (content.length > 0) {
        return {
          type: "diagram",
          content,
          confidence: 0.95,
        }
      }
      // Keyword alone (like "flowchart") — still valid
      return {
        type: "diagram",
        content: text,
        confidence: 0.85,
      }
    }
  }

  // ── CAPTURE intent: explicit capture/save keywords ──
  for (const keyword of CAPTURE_KEYWORDS) {
    if (lower.startsWith(keyword)) {
      const content = extractContent(text, [keyword])
      if (content.length > 0) {
        return {
          type: "capture",
          content,
          confidence: 0.9,
        }
      }
    }
  }

  // ── FIND intent: only explicit canvas search phrases ──
  for (const keyword of FIND_KEYWORDS) {
    if (lower.startsWith(keyword)) {
      const content = extractContent(text, [keyword])
      if (content.length > 0) {
        return {
          type: "find",
          content,
          confidence: 0.9,
        }
      }
    }
  }

  // ── SEARCH intent: only explicit search phrases ──
  for (const keyword of SEARCH_KEYWORDS) {
    if (lower.startsWith(keyword)) {
      const content = extractContent(text, [keyword])
      if (content.length > 0) {
        return {
          type: "search",
          content,
          confidence: 0.85,
        }
      }
    }
  }

  // ── Everything else → ASK (goes to AI chat) ──
  // This is the critical fix: we no longer have a "short text = write" fallback.
  // All ambiguous input goes to the AI chat, which is what users expect.
  return {
    type: "ask",
    content: text,
    confidence: 0.5,
  }
}

/**
 * Check if an input should trigger NLP parsing
 * (i.e., it doesn't start with / and isn't empty)
 */
export function shouldParseNLP(input: string): boolean {
  const trimmed = input.trim()
  return trimmed.length > 0 && !trimmed.startsWith("/")
}
