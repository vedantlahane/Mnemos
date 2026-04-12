export default function ClusterRegion({ data }: any) {
  return (
    <div 
      className="absolute border border-[var(--color-accent-blue)] border-dashed bg-[rgba(37,99,235,0.03)] rounded-3xl pointer-events-none"
      style={{
        width: data.width || 400,
        height: data.height || 300,
        top: 0,
        left: 0
      }}
    >
      <div className="absolute -top-6 left-4 text-[var(--color-accent-blue)] font-bold text-[14px]">
        {data.label || "Cluster"}
      </div>
    </div>
  )
}
