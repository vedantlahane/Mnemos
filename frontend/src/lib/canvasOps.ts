/**
 * Canvas Operations Protocol — client-side handler.
 * Receives SSE events from backend, applies them to Excalidraw.
 */

export type OpType =
  | "create_note"
  | "create_text"
  | "create_diagram"
  | "create_sticky"
  | "update_element"
  | "move_element"
  | "delete_element"
  | "group_elements"
  | "create_edge_line"
  | "set_background"
  | "set_theme"
  | "pan_to"
  | "zoom_to"
  | "stream_start"
  | "stream_chunk"
  | "stream_end"
  | "arrange_cluster"
  | "batch"
  | "info"
  | "error"
  | "done"

export interface CanvasOp {
  op: OpType
  element_id?: string
  x?: number
  y?: number
  width?: number
  height?: number
  text?: string
  color?: string
  theme?: string
  zoom?: number
  style?: string
  note?: Record<string, unknown>
  note_id?: string
  elements?: Record<string, unknown>[]
  connections?: Record<string, unknown>[]
  operations?: CanvasOp[]
  topology?: Record<string, unknown>
  message?: string
  metadata?: Record<string, unknown>
  timestamp?: number
}

export interface SSEEvent {
  event: string
  data: Record<string, unknown>
}

export interface Viewport {
  x: number
  y: number
  width: number
  height: number
  zoom: number
}

export interface StreamRequest {
  message: string
  viewport?: Viewport
  history?: Array<{ role: string; content: string }>
  selected_element_ids?: string[]
  context_type?: string
}

export interface StreamCallbacks {
  onIntent?: (
    intent: string,
    topic: string,
    metadata: Record<string, unknown>
  ) => void
  onChat?: (content: string) => void
  onCanvasOp?: (op: CanvasOp) => void
  onSources?: (
    sources: Array<{ id: string; title: string; similarity: number }>
  ) => void
  onFollowUps?: (followUps: string[]) => void
  onError?: (message: string) => void
  onDone?: () => void
}

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000/api"

function normalizeApiBase(base: string): string {
  return base.endsWith("/") ? base.slice(0, -1) : base
}

function getAuthHeader(): Record<string, string> | null {
  const token =
    localStorage.getItem("mnemos-token") ||
    localStorage.getItem("access_token")
  if (token && token !== "auth-disabled") {
    return { Authorization: `Bearer ${token}` }
  }
  return null
}

/**
 * Stream canvas operations from the backend via SSE.
 * Returns an AbortController so the caller can cancel.
 */
export function streamCanvasOps(
  pageId: string,
  request: StreamRequest,
  callbacks: StreamCallbacks,
  apiBase: string = API_BASE
): AbortController {
  const controller = new AbortController()
  const baseUrl = normalizeApiBase(apiBase)

  const run = async () => {
    try {
      const response = await fetch(`${baseUrl}/canvas/${pageId}/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(getAuthHeader() || {}),
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
        callbacks.onError?.("No response body")
        callbacks.onDone?.()
        return
      }

      const decoder = new TextDecoder()
      let buffer = ""
      let currentEvent = ""
      let currentDataLines: string[] = []

      const flushEvent = () => {
        if (!currentEvent) return

        const payload = currentDataLines.join("\n")
        if (!payload) {
          currentEvent = ""
          currentDataLines = []
          return
        }

        try {
          const parsed = JSON.parse(payload)
          dispatchEvent(currentEvent, parsed, callbacks)
        } catch {
          console.warn("Failed to parse SSE data:", payload)
        }

        currentEvent = ""
        currentDataLines = []
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() || ""

        for (const line of lines) {
          const normalized = line.endsWith("\r") ? line.slice(0, -1) : line

          if (!normalized) {
            flushEvent()
            continue
          }

          if (normalized.startsWith("event: ")) {
            currentEvent = normalized.slice(7).trim()
          } else if (normalized.startsWith("data: ")) {
            currentDataLines.push(normalized.slice(6))
          }
        }
      }

      // Flush terminal event
      if (currentEvent && currentDataLines.length > 0) {
        flushEvent()
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== "AbortError") {
        callbacks.onError?.(e.message || "Stream failed")
      }
    }

    callbacks.onDone?.()
  }

  run()
  return controller
}

function dispatchEvent(
  event: string,
  data: Record<string, unknown>,
  callbacks: StreamCallbacks
) {
  switch (event) {
    case "intent":
      callbacks.onIntent?.(
        data.intent as string,
        data.topic as string,
        (data.metadata as Record<string, unknown>) || {}
      )
      break
    case "chat":
      callbacks.onChat?.(data.content as string)
      break
    case "canvas_op":
      callbacks.onCanvasOp?.(data as unknown as CanvasOp)
      break
    case "sources":
      callbacks.onSources?.(
        (data.sources as Array<{
          id: string
          title: string
          similarity: number
        }>) || []
      )
      break
    case "follow_ups":
      callbacks.onFollowUps?.((data.follow_ups as string[]) || [])
      break
    case "error":
      callbacks.onError?.((data.message as string) || "Unknown error")
      break
    case "done":
      break
  }
}