// === FILE: frontend/src/hooks/use-chat.ts ===

/**
 * THE core hook. Sends messages and routes responses
 * to the correct store/panel/canvas action.
 */

import { useCallback } from "react";
import { api } from "@/lib/client";
import {
  panelForAction,
  extractNavigation,
  shouldReloadCanvas,
  getCanvasVersion,
} from "@/lib/utils";
import { useAppStore, useChatStore, useCanvasStore } from "@/store";

export function useChat() {
  const activeWorkspace = useAppStore((s) => s.activeWorkspace);
  const setActiveWorkspace = useAppStore((s) => s.setActiveWorkspace);
  const setActivePanel = useAppStore((s) => s.setActivePanel);

  const {
    addUserMessage,
    addAssistantMessage,
    setLoading,
    setLastResponse,
    getContext,
  } = useChatStore();

  const { setVersion } = useCanvasStore();

  const send = useCallback(
    async (message: string) => {
      if (!message.trim()) return;

      addUserMessage(message);
      setLoading(true);

      try {
        const response = await api.chat.send(
          message,
          activeWorkspace?.id,
          getContext(),
        );

        addAssistantMessage(response.text);
        setLastResponse(response);

        // 1. Panel routing
        const panel = panelForAction(response.ui_action);
        if (panel !== "none") {
          setActivePanel(panel);
        }

        // 2. Workspace navigation
        const targetWs = extractNavigation(response);
        if (targetWs) {
          setActiveWorkspace(targetWs);
        }

        // 3. Canvas reload
        if (shouldReloadCanvas(response)) {
          const newVersion = getCanvasVersion(response);
          if (newVersion !== null) {
            setVersion(newVersion);
          }
          // Canvas component watches version and reloads
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Something went wrong";
        addAssistantMessage(`Error: ${message}`);
      } finally {
        setLoading(false);
      }
    },
    [
      activeWorkspace,
      addUserMessage,
      addAssistantMessage,
      setLoading,
      setLastResponse,
      getContext,
      setActivePanel,
      setActiveWorkspace,
      setVersion,
    ],
  );

  return { send };
}
