import { useCallback } from "react"
import { api } from "@/api/client"
import { useAppStore, useChatStore, useCanvasStore } from "@/store"
import {
  panelForAction,
  extractNavigation,
  shouldReloadCanvas,
  getCanvasVersion,
  asPreferences,
} from "@/lib/utils"

/**
 * THE core hook.
 * Sends a message to POST /api/chat, then routes the response:
 *   1. Always show response.text in chat
 *   2. Map ui_action → panel
 *   3. Handle open_board → set workspace
 *   4. Handle canvas_update → trigger reload
 *   5. Handle open_settings → store preferences
 */
export function useChat() {
  const activeWorkspace = useAppStore((s) => s.activeWorkspace)
  const setActiveWorkspace = useAppStore((s) => s.setActiveWorkspace)
  const setActivePanel = useAppStore((s) => s.setActivePanel)
  const setPreferences = useAppStore((s) => s.setPreferences)

  const addUserMessage = useChatStore((s) => s.addUserMessage)
  const addAssistantMessage = useChatStore((s) => s.addAssistantMessage)
  const setLoading = useChatStore((s) => s.setLoading)
  const setLastResponse = useChatStore((s) => s.setLastResponse)
  const getContext = useChatStore((s) => s.getContext)

  const setVersion = useCanvasStore((s) => s.setVersion)

  const send = useCallback(
    async (message: string) => {
      const trimmed = message.trim()
      if (!trimmed) return

      addUserMessage(trimmed)
      setLoading(true)

      try {
        const response = await api.chat.send(
          trimmed,
          activeWorkspace?.id ?? null,
          getContext(),
        )

        // 1. Always show text
        addAssistantMessage(response.text)
        setLastResponse(response)

        // 2. Error?
        if (response.error) {
          // Error styling is handled by ChatMessage via response.error
          return
        }

        // 3. Panel routing
        const panel = panelForAction(response.ui_action)
        if (panel !== "none") {
          setActivePanel(panel)
        }

        // 4. Workspace navigation
        const targetWs = extractNavigation(response)
        if (targetWs) {
          setActiveWorkspace(targetWs) // also closes panels
        }

        // 5. Settings
        if (response.ui_action === "open_settings") {
          const prefs = asPreferences(response.data)
          if (prefs) setPreferences(prefs)
        }

        // 6. Canvas reload
        if (shouldReloadCanvas(response)) {
          const v = getCanvasVersion(response)
          if (v !== null) setVersion(v)
          // Canvas component watches version and calls loadScene
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Something went wrong"
        addAssistantMessage(`⚠️ ${msg}`)
      } finally {
        setLoading(false)
      }
    },
    [
      activeWorkspace, addUserMessage, addAssistantMessage,
      setLoading, setLastResponse, getContext,
      setActivePanel, setActiveWorkspace, setPreferences, setVersion,
    ],
  )

  return { send }
}