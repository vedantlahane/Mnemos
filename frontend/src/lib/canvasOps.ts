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

/**
 * Stream canvas operations from the backend via SSE.
 * Returns an AbortController so the caller can cancel.
 */
export function streamCanvasOps(
  pageId: string,
  request: StreamRequest,
  callbacks: StreamCallbacks,
  apiBase: string = "/api"
): AbortController {
  const controller = new AbortController();

  const run = async () => {
    try {
      const response = await fetch(`${apiBase}/canvas/${pageId}/stream`, {
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

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        let currentEvent = "";
        let currentData = "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            currentData = line.slice(6);

            if (currentEvent && currentData) {
              try {
                const parsed = JSON.parse(currentData);
                dispatchEvent(currentEvent, parsed, callbacks);
              } catch (e) {
                console.warn("Failed to parse SSE data:", currentData);
              }
              currentEvent = "";
              currentData = "";
            }
          }
        }
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
