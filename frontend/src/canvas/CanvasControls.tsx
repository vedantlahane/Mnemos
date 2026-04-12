import { ZoomIn, ZoomOut, Maximize, FilePlus2, PenLine } from "lucide-react"

export default function CanvasControls() {
  return (
    <div className="absolute right-6 bottom-6 flex gap-2 z-10">
      <div className="glass-elevated rounded-xl border border-[rgba(255,255,255,0.06)] flex overflow-hidden shadow-xl">
        <button className="p-3 bg-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.1)] transition-colors text-[var(--color-secondary)] hover:text-white border-r border-[rgba(255,255,255,0.06)]" title="Zoom In">
          <ZoomIn size={16} />
        </button>
        <button className="p-3 bg-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.1)] transition-colors text-[var(--color-secondary)] hover:text-white border-r border-[rgba(255,255,255,0.06)]" title="Zoom Out">
          <ZoomOut size={16} />
        </button>
        <button className="p-3 bg-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.1)] transition-colors text-[var(--color-secondary)] hover:text-white border-r border-[rgba(255,255,255,0.06)]" title="Fit View">
          <Maximize size={16} />
        </button>
        <button className="p-3 bg-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.1)] transition-colors text-[var(--color-secondary)] hover:text-white border-r border-[rgba(255,255,255,0.06)]" title="Add Sticky">
          <FilePlus2 size={16} />
        </button>
        <button className="p-3 bg-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.1)] transition-colors text-[var(--color-secondary)] hover:text-white" title="Draw">
          <PenLine size={16} />
        </button>
      </div>
    </div>
  )
}
