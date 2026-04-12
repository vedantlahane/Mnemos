import { memo } from "react"
import { Handle, Position } from "@xyflow/react"

const COLORS = ["#fef08a", "#bbf7d0", "#bfdbfe", "#fecdd3", "#e9d5ff", "#fed7aa"]

export default memo(function StickyNode({ data, selected }: any) {
  const color = data.style?.color || COLORS[Math.floor(Math.random() * COLORS.length)]

  return (
    <div
      className={`w-[160px] shadow-lg transition-transform ${selected ? "scale-[1.04] shadow-xl" : ""}`}
      style={{
        background: color,
        fontFamily: "var(--font-hand)",
        padding: "12px 14px",
        borderRadius: "1px 1px 8px 1px",
        transform: `rotate(${selected ? 0 : (data.id?.charCodeAt(0) || 0) % 5 - 2}deg)`,
        boxShadow: "2px 4px 14px rgba(0,0,0,0.18)",
      }}
    >
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <div className="text-[15px] leading-snug text-amber-900/80 whitespace-pre-wrap">
        {data.content || "…"}
      </div>
      <Handle type="source" position={Position.Bottom} className="!opacity-0" />
    </div>
  )
})