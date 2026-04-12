import { memo } from "react"

export default memo(function AnnotationNode({ data }: any) {
  return (
    <div className="max-w-[140px] text-[10px] font-mono leading-tight p-1.5 border-l-2 border-purple-400/50 text-purple-300/70" style={{ background: "rgba(168,85,247,0.04)" }}>
      {data.content || "…"}
    </div>
  )
})