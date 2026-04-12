import { useState, useCallback } from "react"
import { useStream } from "./useStream"
import { useContext } from "./useContext"
import { api } from "../api/client"
import type { Command, ContextType } from "../types"

const COMMANDS: Command[] = [
  { name: "/notes", aliases: ["/n"], description: "Browse notes or filter by tag", context: ["home", "page"], args: "[tag]", handler: "addBlock" },
  { name: "/pages", aliases: ["/p"], description: "List all custom pages", context: ["home"], handler: "handlePages" },
  { name: "/search", aliases: ["/s", "/find"], description: "Search knowledge base", context: ["home", "page"], args: "<query>", handler: "addBlock" },
  { name: "/stats", aliases: [], description: "View workspace statistics", context: ["home"], handler: "addBlock" },
  { name: "/tags", aliases: [], description: "View active tags", context: ["home", "page"], handler: "addBlock" },
  { name: "/tasks", aliases: ["/t"], description: "List extracted tasks", context: ["home", "page"], handler: "addBlock" },
  { name: "/reading", aliases: ["/path"], description: "Generate reading path for topic", context: ["home", "page"], handler: "addBlock" },
  { name: "/gaps", aliases: [], description: "Analyze missing subtopics", context: ["home", "page"], handler: "addBlock" },
  { name: "/curator", aliases: ["/clean"], description: "Run maintenance scan", context: ["home"], handler: "addBlock" },
  { name: "/history", aliases: ["/h"], description: "View past chats", context: ["home"], handler: "addBlock" },
  { name: "/settings", aliases: [], description: "Manage application settings", context: ["home"], handler: "addBlock" },
  { name: "/clear", aliases: ["/c"], description: "Clear current stream", context: ["home", "page", "history", "settings"], handler: "clearStream" },
  { name: "/help", aliases: ["/?"], description: "Show available commands", context: ["home", "page", "settings", "history"], handler: "addBlock" }
]

export function useCommands() {
  const [inputValue, setInputValue] = useState("")
  const [suggestions, setSuggestions] = useState<Command[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)

  const { items, addUserMessage, addAssistantMessage, addBlock, clearStream, setLoading } = useStream()
  const { current, switchTo } = useContext()

  const getAutoComplete = useCallback((partial: string, activeContext: ContextType) => {
    if (!partial.startsWith("/")) return []
    const term = partial.toLowerCase()
    return COMMANDS.filter(c => 
       c.context.includes(activeContext) && 
       (c.name.startsWith(term) || c.aliases.some(a => a.startsWith(term)))
    )
  }, [])

  const handleInput = (val: string) => {
    setInputValue(val)
    if (val.startsWith("/")) {
       const parts = val.split(" ")
       if (parts.length === 1) { // Only suggest while typing command root
         setSuggestions(getAutoComplete(val, current.type))
         setSelectedIndex(0)
       } else {
         setSuggestions([])
       }
    } else {
      setSuggestions([])
    }
  }

  const executeCommand = async (q: string) => {
    const parts = q.trim().split(" ")
    const cmdStr = parts[0].toLowerCase()
    const args = parts.slice(1)
    const cmd = COMMANDS.find(c => c.name === cmdStr || c.aliases.includes(cmdStr))

    if (!cmd) {
      addAssistantMessage(`Unknown command: ${cmdStr}. Type /help for available commands.`)
      return
    }

    if (!cmd.context.includes(current.type)) {
      addAssistantMessage(`Command ${cmdStr} is not available in ${current.type} context.`)
      return
    }

    try {
      switch (cmd.name) {
         case "/notes":
           addBlock("note-grid", undefined, { tag: args[0]?.replace("#", ""), pageId: current.pageId })
           break
         case "/pages":
           if (current.type !== "home") {
              switchTo("home")
           }
           addBlock("page-list")
           break
         case "/search":
           if (args.length === 0) {
              addAssistantMessage("Please provide a search query. Example: /search docker")
           } else {
              addBlock("search-results", undefined, { query: args.join(" "), pageId: current.pageId })
           }
           break
         case "/stats":
           addBlock("stats")
           break
         case "/tags":
           addBlock("tag-cloud")
           break
         case "/tasks":
           addBlock("task-list", undefined, { pageId: current.pageId })
           break
         case "/reading":
           addBlock("reading-path", undefined, { topic: args.join(" ") || undefined, pageId: current.pageId })
           break
         case "/gaps":
           addBlock("gap-analysis", undefined, { pageId: current.pageId })
           break
         case "/curator":
           addBlock("curator-report")
           break
         case "/history":
           switchTo("history")
           addBlock("history")
           break
         case "/settings":
           switchTo("settings")
           addBlock("settings")
           break
         case "/clear":
           clearStream()
           break
         case "/help":
           addBlock("help")
           break
         default:
           addAssistantMessage("Command logic missing for: " + cmd.name)
      }
    } catch (e) {
       console.error("Command execution error", e)
       addAssistantMessage("An error occurred executing the command.")
    }
  }

  const handleSubmit = async () => {
    if (!inputValue.trim()) return
    const q = inputValue.trim()
    
    // If selecting from suggestions
    if (suggestions.length > 0 && selectedIndex >= 0 && selectedIndex < suggestions.length) {
       const selected = suggestions[selectedIndex]
       setInputValue(selected.name + " ")
       setSuggestions([])
       return
    }
    
    setInputValue("")
    setSuggestions([])
    addUserMessage(q)

    if (q.startsWith("/")) {
       executeCommand(q)
       return
    }

    setLoading(true)
    try {
      const history = items
         .filter(i => i.type === "user" || i.type === "assistant")
         .slice(-6)
         .map(i => ({ role: i.type, content: i.content || "" }))
         
      const resp = await api.chat(q, history, current.type, current.pageId)
      addAssistantMessage(resp.answer || "Done.", resp.sources, resp.follow_ups)
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
    handleSubmit
  }
}
