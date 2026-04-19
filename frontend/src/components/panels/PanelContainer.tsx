import { X } from "lucide-react"
import { useAppStore } from "@/store"
import { BoardsPanel } from "./BoardsPanel"
import { ItemsPanel } from "./ItemsPanel"
import { SettingsPanel } from "./SettingsPanel"
import { GraphPanel } from "./GraphPanel"
import { TagsPanel } from "./TagsPanel"
import { StatsPanel } from "./StatsPanel"
import { SearchPanel } from "./SearchPanel"

const PANELS: Record<string, React.ComponentType> = {
  boards: BoardsPanel,
  items: ItemsPanel,
  settings: SettingsPanel,
  graph: GraphPanel,
  tags: TagsPanel,
  stats: StatsPanel,
  search: SearchPanel,
}

export function PanelContainer() {
  const panel = useAppStore((s) => s.activePanel)
  const setPanel = useAppStore((s) => s.setActivePanel)

  const Panel = PANELS[panel]
  if (!Panel) return null

  return (
    <div className="relative">
      <button
        onClick={() => setPanel("none")}
        className="absolute top-3 right-3 z-10 p-1 rounded-md text-[var(--glass-text-muted)] hover:text-white hover:bg-[var(--glass-bg-thick)] transition-all"
      >
        <X size={14} />
      </button>
      <Panel />
    </div>
  )
}