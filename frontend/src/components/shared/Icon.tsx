import {
  Sparkles, ArrowRight, X, GripHorizontal,
  LayoutGrid, Settings, BarChart3, Hash, Search, Globe,
  FileText, Code2, Link2, MessageCircle, HelpCircle, Scissors,
  CheckCircle2, Clock, AlertCircle, Loader2,
  Moon, Sun, Brain, Send, ChevronRight, Command,
  type LucideIcon,
} from "lucide-react"

const ICON_MAP = {
  sparkles: Sparkles,
  arrowRight: ArrowRight,
  x: X,
  grip: GripHorizontal,
  boards: LayoutGrid,
  settings: Settings,
  stats: BarChart3,
  tags: Hash,
  search: Search,
  graph: Globe,
  note: FileText,
  code: Code2,
  url: Link2,
  thought: MessageCircle,
  question: HelpCircle,
  snippet: Scissors,
  ready: CheckCircle2,
  pending: Clock,
  processing: Loader2,
  error: AlertCircle,
  moon: Moon,
  sun: Sun,
  brain: Brain,
  send: Send,
  chevronRight: ChevronRight,
  command: Command,
} as const

export type IconName = keyof typeof ICON_MAP

interface Props {
  name: IconName
  size?: number
  className?: string
  strokeWidth?: number
}

export function Icon({ name, size = 16, className = "", strokeWidth = 1.5 }: Props) {
  const LucideComponent: LucideIcon = ICON_MAP[name]
  return <LucideComponent size={size} className={className} strokeWidth={strokeWidth} />
}

export function contentTypeIconName(type: string): IconName {
  const map: Record<string, IconName> = {
    note: "note", code: "code", url: "url",
    thought: "thought", question: "question", snippet: "snippet",
  }
  return map[type] ?? "note"
}

export function statusIconName(status: string): IconName {
  const map: Record<string, IconName> = {
    ready: "ready", pending: "pending", processing: "processing", error: "error",
  }
  return map[status] ?? "pending"
}