// === FILE: frontend/src/hooks/use-panel-new.ts ===

import { useMemo } from "react";
import { useAppStore } from "@/store";
import { useChatStore } from "@/store";
import {
  asBoardList,
  asItemList,
  asGraph,
  asSearch,
  asTags,
  asStats,
  asPreferences,
} from "@/lib/utils";

/**
 * Extracts typed panel data from the last chat response.
 * Components use this instead of raw `lastResponse.data`.
 */
export function usePanelData() {
  const lastResponse = useChatStore((s) => s.lastResponse);
  const activePanel = useAppStore((s) => s.activePanel);

  return useMemo(() => {
    const data = lastResponse?.data;
    return {
      boards: activePanel === "boards" ? asBoardList(data) : null,
      items: activePanel === "items" ? asItemList(data) : null,
      graph: activePanel === "graph" ? asGraph(data) : null,
      search: activePanel === "search" ? asSearch(data) : null,
      tags: activePanel === "tags" ? asTags(data) : null,
      stats: activePanel === "stats" ? asStats(data) : null,
      settings: activePanel === "settings" ? asPreferences(data) : null,
    };
  }, [lastResponse, activePanel]);
}
