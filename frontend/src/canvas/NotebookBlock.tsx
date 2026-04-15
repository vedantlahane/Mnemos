/**
 * NotebookBlock — single editable block in notebook view.
 *
 * Handles:
 *  - Contenteditable text editing
 *  - Block type detection via markdown shortcuts (# → heading, etc.)
 *  - Keyboard navigation (Enter, Backspace, ArrowUp/Down, Tab)
 *  - Focus management from parent
 */

import { useCallback, useEffect, useRef, memo } from "react"
import type { LocalBlock } from "../hooks/useNotebook"

interface Props {
  block: LocalBlock
  isFocused: boolean
  cursorPosition: "start" | "end" | null
  onTextChange: (id: string, text: string) => void
  onTypeChange: (id: string, type: string, text?: string) => void
  onEnter: (id: string, afterCursorText: string) => void
  onBackspaceAtStart: (id: string) => void
  onArrowUp: (id: string) => void
  onArrowDown: (id: string) => void
  onIndent: (id: string, delta: 1 | -1) => void
  onFocus: (id: string) => void
  onDelete: (id: string) => void
}

const BLOCK_TYPE_SHORTCUTS: Array<{
  pattern: RegExp
  type: string
  stripMatch: boolean
}> = [
  { pattern: /^###\s/, type: "heading3", stripMatch: true },
  { pattern: /^##\s/, type: "heading2", stripMatch: true },
  { pattern: /^#\s/, type: "heading1", stripMatch: true },
  { pattern: /^>\s/, type: "quote", stripMatch: true },
  { pattern: /^```/, type: "code", stripMatch: true },
  { pattern: /^---$/, type: "divider", stripMatch: true },
  { pattern: /^-\s/, type: "bullet", stripMatch: true },
  { pattern: /^\*\s/, type: "bullet", stripMatch: true },
  { pattern: /^\d+\.\s/, type: "numbered", stripMatch: true },
  { pattern: /^$$\s?$$\s/, type: "todo", stripMatch: true },
]

const TYPE_STYLES: Record<string, string> = {
  heading1:
    "text-[28px] font-bold leading-[1.3] text-white",
  heading2:
    "text-[22px] font-semibold leading-[1.35] text-white",
  heading3:
    "text-[18px] font-semibold leading-[1.4] text-white",
  paragraph:
    "text-[15px] leading-[1.7] text-[var(--glass-text)]",
  quote:
    "text-[15px] leading-[1.7] text-[var(--glass-text-dim)] italic border-l-2 border-[var(--accent)] pl-4",
  code:
    "text-[13px] leading-[1.6] font-mono text-[var(--glass-text)] bg-[rgba(255,255,255,0.03)] rounded-lg px-3 py-2 whitespace-pre-wrap",
  bullet:
    "text-[15px] leading-[1.7] text-[var(--glass-text)]",
  numbered:
    "text-[15px] leading-[1.7] text-[var(--glass-text)]",
  todo:
    "text-[15px] leading-[1.7] text-[var(--glass-text)]",
  divider: "",
}

const TYPE_PLACEHOLDER: Record<string, string> = {
  heading1: "Heading 1",
  heading2: "Heading 2",
  heading3: "Heading 3",
  paragraph: "Type / for commands, or just start writing…",
  quote: "Quote",
  code: "Code",
  bullet: "List item",
  numbered: "List item",
  todo: "To-do",
}

function getCaretOffset(el: HTMLElement): number {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return 0
  const range = sel.getRangeAt(0)
  const pre = range.cloneRange()
  pre.selectNodeContents(el)
  pre.setEnd(range.startContainer, range.startOffset)
  return pre.toString().length
}

function setCaretOffset(el: HTMLElement, offset: number) {
  const sel = window.getSelection()
  if (!sel) return

  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  let remaining = offset
  let node: Node | null = null

  while ((node = walk.nextNode())) {
    const len = (node.textContent || "").length
    if (remaining <= len) {
      const range = document.createRange()
      range.setStart(node, remaining)
      range.collapse(true)
      sel.removeAllRanges()
      sel.addRange(range)
      return
    }
    remaining -= len
  }

  // If we overshot, place at end
  const range = document.createRange()
  range.selectNodeContents(el)
  range.collapse(false)
  sel.removeAllRanges()
  sel.addRange(range)
}

function getTextContent(el: HTMLElement): string {
  return el.innerText || el.textContent || ""
}

export default memo(function NotebookBlock({
  block,
  isFocused,
  cursorPosition,
  onTextChange,
  onTypeChange,
  onEnter,
  onBackspaceAtStart,
  onArrowUp,
  onArrowDown,
  onIndent,
  onFocus,
  onDelete,
}: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const lastText = useRef(block.textContent)
  const suppressInput = useRef(false)

  // ── Focus management ──
  useEffect(() => {
    if (!isFocused || !ref.current) return
    ref.current.focus()
    if (cursorPosition === "start") {
      setCaretOffset(ref.current, 0)
    } else if (cursorPosition === "end") {
      setCaretOffset(ref.current, getTextContent(ref.current).length)
    }
  }, [isFocused, cursorPosition])

  // ── Sync text from props (external updates only) ──
  useEffect(() => {
    if (!ref.current) return
    if (document.activeElement === ref.current) return
    if (ref.current.innerText !== block.textContent) {
      ref.current.innerText = block.textContent
      lastText.current = block.textContent
    }
  }, [block.textContent])

  // ── Input handler ──
  const handleInput = useCallback(() => {
    if (suppressInput.current) return
    const el = ref.current
    if (!el) return

    const text = getTextContent(el)

    // Check markdown shortcuts at the start of the block
    if (block.blockType === "paragraph" && text !== lastText.current) {
      for (const shortcut of BLOCK_TYPE_SHORTCUTS) {
        if (shortcut.pattern.test(text)) {
          const newText = shortcut.stripMatch
            ? text.replace(shortcut.pattern, "")
            : text
          suppressInput.current = true
          el.innerText = newText
          lastText.current = newText
          suppressInput.current = false
          onTypeChange(block.id, shortcut.type, newText)

          // Re-focus after type change
          requestAnimationFrame(() => {
            if (ref.current) {
              ref.current.focus()
              setCaretOffset(ref.current, newText.length)
            }
          })
          return
        }
      }
    }

    lastText.current = text
    onTextChange(block.id, text)
  }, [block.id, block.blockType, onTextChange, onTypeChange])

  // ── Keyboard handler ──
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const el = ref.current
      if (!el) return

      const text = getTextContent(el)
      const caret = getCaretOffset(el)

      // Enter → split block
      if (e.key === "Enter" && !e.shiftKey) {
        // Allow Shift+Enter for newlines inside code blocks
        if (block.blockType === "code" && !e.metaKey && !e.ctrlKey) return

        e.preventDefault()
        const before = text.slice(0, caret)
        const after = text.slice(caret)

        // Update current block text to "before"
        el.innerText = before
        lastText.current = before
        onTextChange(block.id, before)
        onEnter(block.id, after)
        return
      }

      // Backspace at start → merge with previous
      if (e.key === "Backspace" && caret === 0 && text.length === 0) {
        e.preventDefault()
        onBackspaceAtStart(block.id)
        return
      }

      // Backspace at start of non-empty block with non-paragraph type → convert to paragraph
      if (e.key === "Backspace" && caret === 0 && block.blockType !== "paragraph") {
        e.preventDefault()
        onTypeChange(block.id, "paragraph")
        return
      }

      // Backspace at start of non-empty paragraph → merge
      if (e.key === "Backspace" && caret === 0 && block.blockType === "paragraph") {
        e.preventDefault()
        onBackspaceAtStart(block.id)
        return
      }

      // Delete on empty block
      if (e.key === "Delete" && text.length === 0) {
        e.preventDefault()
        onDelete(block.id)
        return
      }

      // Arrow Up at first line → move to block above
      if (e.key === "ArrowUp" && caret === 0) {
        e.preventDefault()
        onArrowUp(block.id)
        return
      }

      // Arrow Down at last line → move to block below
      if (e.key === "ArrowDown" && caret >= text.length) {
        e.preventDefault()
        onArrowDown(block.id)
        return
      }

      // Tab → indent
      if (e.key === "Tab") {
        e.preventDefault()
        onIndent(block.id, e.shiftKey ? -1 : 1)
        return
      }
    },
    [block.id, block.blockType, onTextChange, onEnter, onBackspaceAtStart, onArrowUp, onArrowDown, onIndent, onTypeChange, onDelete]
  )

  // ── Divider (non-editable) ──
  if (block.blockType === "divider") {
    return (
      <div
        className="py-4 cursor-pointer group"
        onClick={() => onFocus(block.id)}
        style={{ paddingLeft: block.depth * 24 }}
      >
        <div
          className={`h-px w-full transition-colors ${
            isFocused
              ? "bg-[var(--accent)]"
              : "bg-[rgba(255,255,255,0.1)] group-hover:bg-[rgba(255,255,255,0.15)]"
          }`}
        />
      </div>
    )
  }

  // ── Bullet / numbered prefix ──
  let prefix: React.ReactNode = null
  if (block.blockType === "bullet") {
    prefix = (
      <span className="select-none text-[var(--glass-text-muted)] mr-2 w-4 shrink-0 text-center">
        •
      </span>
    )
  } else if (block.blockType === "todo") {
    prefix = (
      <span className="select-none text-[var(--accent)] mr-2 w-4 shrink-0 text-center cursor-pointer">
        ☐
      </span>
    )
  }

  return (
    <div
      className={`group relative flex items-start transition-all ${
        isFocused ? "bg-[rgba(255,255,255,0.02)]" : ""
      }`}
      style={{ paddingLeft: block.depth * 24 }}
    >
      {prefix}
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline={block.blockType === "code"}
        data-block-id={block.id}
        data-block-type={block.blockType}
        data-placeholder={TYPE_PLACEHOLDER[block.blockType] || ""}
        className={`
          flex-1 outline-none min-h-[1.5em] break-words
          empty:before:content-[attr(data-placeholder)]
          empty:before:text-[var(--glass-text-muted)]
          empty:before:pointer-events-none
          ${TYPE_STYLES[block.blockType] || TYPE_STYLES.paragraph}
        `}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onFocus={() => onFocus(block.id)}
      />
    </div>
  )
})