export default function ClusterRegion({ data }: any) {
  const color = data.color || "var(--color-accent-dim)"

  return (
    <div
      className="border border-dashed rounded-3xl pointer-events-none"
      style={{
        width: data.width || 400,
        height: data.height || 300,
        borderColor: `${color}40`,
        background: `${color}08`,
      }}
    >
      <div
        className="absolute -top-6 left-4 font-bold text-[13px]"
        style={{ color }}
      >
        {data.label || "Cluster"}
      </div>
      {data.noteCount != null && (
        <div
          className="absolute -top-6 right-4 text-[10px] font-mono"
          style={{ color: `${color}80` }}
        >
          {data.noteCount} notes
        </div>
      )}
    </div>
  )
}