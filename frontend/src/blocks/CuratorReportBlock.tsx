export default function CuratorReportBlock() {
  return (
    <div className="glass-primary p-6 rounded-2xl">
      <div className="text-[10px] uppercase font-bold tracking-widest text-[var(--color-muted)] mb-4">Curator Scan Report</div>
      <div className="text-[13px] text-[var(--color-secondary)]">
        No immediate duplicates or orphan notes found. <br/><br/>
        <span className="text-[var(--color-success)] font-semibold">Workspace is well maintained.</span>
      </div>
    </div>
  )
}
