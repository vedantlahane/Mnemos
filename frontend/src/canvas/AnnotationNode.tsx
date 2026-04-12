export default function AnnotationNode({ data, selected }: any) {
  return (
    <div
      className={`font-mono text-[11px] leading-tight max-w-[160px] p-2 border-l-2 ${
        selected
          ? "border-[var(--color-accent-purple)] outline outline-1 outline-[var(--color-accent-purple)]"
          : "border-[var(--color-accent-purple)]"
      }`}
      style={{ background: "rgba(168,85,247,0.05)", color: "var(--color-accent-purple-light)" }}
    >
      {data.content || "Annotation"}
    </div>
  )
}