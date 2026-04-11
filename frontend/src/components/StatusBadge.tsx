interface Props {
  status: string
}

export default function StatusBadge({ status }: Props) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    done: { bg: "bg-emerald-500/10", text: "text-emerald-400", label: "✓ Done" },
    pending: { bg: "bg-yellow-500/10", text: "text-yellow-400", label: "⏳ Pending" },
    processing: { bg: "bg-blue-500/10", text: "text-blue-400", label: "⟳ Processing" },
    failed: { bg: "bg-red-500/10", text: "text-red-400", label: "✗ Failed" },
  }

  const c = config[status] || config.pending

  return (
    <span
      className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${c.bg} ${c.text} whitespace-nowrap ${
        status === "processing" ? "animate-pulse" : ""
      }`}
    >
      {c.label}
    </span>
  )
}
