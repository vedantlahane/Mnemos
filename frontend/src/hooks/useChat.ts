import { useCallback } from "react"
import { api } from "@/api/client"
import { useAppStore, useChatStore, useCanvasStore } from "@/store"
import {
  extractNavigation,
  shouldReloadCanvas,
  asPreferences,
} from "@/lib/utils"

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
  const requestReload = useCanvasStore((s) => s.requestReload)

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

        setLastResponse(response)

        // Always add assistant message to chat
        addAssistantMessage(response.text, response)

        // Update preferences if settings response
        if (response.ui_action === "open_settings" || response.intent === "settings") {
          const prefs = asPreferences(response.data)
          if (prefs) setPreferences(prefs)
        }

        // Workspace navigation
        const targetWs = extractNavigation(response)
        if (targetWs) {
          setActiveWorkspace(targetWs)
        }

        // Canvas reload
        if (shouldReloadCanvas(response)) {
          const v = response.canvas_update?.version
          if (v != null) setVersion(v)
          requestReload()
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Something went wrong"
        addAssistantMessage(`⚠️ ${msg}`)
      } finally {
        setLoading(false)
      }
    },
    [
      activeWorkspace,
      addUserMessage,
      addAssistantMessage,
      setLoading,
      setLastResponse,
      getContext,
      setActiveWorkspace,
      setPreferences,
      setVersion,
      requestReload,
    ],
  )

  return { send }
}