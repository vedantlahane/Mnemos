import type { StreamItem } from "../types"
import WelcomeBlock from "../blocks/WelcomeBlock"
import NoteGridBlock from "../blocks/NoteGridBlock"
import PageListBlock from "../blocks/PageListBlock"
import StatsBlock from "../blocks/StatsBlock"
import TagCloudBlock from "../blocks/TagCloudBlock"
import SearchResultsBlock from "../blocks/SearchResultsBlock"
import HelpBlock from "../blocks/HelpBlock"
import NoteDetailBlock from "../blocks/NoteDetailBlock"
import TaskListBlock from "../blocks/TaskListBlock"
import ReadingPathBlock from "../blocks/ReadingPathBlock"
import GapAnalysisBlock from "../blocks/GapAnalysisBlock"
import CuratorReportBlock from "../blocks/CuratorReportBlock"
import SettingsBlock from "../blocks/SettingsBlock"
import HistoryBlock from "../blocks/HistoryBlock"

const BLOCK_MAP: Record<string, React.FC<{ item: StreamItem }>> = {
  "welcome": () => <WelcomeBlock />,
  "note-grid": NoteGridBlock,
  "page-list": () => <PageListBlock />,
  "stats": () => <StatsBlock />,
  "tag-cloud": () => <TagCloudBlock />,
  "search-results": SearchResultsBlock,
  "help": () => <HelpBlock />,
  "note-detail": NoteDetailBlock,
  "task-list": TaskListBlock,
  "reading-path": ReadingPathBlock,
  "gap-analysis": GapAnalysisBlock,
  "curator-report": CuratorReportBlock,
  "settings": () => <SettingsBlock />,
  "history": () => <HistoryBlock />,
}

export default function StreamBlock({ item }: { item: StreamItem }) {
  const Block = item.blockType ? BLOCK_MAP[item.blockType] : null

  if (!Block) {
    return (
      <div className="p-4 border border-dashed border-[rgba(255,255,255,0.1)] rounded-xl text-[12px] text-[var(--glass-text-muted)] font-mono">
        Unknown block: {item.blockType}
      </div>
    )
  }

  return <Block item={item} />
}