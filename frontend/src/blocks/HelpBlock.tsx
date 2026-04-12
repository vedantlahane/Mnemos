

export default function HelpBlock() {
  const commands = [
    { name: "/notes", desc: "Browse notes or filter by tag. #tags work too." },
    { name: "/pages", desc: "List all custom pages" },
    { name: "/search", desc: "Search knowledge base" },
    { name: "/stats", desc: "View workspace statistics" },
    { name: "/tags", desc: "View active tags" },
    { name: "/tasks", desc: "List extracted tasks" },
    { name: "/reading", desc: "Generate reading path for topic" },
    { name: "/gaps", desc: "Analyze missing subtopics" },
    { name: "/curator", desc: "Run maintenance scan" },
    { name: "/history", desc: "View past chats" },
    { name: "/settings", desc: "Manage application settings" },
    { name: "/clear", desc: "Clear current stream" },
  ]

  return (
    <div className="glass-primary p-6 rounded-2xl">
      <div className="text-[10px] uppercase font-bold tracking-widest text-[var(--color-muted)] mb-4">Command Reference</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
        {commands.map(cmd => (
          <div key={cmd.name} className="flex justify-between items-center group cursor-default">
            <span className="font-mono text-[13px] text-[var(--color-accent-cyan)]">{cmd.name}</span>
            <span className="text-[12px] text-[var(--color-secondary)] group-hover:text-[var(--color-primary)] transition-colors">{cmd.desc}</span>
          </div>
        ))}
      </div>
      <div className="mt-8 p-4 bg-[rgba(37,99,235,0.05)] border border-[rgba(37,99,235,0.1)] rounded-xl">
         <div className="text-[11px] uppercase font-bold tracking-wider text-[var(--color-accent-blue)] mb-1">PRO-TIP</div>
         <div className="text-[13px] text-[var(--color-secondary)] leading-relaxed">
            Everything else is treated as natural language. Don't worry about commands if you just want to ask a question!
            Use <kbd className="bg-[rgba(255,255,255,0.1)] px-1.5 py-0.5 rounded ml-1 text-white">⌘K</kbd> to jump straight to the command bar.
         </div>
      </div>
    </div>
  )
}
