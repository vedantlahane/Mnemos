import { MiniMap } from "@xyflow/react"

export default function CanvasMinimap() {
  return (
    <MiniMap
      className="!bg-[rgba(10,10,18,0.7)] !border !border-[var(--glass-border)] !rounded-xl !overflow-hidden !backdrop-blur-xl"
      nodeColor={(n) => {
        if (n.type === "note") return "rgba(99,102,241,0.7)"
        if (n.type === "sticky") return "rgba(250,204,21,0.7)"
        return "rgba(255,255,255,0.15)"
      }}
      maskColor="rgba(0,0,0,0.45)"
      pannable
      zoomable
    />
  )
}