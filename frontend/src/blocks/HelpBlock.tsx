import type { BlockItem } from "../types"

export default function HelpBlock(_props: { item: BlockItem }) {
  const sections = [
    {
      title: "Navigation",
      cmds: [
        { name: "/open", args: "<page>", desc: "Open a page canvas" },
        { name: "/close", desc: "Return to home" },
        { name: "/home", desc: "Go to home" },
        { name: "/back", desc: "Previous context" },
      ],
    },
    {
      title: "Content",
      cmds: [
        { name: "/notes", args: "[#tag]", desc: "Browse notes" },
        { name: "/pages", desc: "List all pages" },
        { name: "/page", args: "create|delete <name>", desc: "Manage pages" },
        { name: "/search", args: "<query>", desc: "Semantic search" },
        { name: "/tags", desc: "View all tags" },
        { name: "/tasks", desc: "List all tasks" },
        { name: "/stats", desc: "Workspace stats" },
        { name: "/capture", args: "<text>", desc: "Quick capture" },
        { name: "/export", desc: "Export workspace" },
      ],
    },
    {
      title: "Canvas",
      cmds: [
        { name: "/find", args: "<text>", desc: "Search on canvas" },
        { name: "/add", args: "<text>", desc: "Add sticky note" },
        { name: "/bg", args: "<color>", desc: "Change background" },
        { name: "/theme", args: "light|dark", desc: "Set canvas theme" },
        { name: "/style", args: "k=v ...", desc: "Set stroke/fill/font/arrow" },
        { name: "/style-lock", args: "on|off|status", desc: "Require style confirmation" },
        { name: "/style-confirm", desc: "Confirm style before AI writes" },
        { name: "/library", desc: "Open shape library" },
        { name: "/layout", desc: "AI auto-reorganize" },
        { name: "/summarize", desc: "Summarize page" },
        { name: "/page-stats", desc: "Page statistics" },
        { name: "/gaps", desc: "Find missing topics" },
        { name: "/reading", args: "[topic]", desc: "Reading order" },
        { name: "/rename", args: "<name>", desc: "Rename page" },
      ],
    },
    {
      title: "System",
      cmds: [
        { name: "/curator", desc: "Run maintenance" },
        { name: "/settings", desc: "Settings" },
        { name: "/history", desc: "Past conversations" },
        { name: "/clear", desc: "Clear stream" },
        { name: "/help", desc: "This help" },
      ],
    },
  ]

  return (
    <div className="glass rounded-2xl p-5 relative overflow-hidden">
      <div className="relative z-10">
        <div className="text-[9px] uppercase tracking-[0.2em] font-bold text-[var(--glass-text-muted)] mb-4">
          Commands
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {sections.map((sec) => (
            <div key={sec.title}>
              <div className="text-[10px] uppercase tracking-widest font-bold text-[var(--accent-light)] mb-2">
                {sec.title}
              </div>
              {sec.cmds.map((c) => (
                <div key={c.name} className="flex justify-between py-1 group">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[12px] text-[var(--glass-text)]">
                      {c.name}
                    </span>
                    {c.args && (
                      <span className="text-[10px] text-[var(--glass-text-muted)] italic">
                        {c.args}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-[var(--glass-text-dim)] group-hover:text-[var(--glass-text)] transition-colors">
                    {c.desc}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="mt-5 p-3 rounded-xl bg-[var(--accent-subtle)] border border-[rgba(99,102,241,0.1)]">
          <p className="text-[11px] text-[var(--glass-text-dim)] leading-relaxed">
            Everything without{" "}
            <span className="font-mono text-[var(--accent-light)]">/</span> is sent
            as natural language. You can say{" "}
            <span className="font-mono text-[var(--accent-light)]">"capture Docker uses bridge networks"</span>,{" "}
            <span className="font-mono text-[var(--accent-light)]">"open Docker"</span>,{" "}
            <span className="font-mono text-[var(--accent-light)]">"add sticky hello"</span>, or{" "}
            <span className="font-mono text-[var(--accent-light)]">"export"</span>.
            Press{" "}
            <kbd className="font-mono bg-[rgba(255,255,255,0.06)] px-1.5 py-0.5 rounded text-[10px] text-white mx-0.5">
              ⌘K
            </kbd>{" "}
            to focus.
          </p>
        </div>
      </div>
    </div>
  )
}