import { useState } from "react"
import { api } from "../api/client"
import type { BlockItem } from "../types"
import { Download, Loader2, CheckCircle, Copy } from "lucide-react"

export default function ExportBlock(_props: { item: BlockItem }) {
  const [exporting, setExporting] = useState(false)
  const [exported, setExported] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function handleExport() {
    setExporting(true)
    try {
      const data = await api.exportWorkspace()

      // Generate markdown
      const lines: string[] = [
        `# Mnemos Export`,
        `> Exported at ${data.exported_at}`,
        ``,
        `## Pages (${data.pages.length})`,
        ``,
      ]

      for (const page of data.pages) {
        lines.push(`### ${page.icon} ${page.name}`)
        if (page.description) lines.push(`> ${page.description}`)
        lines.push(`Notes: ${page.note_count} | Created: ${page.created_at}`)
        lines.push(``)

        const pageNotes = data.notes.filter((n) => n.page_id === page.id)
        for (const note of pageNotes) {
          lines.push(`#### ${note.title || "Untitled"}`)
          if (note.summary) lines.push(`*${note.summary}*`)
          lines.push(``)
          lines.push(note.raw_text)
          lines.push(``)
          if (note.tags.length > 0) {
            lines.push(`Tags: ${note.tags.map((t) => `\`#${t}\``).join(" ")}`)
          }
          if (note.tasks.length > 0) {
            lines.push(`Tasks:`)
            note.tasks.forEach((t) => lines.push(`- [ ] ${t}`))
          }
          if (note.source_url) {
            lines.push(`Source: ${note.source_url}`)
          }
          lines.push(`---`)
          lines.push(``)
        }
      }

      // Unassigned notes
      const orphanNotes = data.notes.filter((n) => !n.page_id)
      if (orphanNotes.length > 0) {
        lines.push(`## Unassigned Notes (${orphanNotes.length})`)
        lines.push(``)
        for (const note of orphanNotes) {
          lines.push(`#### ${note.title || "Untitled"}`)
          lines.push(note.raw_text)
          lines.push(`---`)
          lines.push(``)
        }
      }

      // Edges summary
      if (data.edges.length > 0) {
        lines.push(`## Connections (${data.edges.length})`)
        lines.push(``)
        lines.push(`| Type | Strength | Label |`)
        lines.push(`|------|----------|-------|`)
        for (const edge of data.edges.slice(0, 50)) {
          lines.push(
            `| ${edge.edge_type} | ${(edge.strength * 100).toFixed(0)}% | ${edge.label || "—"} |`
          )
        }
      }

      const markdown = lines.join("\n")
      setExported(markdown)

      // Also trigger file download
      const blob = new Blob([markdown], { type: "text/markdown" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `mnemos-export-${new Date().toISOString().slice(0, 10)}.md`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setExported("Export failed. Check backend connection.")
    } finally {
      setExporting(false)
    }
  }

  async function handleCopy() {
    if (!exported) return
    try {
      await navigator.clipboard.writeText(exported)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* ignore */ }
  }

  return (
    <div className="glass-surface-1 p-6 rounded-2xl">
      <div className="text-[10px] uppercase font-bold tracking-widest text-[var(--glass-text-muted)] mb-4">
        Export Workspace
      </div>

      {!exported ? (
        <div className="flex flex-col items-center gap-4 py-4">
          <p className="text-[13px] text-[var(--glass-text-dim)] text-center">
            Export all pages, notes, tags, and connections as Markdown.
          </p>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-light)] text-white font-semibold text-[13px] transition-colors disabled:opacity-50"
          >
            {exporting ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Exporting…
              </>
            ) : (
              <>
                <Download size={14} />
                Export as Markdown
              </>
            )}
          </button>
        </div>
      ) : (
        <div>
          <div className="flex items-center gap-2 text-[var(--green)] mb-3">
            <CheckCircle size={14} />
            <span className="text-[12px] font-semibold">Export complete — file downloaded</span>
          </div>
          <div className="glass-surface-2 p-4 rounded-xl max-h-[300px] overflow-y-auto">
            <pre className="text-[11px] text-[var(--glass-text-dim)] whitespace-pre-wrap font-mono">
              {exported.slice(0, 2000)}
              {exported.length > 2000 && "\n\n… (truncated preview)"}
            </pre>
          </div>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 mt-3 text-[11px] text-[var(--accent)] hover:text-[var(--accent-light)] transition-colors"
          >
            <Copy size={11} />
            {copied ? "Copied!" : "Copy to clipboard"}
          </button>
        </div>
      )}
    </div>
  )
}