import { useCallback } from "react"
import { api } from "@/api/client"
import { useAppStore, useChatStore, useCanvasStore } from "@/store"
import {
  extractNavigation,
  shouldReloadCanvas,
  getCanvasVersion,
  asPreferences,
} from "@/lib/utils"

/**
 * THE core hook.
 * Sends a message to POST /api/chat, then routes the response:
 *   1. Show response.text + inline card data in chat
 *   2. Handle open_board → set workspace
 *   3. Handle canvas_update → trigger reload
 *   4. Handle settings → store preferences
 */
export function useChat() {
  const activeWorkspace = useAppStore((s) => s.activeWorkspace)
  const setActiveWorkspace = useAppStore((s) => s.setActiveWorkspace)
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

        // 1. Show text + card data inline in chat
        addAssistantMessage(response.text, response)
        setLastResponse(response)

        // 2. Workspace navigation
        const targetWs = extractNavigation(response)
        if (targetWs) {
          setActiveWorkspace(targetWs)
        }

        // 3. Settings
        if (response.ui_action === "open_settings") {
          const prefs = asPreferences(response.data)
          if (prefs) setPreferences(prefs)
        }

        // 4. Canvas reload
        if (shouldReloadCanvas(response)) {
          const v = getCanvasVersion(response)
          if (v !== null) setVersion(v)
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
      setActiveWorkspace, setPreferences, setVersion,
    ],
  )

  return { send }
}