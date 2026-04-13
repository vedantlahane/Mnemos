import { useState, useCallback } from "react"
import { useStream } from "./useStream"
import { useAppContext } from "./useAppContext"
import { useCanvasEvents } from "./useCanvasEvents"
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
  { name: "/layout", aliases: ["/reorganize"], description: "AI auto-layout canvas", context: ["page"], handler: "layout" },
  { name: "/summarize", aliases: [], description: "Summarize page content", context: ["page"], handler: "summarize" },
  { name: "/gaps", aliases: [], description: "Knowledge gap analysis", context: ["home", "page"], handler: "gaps" },
  { name: "/reading", aliases: ["/path"], description: "Reading order", context: ["home", "page"], args: "[topic]", handler: "reading" },
  { name: "/export", aliases: [], description: "Export workspace", context: ["home", "page"], handler: "export" },
  { name: "/rename", aliases: [], description: "Rename page", context: ["page"], args: "<new name>", handler: "rename" },
  { name: "/bg", aliases: ["/background"], description: "Canvas background color", context: ["page"], args: "<color>", handler: "bg" },
  { name: "/library", aliases: ["/lib"], description: "Open shape library", context: ["page"], handler: "library" },
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

export function useCommands() {
  const [inputValue, setInputValue] = useState("")
  const [suggestions, setSuggestions] = useState<Command[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)

  const {
    items, addUserMessage, addAssistantMessage, addBlock,
    addSystemMessage, clearStream, setLoading, saveConversation,
  } = useStream()
  const { current, switchTo, goBack, goHome } = useAppContext()
  const canvasDispatch = useCanvasEvents((s) => s.dispatch)

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
        } else {
          addAssistantMessage("Usage: `/page create <name>` or `/page delete <name>`")
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
        addSystemMessage(`Background → ${args} (${color})`)
        break
      }

      case "library":
        canvasDispatch({ type: "open-library" })
        addSystemMessage("Opening library…")
        break

      case "layout":
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

  function detectNaturalLanguageCommand(text: string): boolean {
    const lower = text.toLowerCase().trim()

    // Open page
    const openMatch = lower.match(/^open\s+(.+)$/)
    if (openMatch) {
      executeCommand(`/open ${openMatch[1]}`)
      return true
    }

    // Navigation
    if (lower === "close" || lower === "go home" || lower === "go to home") {
      executeCommand("/home")
      return true
    }
    if (lower === "go back" || lower === "back") {
      executeCommand("/back")
      return true
    }

    // Canvas commands
    if (current.type === "page") {
      const bgMatch = lower.match(
        /(?:change|set|make)\s+(?:the\s+)?(?:canvas\s+)?background\s+(?:color\s+)?(?:to\s+)?(.+)/
      )
      if (bgMatch) {
        executeCommand(`/bg ${bgMatch[1].trim()}`)
        return true
      }
      const bgShort = lower.match(
        /^(black|dark|white|default|midnight|navy|charcoal)\s+background$/
      )
      if (bgShort) {
        executeCommand(`/bg ${bgShort[1]}`)
        return true
      }
      if (["open library", "show library", "library"].includes(lower)) {
        executeCommand("/library")
        return true
      }
      const stickyMatch = lower.match(
        /^add\s+(?:a\s+)?sticky\s+(?:note\s+)?(?:saying\s+|with\s+)?(.+)/i
      )
      if (stickyMatch) {
        executeCommand(`/add sticky: ${stickyMatch[1]}`)
        return true
      }
      const findMatch = lower.match(/^find\s+(.+?)(?:\s+on\s+canvas)?$/)
      if (findMatch) {
        executeCommand(`/find ${findMatch[1]}`)
        return true
      }
      if (["reorganize", "reorganize canvas", "auto layout", "layout"].includes(lower)) {
        executeCommand("/layout")
        return true
      }
      if (["summarize", "summarize this page", "summarize page", "what's on this page", "whats on this page"].includes(lower)) {
        executeCommand("/summarize")
        return true
      }
      if (lower === "zoom in") {
        canvasDispatch({ type: "zoom", direction: "in" })
        addSystemMessage("Zoomed in.")
        return true
      }
      if (lower === "zoom out") {
        canvasDispatch({ type: "zoom", direction: "out" })
        addSystemMessage("Zoomed out.")
        return true
      }
      if (lower === "zoom to fit" || lower === "fit to screen") {
        canvasDispatch({ type: "zoom", direction: "fit" })
        addSystemMessage("Zoomed to fit.")
        return true
      }
      if (["page stats", "show stats", "statistics"].includes(lower)) {
        executeCommand("/page-stats")
        return true
      }
    }

    // Global natural language
    const simpleMap: Record<string, string> = {
      "show notes": "/notes", "list notes": "/notes", "my notes": "/notes",
      "show tags": "/tags", "list tags": "/tags", "my tags": "/tags",
      "show tasks": "/tasks", "list tasks": "/tasks", "my tasks": "/tasks",
      "show stats": "/stats", statistics: "/stats", stats: "/stats",
      "show pages": "/pages", "list pages": "/pages", "my pages": "/pages",
      help: "/help", commands: "/help", "what can you do": "/help",
      settings: "/settings", preferences: "/settings",
      export: "/export", "export all": "/export", "export workspace": "/export",
      "run curator": "/curator", curator: "/curator", "clean up": "/curator",
    }
    if (simpleMap[lower]) {
      executeCommand(simpleMap[lower])
      return true
    }

    // Capture detection
    const captureMatch = lower.match(/^(?:capture|save|remember)\s+(.+)$/i)
    if (captureMatch && captureMatch[1].length >= 3) {
      executeCommand(`/capture ${captureMatch[1]}`)
      return true
    }

    return false
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
    if (detectNaturalLanguageCommand(q)) return

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