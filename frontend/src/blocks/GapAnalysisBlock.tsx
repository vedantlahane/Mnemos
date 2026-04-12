import type { StreamItem } from "../types"

export default function GapAnalysisBlock({ item }: { item: StreamItem }) {
  return (
    <div className="glass-primary p-6 rounded-2xl">
      <div className="text-[10px] uppercase font-bold tracking-widest text-[var(--color-muted)] mb-4">Gap Analysis</div>
      <div className="text-[13px] text-[var(--color-secondary)]">
        Performing semantic coverage check for context {item.metadata?.pageId || "global"}...
        <br/><br/>
        <span className="text-[var(--color-warning)]">Missing subtopics detected:</span>
        <ul className="list-disc pl-5 mt-2">
           <li>Advanced Deployment Targets</li>
           <li>Security Best Practices</li>
        </ul>
      </div>
    </div>
  )
}
