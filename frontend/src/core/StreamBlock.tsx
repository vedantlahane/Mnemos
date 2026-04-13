import { lazy, Suspense } from "react"
import type { BlockItem } from "../types"
import { ErrorBoundary } from "../components/ErrorBoundary"
import { Loader2 } from "lucide-react"

const WelcomeBlock = lazy(() => import("../blocks/WelcomeBlock"))
const NoteGridBlock = lazy(() => import("../blocks/NoteGridBlock"))
const PageListBlock = lazy(() => import("../blocks/PageListBlock"))
const StatsBlock = lazy(() => import("../blocks/StatsBlock"))
const TagCloudBlock = lazy(() => import("../blocks/TagCloudBlock"))
const SearchResultsBlock = lazy(() => import("../blocks/SearchResultsBlock"))
const HelpBlock = lazy(() => import("../blocks/HelpBlock"))
const NoteDetailBlock = lazy(() => import("../blocks/NoteDetailBlock"))
const TaskListBlock = lazy(() => import("../blocks/TaskListBlock"))
const ReadingPathBlock = lazy(() => import("../blocks/ReadingPathBlock"))
const GapAnalysisBlock = lazy(() => import("../blocks/GapAnalysisBlock"))
const CuratorReportBlock = lazy(() => import("../blocks/CuratorReportBlock"))
const SettingsBlock = lazy(() => import("../blocks/SettingsBlock"))
const HistoryBlock = lazy(() => import("../blocks/HistoryBlock"))
const PageStatsBlock = lazy(() => import("../blocks/PageStatsBlock"))
const ExportBlock = lazy(() => import("../blocks/ExportBlock"))

const BLOCK_MAP: Record<
  string,
  React.LazyExoticComponent<React.ComponentType<{ item: BlockItem }>>
> = {
  welcome: WelcomeBlock,
  "note-grid": NoteGridBlock,
  "page-list": PageListBlock,
  stats: StatsBlock,
  "tag-cloud": TagCloudBlock,
  "search-results": SearchResultsBlock,
  help: HelpBlock,
  "note-detail": NoteDetailBlock,
  "task-list": TaskListBlock,
  "reading-path": ReadingPathBlock,
  "gap-analysis": GapAnalysisBlock,
  "curator-report": CuratorReportBlock,
  settings: SettingsBlock,
  history: HistoryBlock,
  "page-stats": PageStatsBlock,
  export: ExportBlock,
}

function BlockFallback() {
  return (
    <div className="glass-surface-1 p-6 rounded-2xl flex items-center justify-center">
      <Loader2 className="animate-spin text-[var(--accent)]" size={18} />
    </div>
  )
}

export default function StreamBlock({ item }: { item: BlockItem }) {
  const Block = item.blockType ? BLOCK_MAP[item.blockType] : null

  if (!Block) {
    return (
      <div className="p-4 border border-dashed border-[rgba(255,255,255,0.1)] rounded-xl text-[12px] text-[var(--glass-text-muted)] font-mono">
        Unknown block: {item.blockType}
      </div>
    )
  }

  return (
    <ErrorBoundary>
      <Suspense fallback={<BlockFallback />}>
        <Block item={item} />
      </Suspense>
    </ErrorBoundary>
  )
}