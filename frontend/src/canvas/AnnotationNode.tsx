export default function AnnotationNode({ data, selected }: any) {
  return (
    <div className={`text-[var(--color-ai)] font-mono text-[11px] leading-tight max-w-[150px] p-2 border-l border-[var(--color-ai)] bg-[rgba(139,92,246,0.05)] ${selected ? "border-l-2 outline outline-1 outline-[var(--color-ai)]" : ""}`}>
       {data.content || "Annotation"}
    </div>
  )
}
