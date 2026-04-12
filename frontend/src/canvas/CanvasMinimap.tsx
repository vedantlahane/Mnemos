import { MiniMap } from "@xyflow/react"

export default function CanvasMinimap() {
  return (
    <MiniMap 
      className="!bg-[rgba(6,6,9,0.8)] !border !border-[rgba(255,255,255,0.06)] !rounded-xl !overflow-hidden !shadow-2xl"
      nodeColor={(n) => {
        if (n.type === 'note') return 'rgba(37,99,235,0.8)'
        if (n.type === 'sticky') return 'rgba(245,158,11,0.8)'
        return 'rgba(255,255,255,0.2)'
      }}
      maskColor="rgba(0,0,0,0.5)"
    />
  )
}
