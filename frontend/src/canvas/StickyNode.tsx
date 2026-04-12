import { Handle, Position } from "@xyflow/react"

export default function StickyNode({ data, selected }: any) {
  return (
    <div className={`w-[200px] p-4 bg-[#fef08a] text-amber-900 rotate-1 shadow-lg border-2 ${selected ? "border-amber-600 shadow-xl scale-105" : "border-transparent" } transition-all`} style={{ fontFamily: "var(--font-sans)", borderRadius: "2px 10px 10px 2px" }}>
       
       <Handle type="target" position={Position.Top} className="opacity-0" />
       
       <div className="font-semibold text-[14px] leading-snug whitespace-pre-wrap">
         {data.content || "Sticky note"}
       </div>

       <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </div>
  )
}
