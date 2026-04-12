import { Handle, Position } from "@xyflow/react"

export default function StickyNode({ data, selected }: any) {
  const { highlighted } = data

  return (
    <div
      className={`w-[180px] p-4 shadow-lg transition-all ${
        selected
          ? "border-2 border-amber-500 shadow-xl scale-105"
          : highlighted
          ? "border-2 border-[var(--color-warning)] shadow-xl"
          : "border-2 border-transparent"
      }`}
      style={{
        background: "rgba(254, 240, 138, 0.9)",
        color: "#78350f",
        fontFamily: "var(--font-hand)",
        borderRadius: "2px 10px 10px 2px",
        transform: `rotate(${selected ? 0 : 1}deg)`,
      }}
    >
      <Handle type="target" position={Position.Top} className="opacity-0" />

      <div className="text-[15px] leading-snug whitespace-pre-wrap font-medium">
        {data.content || "Sticky note"}
      </div>

      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </div>
  )
}