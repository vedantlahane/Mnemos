import { useState, useCallback } from "react"
import { useStream } from "./useStream"
import { useAppContext } from "./useAppContext"
import { api } from "../api/client"
import type { Command, ContextType } from "../types"

// ─── Complete command list per spec §3.4 ─────────────

const COMMANDS: Command[] = [
  // HOME CONTEXT
  { name: "/pages",    aliases: ["/p"],           description: "List all pages with stats",       context: ["home"],                             handler: "pages" },
  { name: "/page",     aliases: [],               description: "Create or delete a page",         context: ["home"],          args: "create|delete [name]", handler: "page" },
  { name: "/open",     aliases: ["/o"],           description: "Open a page canvas",              context: ["home", "page", "settings", "history"], args: "<page name>", handler: "open" },
  { name: "/search",   aliases: ["/s"],           description: "Semantic search",                 context: ["home", "page"],  args: "<query>",    handler: "search" },
  { name: "/notes",    aliases: ["/n"],           description: "Browse notes (optional #tag)",    context: ["home", "page"],  args: "[#tag|recent]", handler: "notes" },
  { name: "/tags",     aliases: [],               description: "View tag cloud with counts",      context: ["home", "page"],                      handler: "tags" },
  { name: "/tasks",    aliases: ["/t"],           description: "List all tasks across pages",     context: ["home", "page"],                      handler: "tasks" },
  { name: "/stats",    aliases: [],               description: "Workspace statistics",             context: ["home"],                             handler: "stats" },
  { name: "/capture",  aliases: [],               description: "Quick capture a note",             context: ["home", "page"],  args: "<text> [--page X]", handler: "capture" },
  { name: "/curator",  aliases: ["/clean"],       description: "Run maintenance scan",             context: ["home"],                             handler: "curator" },

  // PAGE CONTEXT
  { name: "/find",     aliases: [],               description: "Highlight on canvas (Ctrl+F)",    context: ["page"],          args: "<text>",     handler: "find" },
  { name: "/add",      aliases: [],               description: "Add sticky note to canvas",       context: ["page"],          args: "<text>",     handler: "add" },
  { name: "/layout",   aliases: ["/reorganize"],  description: "Auto-reorganize canvas",          context: ["page"],                             handler: "layout" },
  { name: "/summarize",aliases: [],               description: "AI summarizes all page content",  context: ["page"],                             handler: "summarize" },
  { name: "/gaps",     aliases: [],               description: "What's missing on this page",     context: ["home", "page"],                      handler: "gaps" },
  { name: "/reading",  aliases: ["/path"],        description: "Suggested reading order",         context: ["home", "page"],  args: "[topic]",    handler: "reading" },
  { name: "/export",   aliases: [],               description: "Export page as markdown",         context: ["page"],                             handler: "export" },
  { name: "/rename",   aliases: [],               description: "Rename current page",             context: ["page"],          args: "<new name>", handler: "rename" },
  { name: "/close",    aliases: [],               description: "Close page, return to home",      context: ["page", "settings", "history"],       handler: "close" },

  // WORKS ANYWHERE
  { name: "/settings", aliases: [],               description: "Open settings",                    context: ["home", "page", "settings", "history"], handler: "settings" },
  { name: "/history",  aliases: ["/h"],           description: "View past conversations",          context: ["home", "page", "settings", "history"], handler: "history" },
  { name: "/home",     aliases: [],               description: "Go to home context",               context: ["home", "page", "settings", "history"], handler: "home" },
  { name: "/back",     aliases: [],               description: "Go to previous context",           context: ["home", "page", "settings", "history"], handler: "back" },
  { name: "/clear",    aliases: ["/c"],           description: "Clear conversation stream",        context: ["home", "page", "settings", "history"], handler: "clear" },
  { name: "/help",     aliases: ["/?"],           description: "Show all commands",                context: ["home", "page", "settings", "history"], handler: "help" },
]

export function useCommands() {
  const [inputValue, setInputValue] = useState("")
  const [suggestions, setSuggestions] = useState<Command[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)

  const { items, addUserMessage, addAssistantMessage, addBlock, addSystemMessage, clearStream, setLoading } = useStream()
  const { current, switchTo, goBack, goHome } = useAppContext()

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

  // ─── Command Execution Engine ─────────────────────

  const executeCommand = async (raw: string) => {
    const parts = raw.trim().split(/\s+/)
    const cmdStr = parts[0].toLowerCase()
    const args = parts.slice(1).join(" ")

    const cmd = COMMANDS.find(
      (c) => c.name === cmdStr || c.aliases.includes(cmdStr)
    )

    if (!cmd) {
      addAssistantMessage(`Unknown command: \`${cmdStr}\`. Type **/help** for available commands.`)
      return
    }

    if (!cmd.context.includes(current.type)) {
      addAssistantMessage(`**${cmdStr}** is not available in **${current.type}** context. Type /help to see what works here.`)
      return
    }

    switch (cmd.handler) {
      // ─── Navigation ─────────────────
      case "open": {
        if (!args) {
          addAssistantMessage("Usage: `/open <page name>`")
          return
        }
        try {
          const res = await api.listPages()
          const pages = res.pages || res || []
          const match = pages.find(
            (p: { name: string }) => p.name.toLowerCase() === args.toLowerCase()
          )
          if (match) {
            switchTo("page", match.id, match.name)
            addSystemMessage(`Opened page: ${match.icon || "📄"} ${match.name}`)
          } else {
            addAssistantMessage(`Page "${args}" not found. Available pages:\n${pages.map((p: { icon: string; name: string }) => `• ${p.icon} ${p.name}`).join("\n")}`)
          }
        } catch {
          addAssistantMessage("Failed to load pages.")
        }
        break
      }

      case "close":
        goHome()
        addSystemMessage("Returned to home.")
        addBlock("welcome")
        break

      case "home":
        goHome()
        addSystemMessage("Returned to home.")
        addBlock("welcome")
        break

      case "back":
        goBack()
        addSystemMessage("Navigated back.")
        break

      // ─── Content Commands ───────────
      case "pages":
        addBlock("page-list")
        break

      case "page": {
        const sub = parts[1]?.toLowerCase()
        const name = parts.slice(2).join(" ")
        if (sub === "create" && name) {
          try {
            await api.createPage({ name })
            addSystemMessage(`Created page: ${name}`)
            addBlock("page-list")
          } catch {
            addAssistantMessage(`Failed to create page "${name}". It may already exist.`)
          }
        } else if (sub === "delete" && name) {
          try {
            const res = await api.listPages()
            const pages = res.pages || res || []
            const match = pages.find(
              (p: { name: string }) => p.name.toLowerCase() === name.toLowerCase()
            )
            if (match) {
              await api.deletePage(match.id)
              addSystemMessage(`Deleted page: ${name}. Notes moved to Uncategorized.`)
            } else {
              addAssistantMessage(`Page "${name}" not found.`)
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
        const tag = args.startsWith("#") ? args.slice(1) : args === "recent" ? undefined : args || undefined
        const limit = args === "recent" ? 10 : undefined
        addBlock("note-grid", { limit }, { tag, pageId: current.pageId })
        break
      }

      case "search":
        if (!args) {
          addAssistantMessage("Usage: `/search <query>`\nExample: `/search docker networking`")
        } else {
          addBlock("search-results", undefined, { query: args, pageId: current.pageId })
        }
        break

      case "stats":
        addBlock("stats")
        break

      case "tags":
        addBlock("tag-cloud")
        break

      case "tasks":
        addBlock("task-list", undefined, { pageId: current.pageId })
        break

      case "capture": {
        if (!args) {
          addAssistantMessage("Usage: `/capture <text>` or `/capture <text> --page Docker`")
          return
        }
        const pageMatch = args.match(/--page\s+(.+)$/i)
        const text = pageMatch ? args.replace(pageMatch[0], "").trim() : args
        const pageHint = pageMatch?.[1]?.trim() || undefined
        try {
          setLoading(true)
          const resp = await api.capture({
            text,
            capture_type: "manual",
            page_hint: pageHint,
          })
          addSystemMessage(`✓ Note captured${resp.page_name ? ` → ${resp.page_name}` : ""}. Processing in background.`)
        } catch {
          addAssistantMessage("Failed to capture note.")
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

      // ─── Page-context canvas commands ───
      case "find":
        if (!args) {
          addAssistantMessage("Usage: `/find <search text>`")
        } else {
          // Dispatches to canvas search — useCanvasSearch listens
          window.dispatchEvent(new CustomEvent("canvas:search", { detail: args }))
          addSystemMessage(`Searching canvas for "${args}"...`)
        }
        break

      case "add":
        if (!args) {
          addAssistantMessage("Usage: `/add <text>` — adds a sticky note to canvas")
        } else {
          try {
            await api.createElement(current.pageId!, {
              element_type: "sticky",
              content: args,
              position_x: 100 + Math.random() * 400,
              position_y: 100 + Math.random() * 400,
            })
            addSystemMessage(`Sticky note added to canvas.`)
            window.dispatchEvent(new CustomEvent("canvas:refresh"))
          } catch {
            addAssistantMessage("Failed to add element.")
          }
        }
        break

      case "layout":
        try {
          setLoading(true)
          addSystemMessage("Reorganizing canvas layout...")
          await api.triggerPageLayout(current.pageId!)
          window.dispatchEvent(new CustomEvent("canvas:refresh"))
          addSystemMessage("✓ Canvas reorganized.")
        } catch {
          addAssistantMessage("Failed to trigger layout.")
        } finally {
          setLoading(false)
        }
        break

      case "summarize": {
        setLoading(true)
        try {
          const resp = await api.chat(
            `Summarize everything on this page.`,
            [],
            "page",
            current.pageId
          )
          addAssistantMessage(resp.answer || "No summary available.", resp.sources, resp.follow_ups)
        } catch {
          addAssistantMessage("Failed to summarize page.")
        } finally {
          setLoading(false)
        }
        break
      }

      case "export":
        addAssistantMessage("Export is not yet implemented. Coming in v2.5.")
        break

      case "rename": {
        if (!args) {
          addAssistantMessage("Usage: `/rename <new name>`")
          return
        }
        try {
          await api.updatePage(current.pageId!, { name: args })
          switchTo("page", current.pageId, args)
          addSystemMessage(`Page renamed to "${args}".`)
        } catch {
          addAssistantMessage("Failed to rename page.")
        }
        break
      }

      // ─── Global ─────────────────────
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
        addAssistantMessage(`Command handler missing: ${cmd.handler}`)
    }
  }

  // ─── Natural Language Detection ───────────────────

  function detectNaturalLanguageCommand(text: string): boolean {
    const lower = text.toLowerCase().trim()

    // "open <page>" pattern
    const openMatch = lower.match(/^open\s+(.+)$/)
    if (openMatch) {
      executeCommand(`/open ${openMatch[1]}`)
      return true
    }

    // "close" / "go home" / "go back"
    if (lower === "close" || lower === "go home") {
      executeCommand("/home")
      return true
    }
    if (lower === "go back") {
      executeCommand("/back")
      return true
    }

    return false
  }

  // ─── Submit Handler ───────────────────────────────

  const handleSubmit = async () => {
    if (!inputValue.trim()) return
    const q = inputValue.trim()

    // If autocomplete is open and user hits Enter on a suggestion, fill it
    if (suggestions.length > 0 && q.startsWith("/") && !q.includes(" ")) {
      const selected = suggestions[selectedIndex]
      if (selected) {
        setInputValue(selected.name + " ")
        setSuggestions([])
        return
      }
    }

    setInputValue("")
    setSuggestions([])

    // Commands
    if (q.startsWith("/")) {
      addUserMessage(q)
      await executeCommand(q)
      return
    }

    addUserMessage(q)

    // Natural language shortcuts
    if (detectNaturalLanguageCommand(q)) return

    // Default: send to Researcher Agent (RAG chat)
    setLoading(true)
    try {
      const history = items
        .filter((i) => i.type === "user" || i.type === "assistant")
        .slice(-10)
        .map((i) => ({ role: i.type as string, content: i.content || "" }))

      const resp = await api.chat(q, history, current.type, current.pageId)
      addAssistantMessage(
        resp.answer || "I couldn't find relevant information.",
        resp.sources,
        resp.follow_ups
      )
    } catch {
      addAssistantMessage("Error connecting to backend. Is the server running?")
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