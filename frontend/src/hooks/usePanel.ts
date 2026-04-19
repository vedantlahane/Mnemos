import { useMemo } from "react"
import { useAppStore, useChatStore } from "@/store"
import {
  asBoardList,
  asItemList,
  asGraph,
  asSearch,
  asTags,
  asStats,
  asPreferences,
} from "@/lib/utils"

/**
 * Extracts typed panel data from the last chat response.
 * Each panel component calls this and reads only its own key.
 */
export function usePanel() {
  const panel = useAppStore((s) => s.activePanel)
  const lastResponse = useChatStore((s) => s.lastResponse)

  return useMemo(() => {
    const data = lastResponse?.data
    return {
      boards: panel === "boards" ? asBoardList(data) : null,
      items: panel === "items" ? asItemList(data) : null,
      graph: panel === "graph" ? asGraph(data) : null,
      search: panel === "search" ? asSearch(data) : null,
      tags: panel === "tags" ? asTags(data) : null,
      stats: panel === "stats" ? asStats(data) : null,
      settings: panel === "settings" ? asPreferences(data) : null,
    }
  }, [panel, lastResponse])
}