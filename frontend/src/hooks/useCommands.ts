import { useState, useCallback } from "react"
import { useStream } from "./useStream"
import { useAppContext } from "./useAppContext"
import { useCanvasEvents } from "./useCanvasEvents"
import type { CanvasStyleSettings } from "./useCanvasEvents"
import { api } from "../api/client"
import type { Command, ContextType } from "../types"

const COMMANDS: Command[] = [
  { name: "/pages", aliases: ["/p"], description: "List all pages", context: ["home"], handler: "pages" },
  { name: "/page", aliases: [], description: "Create or delete a page", context: ["home"], args: "create|delete [name]", handler: "page" },
  { name: "/open", aliases: ["/o"], description: "Open a page canvas", context: ["home", "page", "settings", "history"], args: "<page name>", handler: "open" },
  { name: "/search", aliases: ["/s"], description: "Semantic search", context: ["home", "page"], args: "<query>", handler: "search" },
  { name: "/notes", aliases: ["/n"], description: "Browse notes", context: ["home", "page"], args: "[#tag|recent]", handler: "notes" },
  { name: "/tags", aliases: [], description: "Tag cloud", context: ["home", "page"], handler: "tags" },
  { name: "/tasks", aliases: ["/t"], description: "List all tasks", context: ["home", "page"], handler: "tasks" },
  { name: "/stats", aliases: [], description: "Workspace statistics", context: ["home"], handler: "stats" },
  { name: "/page-stats", aliases: [], description: "Page statistics", context: ["page"], handler: "page-stats" },
  { name: "/capture", aliases: [], description: "Quick capture", context: ["home", "page"], args: "<text> [--page X]", handler: "capture" },
  { name: "/curator", aliases: ["/clean"], description: "Run maintenance", context: ["home"], handler: "curator" },
  { name: "/find", aliases: [], description: "Find on canvas", context: ["page"], args: "<text>", handler: "find" },
  { name: "/add", aliases: [], description: "Add sticky/note to canvas", context: ["page"], args: "<text>", handler: "add" },
  { name: "/compose", aliases: ["/write-ai"], description: "AI compose structured canvas content", context: ["page"], args: "<topic>", handler: "compose" },
  { name: "/layout", aliases: ["/reorganize"], description: "AI auto-layout canvas", context: ["page"], handler: "layout" },
  { name: "/summarize", aliases: [], description: "Summarize page content", context: ["page"], handler: "summarize" },
  { name: "/gaps", aliases: [], description: "Knowledge gap analysis", context: ["home", "page"], handler: "gaps" },
  { name: "/reading", aliases: ["/path"], description: "Reading order", context: ["home", "page"], args: "[topic]", handler: "reading" },
  { name: "/export", aliases: [], description: "Export workspace", context: ["home", "page"], handler: "export" },
  { name: "/rename", aliases: [], description: "Rename page", context: ["page"], args: "<new name>", handler: "rename" },
  { name: "/bg", aliases: ["/background"], description: "Canvas background color", context: ["page"], args: "<color>", handler: "bg" },
  { name: "/theme", aliases: [], description: "Canvas theme (light/dark)", context: ["page"], args: "light|dark", handler: "theme" },
  { name: "/style", aliases: ["/canvas-style"], description: "Set Excalidraw tool settings", context: ["page"], args: "k=v ...", handler: "style" },
  { name: "/style-lock", aliases: [], description: "Require style confirmation before canvas writes", context: ["page"], args: "on|off|status", handler: "style-lock" },
  { name: "/style-confirm", aliases: [], description: "Confirm style before AI writes/edits", context: ["page"], handler: "style-confirm" },
  { name: "/library", aliases: ["/lib"], description: "Open shape library", context: ["page"], handler: "library" },
  { name: "/diagram", aliases: ["/flow", "/mindmap"], description: "AI diagram generator", context: ["page"], args: "<topic>", handler: "diagram" },
  { name: "/close", aliases: [], description: "Close page", context: ["page", "settings", "history"], handler: "close" },
  { name: "/settings", aliases: [], description: "Open settings", context: ["home", "page", "settings", "history"], handler: "settings" },
  { name: "/history", aliases: ["/h"], description: "Chat history", context: ["home", "page", "settings", "history"], handler: "history" },
  { name: "/home", aliases: [], description: "Go home", context: ["home", "page", "settings", "history"], handler: "home" },
  { name: "/back", aliases: [], description: "Go back", context: ["home", "page", "settings", "history"], handler: "back" },
  { name: "/clear", aliases: ["/c"], description: "Clear stream", context: ["home", "page", "settings", "history"], handler: "clear" },
  { name: "/help", aliases: ["/?"], description: "Show commands", context: ["home", "page", "settings", "history"], handler: "help" },
]

const COLOR_MAP: Record<string, string> = {
  black: "#000000", dark: "#0e0e1a", void: "#08080f",
  white: "#ffffff", red: "#ef4444", blue: "#3b82f6",
  green: "#22c55e", purple: "#a855f7", indigo: "#6366f1",
  gray: "#374151", grey: "#374151", navy: "#1e293b",
  slate: "#1e293b", charcoal: "#1a1a2e", midnight: "#0f0f23",
  default: "#0e0e1a",
}

function resolveColor(input: string): string | null {
  const lower = input.toLowerCase().trim()
  if (COLOR_MAP[lower]) return COLOR_MAP[lower]
  if (/^#[0-9a-fA-F]{3,8}$/.test(lower)) return lower
  if (/^rgb/.test(lower)) return lower
  return null
}

const FONT_FAMILY_MAP: Record<string, number> = {
  virgil: 1,
  helvetica: 2,
  cascadia: 3,
  assistant: 4,
}

const TEXT_ALIGN_VALUES = new Set(["left", "center", "right"])
const FILL_STYLE_VALUES = new Set(["solid", "hachure", "cross-hatch"])
const STROKE_STYLE_VALUES = new Set(["solid", "dashed", "dotted"])
const ARROWHEAD_VALUES = new Set(["arrow", "bar", "dot", "triangle", "diamond", "crowfoot_one", "crowfoot_many", "crowfoot_one_or_many", "none"])

function parseStyleArgs(raw: string): { settings: CanvasStyleSettings; errors: string[] } {
  const settings: CanvasStyleSettings = {}
  const errors: string[] = []

  const tokens = raw
    .split(/\s+/)
    .map((x) => x.trim())
    .filter(Boolean)

  for (const token of tokens) {
    const eqIdx = token.indexOf("=")
    if (eqIdx <= 0) {
      errors.push(`Expected key=value, got "${token}"`)
      continue
    }

    const key = token.slice(0, eqIdx).toLowerCase()
    const value = token.slice(eqIdx + 1)
    const lower = value.toLowerCase()

    if (["bg", "background", "viewbackgroundcolor"].includes(key)) {
      const color = resolveColor(value)
      if (!color) errors.push(`Invalid background color: ${value}`)
      else settings.viewBackgroundColor = color
      continue
    }

    if (key === "theme") {
      if (lower === "light" || lower === "dark") settings.theme = lower
      else errors.push(`theme must be light|dark, got ${value}`)
      continue
    }

    if (["stroke", "strokecolor", "currentitemstrokecolor"].includes(key)) {
      const color = resolveColor(value)
      if (!color) errors.push(`Invalid stroke color: ${value}`)
      else settings.currentItemStrokeColor = color
      continue
    }

    if (["fill", "background", "fillcolor", "currentitembackgroundcolor"].includes(key)) {
      const color = resolveColor(value)
      if (!color) errors.push(`Invalid fill color: ${value}`)
      else settings.currentItemBackgroundColor = color
      continue
    }

    if (["text", "textcolor"].includes(key)) {
      const color = resolveColor(value)
      if (!color) errors.push(`Invalid text color: ${value}`)
      else settings.currentItemStrokeColor = color
      continue
    }

    if (["fillstyle", "currentitemfillstyle"].includes(key)) {
      if (FILL_STYLE_VALUES.has(lower)) settings.currentItemFillStyle = lower as CanvasStyleSettings["currentItemFillStyle"]
      else errors.push(`fillStyle must be solid|hachure|cross-hatch, got ${value}`)
      continue
    }

    if (["strokestyle", "currentitemstrokestyle"].includes(key)) {
      if (STROKE_STYLE_VALUES.has(lower)) settings.currentItemStrokeStyle = lower as CanvasStyleSettings["currentItemStrokeStyle"]
      else errors.push(`strokeStyle must be solid|dashed|dotted, got ${value}`)
      continue
    }

    if (["strokewidth", "width", "currentitemstrokewidth"].includes(key)) {
      const n = Number(value)
      if (!Number.isFinite(n) || n < 0 || n > 20) errors.push(`strokeWidth must be 0..20, got ${value}`)
      else settings.currentItemStrokeWidth = n
      continue
    }

    if (["roughness", "currentitemroughness"].includes(key)) {
      const n = Number(value)
      if (!Number.isFinite(n) || n < 0 || n > 5) errors.push(`roughness must be 0..5, got ${value}`)
      else settings.currentItemRoughness = n
      continue
    }

    if (["opacity", "currentitemopacity"].includes(key)) {
      const n = Number(value)
      if (!Number.isFinite(n) || n < 0 || n > 100) errors.push(`opacity must be 0..100, got ${value}`)
      else settings.currentItemOpacity = n
      continue
    }

    if (["font", "fontfamily", "currentitemfontfamily"].includes(key)) {
      if (FONT_FAMILY_MAP[lower]) settings.currentItemFontFamily = FONT_FAMILY_MAP[lower]
      else if (Number.isFinite(Number(value))) settings.currentItemFontFamily = Number(value)
      else errors.push(`fontFamily must be virgil|helvetica|cascadia|assistant or numeric, got ${value}`)
      continue
    }

    if (["fontsize", "currentitemfontsize"].includes(key)) {
      const n = Number(value)
      if (!Number.isFinite(n) || n < 8 || n > 128) errors.push(`fontSize must be 8..128, got ${value}`)
      else settings.currentItemFontSize = n
      continue
    }

    if (["textalign", "align", "currentitemtextalign"].includes(key)) {
      if (TEXT_ALIGN_VALUES.has(lower)) settings.currentItemTextAlign = lower as CanvasStyleSettings["currentItemTextAlign"]
      else errors.push(`textAlign must be left|center|right, got ${value}`)
      continue
    }

    if (["startarrow", "startarrowhead", "currentitemstartarrowhead"].includes(key)) {
      if (ARROWHEAD_VALUES.has(lower)) settings.currentItemStartArrowhead = lower === "none" ? null : lower
      else errors.push(`startArrowhead value not recognized: ${value}`)
      continue
    }

    if (["endarrow", "endarrowhead", "currentitemendarrowhead"].includes(key)) {
      if (ARROWHEAD_VALUES.has(lower)) settings.currentItemEndArrowhead = lower === "none" ? null : lower
      else errors.push(`endArrowhead value not recognized: ${value}`)
      continue
    }

    if (["round", "roundness", "currentitemroundness"].includes(key)) {
      if (lower === "none") settings.currentItemRoundness = null
      else settings.currentItemRoundness = lower
      continue
    }

    errors.push(`Unknown style key: ${key}`)
  }

  return { settings, errors }
}

export function useCommands() {
  const [inputValue, setInputValue] = useState("")
  const [suggestions, setSuggestions] = useState<Command[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [styleLockEnabled, setStyleLockEnabled] = useState(false)
  const [styleConfirmed, setStyleConfirmed] = useState(false)
  const [styleConfirmedPageId, setStyleConfirmedPageId] = useState<string | undefined>(undefined)

  const {
    items, addUserMessage, addAssistantMessage, addBlock,
    addSystemMessage, clearStream, setLoading, saveConversation,
  } = useStream()
  const { current, switchTo, goBack, goHome } = useAppContext()
  const canvasDispatch = useCanvasEvents((s) => s.dispatch)

  const isStyleConfirmedForPage =
    styleLockEnabled &&
    styleConfirmed &&
    current.type === "page" &&
    current.pageId === styleConfirmedPageId

  const requireStyleConfirmation = useCallback(
    (actionLabel: string): boolean => {
      if (!styleLockEnabled) return false
      if (isStyleConfirmedForPage) return false
      addAssistantMessage(
        `Style lock is enabled. Run \`/style ...\` and then \`/style-confirm\` before ${actionLabel}.`
      )
      return true
    },
    [styleLockEnabled, isStyleConfirmedForPage, addAssistantMessage]
  )

  const invalidateStyleConfirmation = useCallback(() => {
    if (!styleLockEnabled) return
    setStyleConfirmed(false)
    setStyleConfirmedPageId(current.pageId)
  }, [styleLockEnabled, current.pageId])

  const getAutoComplete = useCallback(
    (partial: string, ctx: ContextType) => {
      if (!partial.startsWith("/")) return []
      const term = partial.toLowerCase().split(" ")[0]
      return COMMANDS.filter(
        (c) =>
          c.context.includes(ctx) &&
          (c.name.startsWith(term) || c.aliases.some((a) => a.startsWith(term)))
      )
    },
    []
  )

  const handleInput = (val: string) => {
    setInputValue(val)
    const parts = val.split(" ")
    if (val.startsWith("/") && parts.length <= 1) {
      setSuggestions(getAutoComplete(val, current.type))
      setSelectedIndex(0)
    } else {
      setSuggestions([])
    }
  }

  const executeCommand = async (raw: string) => {
    const parts = raw.trim().split(/\s+/)
    const cmdStr = parts[0].toLowerCase()
    const args = parts.slice(1).join(" ")

    const cmd = COMMANDS.find(
      (c) => c.name === cmdStr || c.aliases.includes(cmdStr)
    )

    if (!cmd) {
      addAssistantMessage(`Unknown command: \`${cmdStr}\`. Type **/help** for commands.`)
      return
    }

    if (!cmd.context.includes(current.type)) {
      addAssistantMessage(`**${cmdStr}** is not available in **${current.type}** context.`)
      return
    }

    switch (cmd.handler) {
      case "open": {
        if (!args) {
          addAssistantMessage("Usage: `/open <page name>`")
          return
        }
        try {
          const { pages } = await api.listPages()
          const lower = args.toLowerCase()
          const match =
            pages.find((p) => p.name.toLowerCase() === lower) ||
            pages.find((p) => p.name.toLowerCase().includes(lower))
          if (match) {
            switchTo("page", match.id, match.name)
            addSystemMessage(`Opened page: ${match.icon || "📄"} ${match.name}`)
          } else {
            addAssistantMessage(
              `Page "${args}" not found. Available:\n${pages
                .map((p) => `- ${p.icon || "📄"} ${p.name}`)
                .join("\n")}`
            )
          }
        } catch {
          addAssistantMessage("Failed to load pages.")
        }
        break
      }

      case "close":
      case "home":
        // Save conversation before navigating away
        if (current.type === "page" && items.some((i) => i.type === "assistant")) {
          saveConversation(current.type, current.pageId)
        }
        goHome()
        addSystemMessage("Returned to home.")
        addBlock("welcome")
        break

      case "back":
        goBack()
        addSystemMessage("Navigated back.")
        break

      case "pages":
        addBlock("page-list")
        break

      case "page": {
        const sub = parts[1]?.toLowerCase()
        const name = parts.slice(2).join(" ")

        if (sub === "create" && name) {
          try {
            const page = await api.createPage({ name })
            addSystemMessage(`Created page: ${page.icon} ${page.name}`)
            addBlock("page-list")
          } catch (err) {
            addAssistantMessage(
              `Failed to create "${name}": ${err instanceof Error ? err.message : "Unknown error"}`
            )
          }
        } else if (sub === "delete" && name) {
          try {
            const { pages } = await api.listPages()
            const match = pages.find((p) => p.name.toLowerCase() === name.toLowerCase())
            if (match && match.name !== "Uncategorized") {
              await api.deletePage(match.id)
              addSystemMessage(`Deleted: ${name}`)
              addBlock("page-list")
            } else {
              addAssistantMessage(
                match?.name === "Uncategorized"
                  ? "Cannot delete Uncategorized."
                  : `Page "${name}" not found.`
              )
            }
          } catch {
            addAssistantMessage("Failed to delete page.")
          }
        } else if (sub && sub !== "create" && sub !== "delete") {
          // Treat "/page <name>" as shorthand for "/page create <name>"
          const fullName = parts.slice(1).join(" ")
          try {
            const page = await api.createPage({ name: fullName })
            addSystemMessage(`Created page: ${page.icon} ${page.name}`)
            addBlock("page-list")
          } catch (err) {
            // If creation fails (duplicate), try opening it instead
            try {
              const { pages } = await api.listPages()
              const match = pages.find(
                (p) => p.name.toLowerCase() === fullName.toLowerCase()
              )
              if (match) {
                switchTo("page", match.id, match.name)
                addSystemMessage(`Opened page: ${match.icon || "📄"} ${match.name}`)
              } else {
                addAssistantMessage(
                  `Failed to create "${fullName}": ${err instanceof Error ? err.message : "Unknown error"}`
                )
              }
            } catch {
              addAssistantMessage(
                `Failed to create "${fullName}": ${err instanceof Error ? err.message : "Unknown error"}`
              )
            }
          }
        } else {
          addAssistantMessage(
            "**Usage:**\n" +
            "• `/page <name>` — create (or open if exists)\n" +
            "• `/page create <name>` — create new page\n" +
            "• `/page delete <name>` — delete a page"
          )
        }
        break
      }

      case "notes": {
        const tag = args.startsWith("#") ? args.slice(1) : undefined
        const limit = args === "recent" ? 10 : undefined
        addBlock("note-grid", { limit }, { tag, pageId: current.pageId })
        break
      }

      case "search":
        if (!args) {
          addAssistantMessage("Usage: `/search <query>`")
        } else {
          addBlock("search-results", undefined, { query: args, pageId: current.pageId })
        }
        break

      case "stats":
        addBlock("stats")
        break

      case "page-stats":
        if (!current.pageId) {
          addAssistantMessage("Open a page first.")
        } else {
          addBlock("page-stats", undefined, { pageId: current.pageId })
        }
        break

      case "tags":
        addBlock("tag-cloud")
        break

      case "tasks":
        addBlock("task-list", undefined, { pageId: current.pageId })
        break

      case "capture": {
        if (!args) {
          addAssistantMessage("Usage: `/capture <text> [--page PageName]`")
          return
        }
        const pageMatch = args.match(/--page\s+(.+)$/i)
        const text = pageMatch ? args.replace(pageMatch[0], "").trim() : args
        const pageHint = pageMatch?.[1]?.trim() || current.pageName

        if (text.length < 3) {
          addAssistantMessage("Text must be at least 3 characters.")
          return
        }
        if (text.length > 50000) {
          addAssistantMessage("Text must be under 50,000 characters.")
          return
        }

        try {
          setLoading(true)
          const resp = await api.capture({
            text,
            capture_type: "manual",
            page_hint: pageHint,
          })
          addSystemMessage(
            `Captured (${resp.note_id.slice(0, 8)}…). Processing…`
          )
          if (current.type === "page") {
            // Wait for processing then refresh
            setTimeout(() => {
              canvasDispatch({ type: "refresh" })
            }, 4000)
          }
        } catch (err) {
          addAssistantMessage(
            `Failed to capture: ${err instanceof Error ? err.message : "Unknown error"}`
          )
        } finally {
          setLoading(false)
        }
        break
      }

      case "curator":
        addBlock("curator-report")
        break

      case "reading":
        addBlock("reading-path", undefined, { topic: args || undefined, pageId: current.pageId })
        break

      case "gaps":
        addBlock("gap-analysis", undefined, { pageId: current.pageId })
        break

      case "find":
        if (!args) {
          addAssistantMessage("Usage: `/find <text>`")
        } else {
          canvasDispatch({ type: "search", query: args })
        }
        break

      case "add": {
        if (requireStyleConfirmation("adding elements to canvas")) return
        if (!args) {
          addAssistantMessage("Usage: `/add <text>` or `/add sticky: <text>`")
          return
        }
        const lower = args.toLowerCase()
        const isPrefixed = lower.startsWith("sticky:") || lower.startsWith("note:")
        const addType = lower.startsWith("sticky:") ? "sticky" : "note"
        const content = isPrefixed ? args.split(":").slice(1).join(":").trim() : args
        canvasDispatch({ type: "add", addType, content })
        break
      }

      case "compose": {
        if (requireStyleConfirmation("AI composition on canvas")) return
        if (!current.pageId) {
          addAssistantMessage("Open a page first.")
          return
        }
        if (!args) {
          addAssistantMessage("Usage: `/compose <topic>`")
          return
        }
        const includeDiagram = /diagram|flowchart|mindmap|mind map|visual/i.test(args)
        canvasDispatch({
          type: "ai-compose",
          request: args,
          pageId: current.pageId,
          includeDiagram,
        })
        addSystemMessage("AI is composing structured canvas content…")
        break
      }

      case "bg": {
        if (!args) {
          addAssistantMessage(
            `Usage: \`/bg <color>\`\nAvailable: ${Object.keys(COLOR_MAP).join(", ")}`
          )
          return
        }
        const color = resolveColor(args)
        if (!color) {
          addAssistantMessage(`Unknown color "${args}". Try: ${Object.keys(COLOR_MAP).join(", ")}`)
          return
        }
        canvasDispatch({ type: "set-background", color })
        invalidateStyleConfirmation()
        addSystemMessage(`Background → ${args} (${color})`)
        break
      }

      case "theme": {
        const value = args.trim().toLowerCase()
        if (value !== "light" && value !== "dark") {
          addAssistantMessage("Usage: `/theme light` or `/theme dark`")
          return
        }
        canvasDispatch({ type: "set-theme", theme: value })
        invalidateStyleConfirmation()
        addSystemMessage(`Theme → ${value}`)
        break
      }

      case "style": {
        if (!args) {
          addAssistantMessage(
            "Usage: `/style key=value ...`\n" +
            "Example: `/style theme=light bg=#ffffff stroke=#1f2937 fill=#e2e8f0 strokeWidth=2 strokeStyle=solid fillStyle=solid font=helvetica fontSize=18 textAlign=left endArrow=arrow`"
          )
          return
        }
        const { settings, errors } = parseStyleArgs(args)
        if (errors.length > 0) {
          addAssistantMessage(`Style parse errors:\n${errors.map((e) => `• ${e}`).join("\n")}`)
          return
        }
        if (Object.keys(settings).length === 0) {
          addAssistantMessage("No valid style keys found.")
          return
        }
        canvasDispatch({ type: "set-style", settings })
        invalidateStyleConfirmation()
        addSystemMessage("Applied canvas style settings.")
        break
      }

      case "style-lock": {
        const mode = args.trim().toLowerCase() || "status"
        if (mode === "status") {
          addSystemMessage(
            `Style lock: ${styleLockEnabled ? "ON" : "OFF"}. ` +
            `Confirmed for current page: ${isStyleConfirmedForPage ? "YES" : "NO"}.`
          )
          return
        }
        if (mode === "on") {
          setStyleLockEnabled(true)
          setStyleConfirmed(false)
          setStyleConfirmedPageId(current.pageId)
          addSystemMessage("Style lock enabled. Set style and run /style-confirm before canvas write/edit actions.")
          return
        }
        if (mode === "off") {
          setStyleLockEnabled(false)
          setStyleConfirmed(false)
          setStyleConfirmedPageId(undefined)
          addSystemMessage("Style lock disabled.")
          return
        }
        addAssistantMessage("Usage: `/style-lock on`, `/style-lock off`, or `/style-lock status`")
        break
      }

      case "style-confirm": {
        if (!styleLockEnabled) {
          addAssistantMessage("Style lock is currently off. Enable it with `/style-lock on`.")
          return
        }
        setStyleConfirmed(true)
        setStyleConfirmedPageId(current.pageId)
        addSystemMessage("Canvas style confirmed for this page.")
        break
      }

      case "library":
        addSystemMessage("📚 Click the book icon in the chat panel header to open the library.")
        break

      case "diagram":
        if (requireStyleConfirmation("diagram generation")) return
        if (!current.pageId) {
          addAssistantMessage("Open a page first.")
          return
        }
        if (!args) {
          addAssistantMessage("Usage: `/diagram <topic>` (e.g., `/diagram how docker works`)")
          return
        }
        canvasDispatch({
          type: "generate-diagram",
          request: args,
          pageId: current.pageId,
        })
        break

      case "layout":
        if (requireStyleConfirmation("auto-layout")) return
        if (!current.pageId) {
          addAssistantMessage("Open a page first.")
          return
        }
        try {
          setLoading(true)
          addSystemMessage("AI is reorganizing canvas…")
          const result = await api.aiLayout(current.pageId)
          canvasDispatch({ type: "refresh" })
          addSystemMessage(
            `Canvas reorganized: ${result.positions.length} notes, ${result.clusters.length} clusters, ${result.edges.length} edges.`
          )
        } catch {
          addAssistantMessage("AI layout failed. Try dragging manually.")
        } finally {
          setLoading(false)
        }
        break

      case "summarize": {
        if (!current.pageId) {
          addAssistantMessage("Open a page first.")
          return
        }
        setLoading(true)
        try {
          const result = await api.pageSummary(current.pageId)
          let msg = result.summary
          if (result.key_topics.length > 0) {
            msg += `\n\n**Key topics:** ${result.key_topics.join(", ")}`
          }
          if (result.connections.length > 0) {
            msg += `\n\n**Connections:**\n${result.connections.map((c) => `• ${c}`).join("\n")}`
          }
          addAssistantMessage(msg)
        } catch {
          // Fallback to chat
          try {
            const resp = await api.chat(
              "Summarize everything on this page.",
              [],
              "page",
              current.pageId
            )
            addAssistantMessage(resp.answer || "No summary available.", resp.sources, resp.follow_ups)
          } catch {
            addAssistantMessage("Failed to summarize.")
          }
        } finally {
          setLoading(false)
        }
        break
      }

      case "export":
        addBlock("export")
        break

      case "rename": {
        if (!args) {
          addAssistantMessage("Usage: `/rename <new name>`")
          return
        }
        if (!current.pageId) {
          addAssistantMessage("Open a page first.")
          return
        }
        try {
          await api.updatePage(current.pageId, { name: args })
          switchTo("page", current.pageId, args)
          addSystemMessage(`Renamed to "${args}".`)
        } catch (err) {
          addAssistantMessage(
            `Failed to rename: ${err instanceof Error ? err.message : "Unknown error"}`
          )
        }
        break
      }

      case "settings":
        switchTo("settings")
        addBlock("settings")
        break

      case "history":
        switchTo("history")
        addBlock("history")
        break

      case "clear":
        clearStream()
        break

      case "help":
        addBlock("help")
        break

      default:
        addAssistantMessage(`Handler missing: ${cmd.handler}`)
    }
  }

  const handleSubmit = async () => {
    if (!inputValue.trim()) return
    const q = inputValue.trim()

    // Tab-complete partial command
    if (suggestions.length > 0 && q.startsWith("/") && !q.includes(" ")) {
      const selected = suggestions[selectedIndex]
      if (selected) {
        setInputValue(`${selected.name} `)
        setSuggestions([])
        return
      }
    }

    setInputValue("")
    setSuggestions([])

    if (q.startsWith("/")) {
      addUserMessage(q)
      await executeCommand(q)
      return
    }

    addUserMessage(q)

    let intentRouted = false
    try {
      const decision = await api.decideIntent(q, current.type, current.pageId)
      if (
        decision.mode === "command" &&
        typeof decision.command === "string" &&
        decision.command.startsWith("/") &&
        decision.confidence >= 0.7
      ) {
        const routed = `${decision.command} ${decision.args || ""}`.trim()
        await executeCommand(routed)
        intentRouted = true
      }
    } catch {
      intentRouted = false
    }

    if (intentRouted) return

    // Chat with AI
    setLoading(true)
    try {
      const history = items
        .filter((i) => i.type === "user" || i.type === "assistant")
        .slice(-10)
        .map((i) => ({
          role: i.type as string,
          content: ("content" in i ? i.content : "") || "",
        }))

      const resp = await api.chat(q, history, current.type, current.pageId)
      addAssistantMessage(
        resp.answer || "No relevant information found.",
        resp.sources,
        resp.follow_ups
      )
    } catch {
      addAssistantMessage("Error connecting to backend.")
    } finally {
      setLoading(false)
    }
  }

  return {
    inputValue,
    handleInput,
    suggestions,
    selectedIndex,
    setSelectedIndex,
    handleSubmit,
  }
}