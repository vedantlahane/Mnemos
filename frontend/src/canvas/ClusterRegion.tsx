import { memo } from "react"

export default memo(function ClusterRegion({ data }: any) {
  const c = data.color || "#6366f1"
  return (
    <div
      className="rounded-3xl pointer-events-none"
      style={{ width: data.width || 400, height: data.height || 300, border: `1px dashed ${c}25`, background: `${c}05` }}
    >
      <div className="absolute -top-6 left-3 text-[12px] font-semibold tracking-wide" style={{ color: `${c}80` }}>
        {data.label} {data.noteCount != null && <span className="text-[9px] font-normal opacity-50 ml-1">{data.noteCount}</span>}
      </div>
    </div>
  )
})