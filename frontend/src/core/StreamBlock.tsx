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

export default function StreamBlock({ item }: { item: StreamItem }) {
  switch (item.blockType) {
    case "welcome": return <WelcomeBlock />
    case "note-grid": return <NoteGridBlock item={item} />
    case "page-list": return <PageListBlock />
    case "stats": return <StatsBlock />
    case "tag-cloud": return <TagCloudBlock />
    case "search-results": return <SearchResultsBlock item={item} />
    case "help": return <HelpBlock />
    case "note-detail": return <NoteDetailBlock item={item} />
    case "task-list": return <TaskListBlock />
    case "reading-path": return <ReadingPathBlock item={item} />
    case "gap-analysis": return <GapAnalysisBlock item={item} />
    case "curator-report": return <CuratorReportBlock />
    case "settings": return <SettingsBlock />
    case "history": return <HistoryBlock />
    default:
      return <div className="p-4 border border-dashed text-sm border-[rgba(255,255,255,0.1)] rounded-xl">Block not implemented: {item.blockType}</div>
  }
}
