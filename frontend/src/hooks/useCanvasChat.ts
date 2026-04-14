/**
 * Chat hook for canvas pages — uses SSE streaming.
 */

import { useState, useCallback, useRef } from "react";
import {
  streamCanvasOps,
  type Viewport,
  type StreamCallbacks,
} from "../lib/canvasOps";
import { CanvasApplier } from "../lib/canvasApplier";


export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: Array<{ id: string; title: string; similarity: number }>;
  followUps?: string[];
  intent?: string;
  topic?: string;
}

export function useCanvasChat(
  pageId: string,
  excalidrawApiRef: React.MutableRefObject<any>,
  getViewport: () => Viewport
) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentIntent, setCurrentIntent] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const applierRef = useRef<CanvasApplier | null>(null);

  const getApplier = useCallback(() => {
    const api = excalidrawApiRef.current;
    if (!api) return null;
    if (!applierRef.current) {
      applierRef.current = new CanvasApplier(api);
    }
    return applierRef.current;
  }, [excalidrawApiRef]);

  const sendMessage = useCallback(
    (text: string) => {
      if (!text.trim() || isLoading) return;

      // Add user message
      const userMsg: ChatMessage = { role: "user", content: text };
      setMessages((prev) => [...prev, userMsg]);
      setIsLoading(true);
      setCurrentIntent(null);

      // Build assistant message progressively
      let assistantContent = "";
      let assistantIntent = "";
      let assistantTopic = "";

      // Cancel previous stream
      abortRef.current?.abort();

      const callbacks: StreamCallbacks = {
        onIntent: (intent, topic, _meta) => {
          assistantIntent = intent;
          assistantTopic = topic;
          setCurrentIntent(intent);
        },

        onChat: (content) => {
          assistantContent = content;
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === "assistant") {
              return [
                ...prev.slice(0, -1),
                {
                  ...last,
                  content,
                  intent: assistantIntent,
                  topic: assistantTopic,
                },
              ];
            }
            return [
              ...prev,
              {
                role: "assistant",
                content,
                intent: assistantIntent,
                topic: assistantTopic,
              },
            ];
          });
        },

        onCanvasOp: (op) => {
          const applier = getApplier();
          if (applier) {
            applier.apply(op);
          }
        },

        onSources: (sources) => {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === "assistant") {
              return [...prev.slice(0, -1), { ...last, sources }];
            }
            return prev;
          });
        },

        onFollowUps: (followUps) => {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === "assistant") {
              return [...prev.slice(0, -1), { ...last, followUps }];
            }
            return prev;
          });
        },

        onError: (message) => {
          console.error("Canvas stream error:", message);
          if (!assistantContent) {
            assistantContent = `Error: ${message}`;
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: assistantContent },
            ]);
          }
        },

        onDone: () => {
          setIsLoading(false);
          setCurrentIntent(null);

          // Ensure assistant message exists
          if (!assistantContent) {
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last?.role !== "assistant") {
                return [...prev, { role: "assistant", content: "Done." }];
              }
              return prev;
            });
          }
        },
      };

      const selectedIds = excalidrawApiRef.current
        ? Object.keys(
            excalidrawApiRef.current.getAppState().selectedElementIds || {}
          )
        : [];

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
      );
    },
    [pageId, messages, isLoading, getViewport, getApplier, excalidrawApiRef]
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setIsLoading(false);
    setCurrentIntent(null);
  }, []);

  const clearHistory = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    messages,
    isLoading,
    currentIntent,
    sendMessage,
    cancel,
    clearHistory,
  };
}
