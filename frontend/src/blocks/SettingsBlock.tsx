export default function SettingsBlock() {
  return (
    <div className="glass-primary p-6 rounded-2xl">
      <div className="text-[10px] uppercase font-bold tracking-widest text-[var(--color-muted)] mb-4">Workspace Settings</div>
      <div className="text-[13px] text-[var(--color-secondary)]">
         <div className="mb-4">
            <label className="block mb-2 font-semibold">LLM Temperature</label>
            <input type="range" className="w-full max-w-[200px]" defaultValue={0.7} />
         </div>
      </div>
    </div>
  )
}
