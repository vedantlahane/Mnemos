/**
 * Canvas SSE bridge for Mnemos v2.0.
 * Parses text/event-stream payloads from POST /api/pages/:id/chat.
 */

import type { CanvasOp, Viewport } from "../types"

export type { CanvasOp, Viewport }

export interface StreamRequest {
  message: string
  viewport?: Viewport
  history?: Array<{ role: string; content: string }>
  selected_element_ids?: string[]
  context_type?: string
}

export interface StreamCallbacks {
  onIntent?: (intent: string, topic: string, metadata: Record<string, unknown>) => void
  onChat?: (content: string) => void
  onCanvasOp?: (op: CanvasOp) => void
  onSources?: (sources: Array<{ id: string; title: string; similarity: number }>) => void
  onFollowUps?: (followUps: string[]) => void
  onError?: (message: string) => void
  onDone?: () => void
}

const RAW_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000"
const BASE_URL = RAW_BASE.replace(/\/$/, "").replace(/\/api$/, "")
const API = `${BASE_URL}/api`

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("mnemos-token") || localStorage.getItem("access_token")
  if (token && token !== "auth-disabled") {
    return { Authorization: `Bearer ${token}` }
  }
  return {}
}

function parseIntentMessage(message: string): { intent: string; topic: string } | null {
  // Expected examples: "Intent: compose, Topic: neural networks"
  const intentMatch = message.match(/Intent:\s*([a-z_\-]+)/i)
  if (!intentMatch) {
    return null
  }
  const topicMatch = message.match(/Topic:\s*(.+)$/i)
  return {
    intent: intentMatch[1].toLowerCase(),
    topic: topicMatch ? topicMatch[1].trim() : "",
  }
}

function dispatchOp(op: CanvasOp, callbacks: StreamCallbacks): void {
  if (op.op === "done") {
    callbacks.onDone?.()
    return
  }

  if (op.op === "error") {
    callbacks.onError?.(op.message || "Canvas stream error")
    return
  }

  if (op.op === "info") {
    const metadata = (op.metadata || {}) as Record<string, unknown>

    const intentFromMetadata = typeof metadata.intent === "string" ? metadata.intent : undefined
    const topicFromMetadata = typeof metadata.topic === "string" ? metadata.topic : ""
    if (intentFromMetadata) {
      callbacks.onIntent?.(intentFromMetadata, topicFromMetadata, metadata)
    } else if (typeof op.message === "string") {
      const parsed = parseIntentMessage(op.message)
      if (parsed) {
        callbacks.onIntent?.(parsed.intent, parsed.topic, metadata)
      }
    }

    if (Array.isArray(metadata.sources)) {
      callbacks.onSources?.(
        metadata.sources
          .filter((item): item is { id: string; title: string; similarity: number } => {
            return (
              !!item &&
              typeof item === "object" &&
              typeof (item as Record<string, unknown>).id === "string" &&
              typeof (item as Record<string, unknown>).title === "string"
            )
          })
          .map((item) => ({
            id: item.id,
            title: item.title,
            similarity: typeof item.similarity === "number" ? item.similarity : 0,
          })),
      )
    }

    if (Array.isArray(metadata.follow_ups)) {
      callbacks.onFollowUps?.(
        metadata.follow_ups
          .filter((item): item is string => typeof item === "string")
          .slice(0, 8),
      )
    }

    // Chat response/info text should be surfaced in the assistant stream.
    const hasExplicitChatType = metadata.type === "chat_response"
    const hasSources = Array.isArray(metadata.sources)
    const hasSearchResults = Array.isArray(metadata.results)
    const hasNavigateTarget = typeof metadata.navigate_to_page === "string"
    if ((hasExplicitChatType || hasSources || hasSearchResults || hasNavigateTarget) && op.message) {
      callbacks.onChat?.(op.message)
    }

    // Also forward info op to canvas layer for navigation/status handlers.
    callbacks.onCanvasOp?.(op)
    return
  }

  callbacks.onCanvasOp?.(op)
}

export function streamCanvasOps(
  pageId: string,
  request: StreamRequest,
  callbacks: StreamCallbacks,
): AbortController {
  const controller = new AbortController()

  void (async () => {
    try {
      const response = await fetch(`${API}/pages/${pageId}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      })

      if (!response.ok) {
        callbacks.onError?.(`HTTP ${response.status}: ${response.statusText}`)
        callbacks.onDone?.()
        return
      }

      const reader = response.body?.getReader()
      if (!reader) {
        callbacks.onError?.("No response body from canvas stream")
        callbacks.onDone?.()
        return
      }

      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          break
        }

        buffer += decoder.decode(value, { stream: true })
        const events = buffer.split("\n\n")
        buffer = events.pop() || ""

        for (const event of events) {
          const lines = event.split("\n")
          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed.startsWith("data:")) {
              continue
            }
            const payload = trimmed.slice(5).trim()
            if (!payload) {
              continue
            }

            try {
              const op = JSON.parse(payload) as CanvasOp
              dispatchOp(op, callbacks)
              if (op.op === "done") {
                return
              }
            } catch {
              // Ignore malformed chunks and continue stream processing.
            }
          }
        }
      }

      callbacks.onDone?.()
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        callbacks.onDone?.()
        return
      }
      callbacks.onError?.(error instanceof Error ? error.message : "Canvas stream failed")
      callbacks.onDone?.()
    }
  })()

  return controller
}
