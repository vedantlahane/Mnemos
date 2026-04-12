import { Box, Code } from "lucide-react"

export default function WelcomeBlock() {
  return (
    <div className="flex flex-col items-center justify-center pt-16 pb-8">
      <div className="text-[24px] font-bold tracking-tight text-white mb-2">Mnemos Workspace</div>
      <div className="text-[14px] text-[var(--color-secondary)] mb-12">Search your knowledge or jump into a page.</div>
      
      <div className="grid grid-cols-2 gap-4 w-full">
         <div className="glass-elevated p-6 rounded-2xl flex flex-col items-center justify-center border border-[rgba(37,99,235,0.2)] hover:border-[rgba(37,99,235,0.4)] cursor-pointer transition-all hover:-translate-y-1">
             <Box size={24} className="text-[var(--color-accent-blue)] mb-3" />
             <div className="text-[14px] font-semibold text-white">Docker</div>
             <div className="text-[11px] text-[var(--color-secondary)] mt-1">12 notes</div>
         </div>
         <div className="glass-elevated p-6 rounded-2xl flex flex-col items-center justify-center border border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.1)] cursor-pointer transition-all hover:-translate-y-1">
             <Code size={24} className="text-[var(--color-muted)] mb-3" />
             <div className="text-[14px] font-semibold text-white">React</div>
             <div className="text-[11px] text-[var(--color-secondary)] mt-1">4 notes</div>
         </div>
      </div>
    </div>
  )
}
