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
  | "done";

export interface CanvasOp {
  op: OpType;
  element_id?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  text?: string;
  color?: string;
  theme?: string;
  zoom?: number;
  style?: string;
  note?: Record<string, any>;
  note_id?: string;
  elements?: Record<string, any>[];
  connections?: Record<string, any>[];
  operations?: CanvasOp[];
  topology?: Record<string, any>;
  message?: string;
  metadata?: Record<string, any>;
  timestamp?: number;
}

export interface SSEEvent {
  event: string; // "intent" | "chat" | "canvas_op" | "sources" | "follow_ups" | "error" | "done"
  data: Record<string, any>;
}

export interface Viewport {
  x: number;
  y: number;
  width: number;
  height: number;
  zoom: number;
}

export interface StreamRequest {
  message: string;
  viewport?: Viewport;
  history?: Array<{ role: string; content: string }>;
  selected_element_ids?: string[];
  context_type?: string;
}

export interface StreamCallbacks {
  onIntent?: (intent: string, topic: string, metadata: Record<string, any>) => void;
  onChat?: (content: string) => void;
  onCanvasOp?: (op: CanvasOp) => void;
  onSources?: (sources: Array<{ id: string; title: string; similarity: number }>) => void;
  onFollowUps?: (followUps: string[]) => void;
  onError?: (message: string) => void;
  onDone?: () => void;
}

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000/api";

function normalizeApiBase(base: string): string {
  return base.endsWith("/") ? base.slice(0, -1) : base;
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
  const controller = new AbortController();
  const baseUrl = normalizeApiBase(apiBase);

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
      });

      if (!response.ok) {
        callbacks.onError?.(`HTTP ${response.status}: ${response.statusText}`);
        callbacks.onDone?.();
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        callbacks.onError?.("No response body");
        callbacks.onDone?.();
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let currentEvent = "";
      let currentDataLines: string[] = [];

      const flushEvent = () => {
        if (!currentEvent) return;

        const payload = currentDataLines.join("\n");
        if (!payload) {
          currentEvent = "";
          currentDataLines = [];
          return;
        }

        try {
          const parsed = JSON.parse(payload);
          dispatchEvent(currentEvent, parsed, callbacks);
        } catch {
          console.warn("Failed to parse SSE data:", payload);
        }

        currentEvent = "";
        currentDataLines = [];
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const normalized = line.endsWith("\r") ? line.slice(0, -1) : line;

          if (!normalized) {
            flushEvent();
            continue;
          }

          if (normalized.startsWith("event: ")) {
            currentEvent = normalized.slice(7).trim();
          } else if (normalized.startsWith("data: ")) {
            currentDataLines.push(normalized.slice(6));
          }
        }
      }

      // Flush any terminal event that might not end with a blank line.
      if (currentEvent && currentDataLines.length > 0) {
        flushEvent();
      }
    } catch (e: any) {
      if (e.name !== "AbortError") {
        callbacks.onError?.(e.message || "Stream failed");
      }
    }

    callbacks.onDone?.();
  };

  run();
  return controller;
}

function dispatchEvent(
  event: string,
  data: Record<string, any>,
  callbacks: StreamCallbacks
) {
  switch (event) {
    case "intent":
      callbacks.onIntent?.(data.intent, data.topic, data.metadata || {});
      break;
    case "chat":
      callbacks.onChat?.(data.content);
      break;
    case "canvas_op":
      callbacks.onCanvasOp?.(data as CanvasOp);
      break;
    case "sources":
      callbacks.onSources?.(data.sources || []);
      break;
    case "follow_ups":
      callbacks.onFollowUps?.(data.follow_ups || []);
      break;
    case "error":
      callbacks.onError?.(data.message || "Unknown error");
      break;
    case "done":
      // handled by stream end
      break;
  }
}

function getAuthHeader(): Record<string, string> | null {
  const token =
    localStorage.getItem("mnemos-token") ||
    localStorage.getItem("access_token");
  if (token && token !== "auth-disabled") {
    return { Authorization: `Bearer ${token}` };
  }
  return null;
}
