/**
 * Chat hook for canvas pages — uses SSE streaming.
 */

import { useCallback, useEffect, useMemo, useRef } from "react"
import { create } from "zustand"
import type { MutableRefObject } from "react"
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"
import {
  streamCanvasOps,
  type Viewport,
  type StreamCallbacks,
} from "../lib/canvasOps"
import { CanvasApplier } from "../lib/canvasApplier"
import { useStreamStore } from "./useStream"

export interface ChatMessage {
  role: "user" | "assistant"
  content: string
  sources?: Array<{ id: string; title: string; similarity: number }>
  followUps?: string[]
  intent?: string
  topic?: string
}

interface CanvasChatBridgeState {
  send: ((text: string) => void) | null
  cancel: (() => void) | null
  setHandlers: (
    send: ((text: string) => void) | null,
    cancel: (() => void) | null
  ) => void
}

export const useCanvasChatBridge = create<CanvasChatBridgeState>((set) => ({
  send: null,
  cancel: null,
  setHandlers: (send, cancel) => set({ send, cancel }),
}))

export function useCanvasChat(
  pageId: string,
  excalidrawApiRef: MutableRefObject<ExcalidrawImperativeAPI | null>,
  getViewport: () => Viewport
) {
  const items = useStreamStore((s) => s.items)
  const isLoading = useStreamStore((s) => s.isLoading)
  const currentIntent = useStreamStore((s) => s.canvasIntent)
  const addUserMessage = useStreamStore((s) => s.addUserMessage)
  const addAssistantMessage = useStreamStore((s) => s.addAssistantMessage)
  const upsertAssistantMessage = useStreamStore((s) => s.upsertAssistantMessage)
  const setLoading = useStreamStore((s) => s.setLoading)
  const setCanvasIntent = useStreamStore((s) => s.setCanvasIntent)

  const abortRef = useRef<AbortController | null>(null)
  const applierRef = useRef<CanvasApplier | null>(null)

  const messages = useMemo<ChatMessage[]>(() => {
    return items
      .filter((item) => item.type === "user" || item.type === "assistant")
      .map((item) => {
        if (item.type === "user") {
          return { role: "user", content: item.content }
        }
        return {
          role: "assistant",
          content: item.content,
          sources: item.sources,
          followUps: item.followUps,
        }
      })
  }, [items])

  const getApplier = useCallback(() => {
    const api = excalidrawApiRef.current
    if (!api) return null
    if (!applierRef.current) {
      applierRef.current = new CanvasApplier(api)
    }
    return applierRef.current
  }, [excalidrawApiRef])

  const sendMessage = useCallback(
    (text: string) => {
      if (!text.trim() || isLoading || !pageId) return

      addUserMessage(text)
      setLoading(true)
      setCanvasIntent(null)

      let assistantContent = ""
      let assistantSources: ChatMessage["sources"] = []
      let assistantFollowUps: string[] = []

      abortRef.current?.abort()

      const callbacks: StreamCallbacks = {
        onIntent: (intent, _topic, _meta) => {
          setCanvasIntent(intent)
        },

        onChat: (content) => {
          assistantContent = content
          upsertAssistantMessage(content, assistantSources, assistantFollowUps)
        },

        onCanvasOp: (op) => {
          const applier = getApplier()
          if (applier) {
            applier.apply(op)
          }
        },

        onSources: (sources) => {
          assistantSources = sources
          if (assistantContent) {
            upsertAssistantMessage(assistantContent, sources, assistantFollowUps)
          }
        },

        onFollowUps: (followUps) => {
          assistantFollowUps = followUps
          if (assistantContent) {
            upsertAssistantMessage(assistantContent, assistantSources, followUps)
          }
        },

        onError: (message) => {
          console.error("Canvas stream error:", message)
          if (!assistantContent) {
            assistantContent = `Error: ${message}`
            addAssistantMessage(assistantContent)
          }
        },

        onDone: () => {
          setLoading(false)
          setCanvasIntent(null)

          if (!assistantContent) {
            upsertAssistantMessage("Done.", assistantSources, assistantFollowUps)
          }
        },
      }

      const selectedIds = excalidrawApiRef.current
        ? Object.keys(excalidrawApiRef.current.getAppState().selectedElementIds || {})
        : []

      abortRef.current = streamCanvasOps(
        pageId,
        {
          message: text,
          viewport: getViewport(),
          history: messages.slice(-10).map((m) => ({
            role: m.role,
            content: m.content,
          })),
          selected_element_ids: selectedIds,
          context_type: "page",
        },
        callbacks
      )
    },
    [
      pageId,
      messages,
      isLoading,
      getViewport,
      getApplier,
      excalidrawApiRef,
      addUserMessage,
      addAssistantMessage,
      upsertAssistantMessage,
      setLoading,
      setCanvasIntent,
    ]
  )

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    setLoading(false)
    setCanvasIntent(null)
  }, [setLoading, setCanvasIntent])

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    abortRef.current?.abort()
    setLoading(false)
    setCanvasIntent(null)
  }, [pageId, setLoading, setCanvasIntent])

  useEffect(() => {
    useCanvasChatBridge.getState().setHandlers(sendMessage, cancel)
    return () => {
      useCanvasChatBridge.getState().setHandlers(null, null)
    }
  }, [sendMessage, cancel])

  const clearHistory = useCallback(() => {
    useStreamStore.getState().clearStream()
  }, [])

  return {
    messages,
    isLoading,
    currentIntent,
    sendMessage,
    cancel,
    clearHistory,
  }
}
