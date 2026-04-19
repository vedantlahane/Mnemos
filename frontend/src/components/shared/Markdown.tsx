import ReactMarkdown from "react-markdown"

interface Props {
  content: string
}

export function Markdown({ content }: Props) {
  return (
    <ReactMarkdown
      components={{
        p: ({ children }: any) => (
          <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>
        ),
        strong: ({ children }: any) => (
          <strong className="font-semibold text-white/95">{children}</strong>
        ),
        em: ({ children }: any) => (
          <em className="text-[var(--accent-light)] not-italic font-medium">{children}</em>
        ),
        ul: ({ children }: any) => (
          <ul className="space-y-1 pl-4 mb-2">{children}</ul>
        ),
        ol: ({ children }: any) => (
          <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>
        ),
        li: ({ children }: any) => (
          <li className="relative pl-2 before:content-[''] before:absolute before:left-[-12px] before:top-[10px] before:w-1 before:h-1 before:rounded-full before:bg-[var(--accent)]/50">
            {children}
          </li>
        ),
        code: ({ children, className }: any) => {
          if (className?.includes("language-")) {
            return (
              <pre className="rounded-xl p-4 text-xs overflow-x-auto my-3 bg-[var(--glass-bg-thick)] border border-[var(--glass-border)] font-mono leading-relaxed">
                <code className="text-[var(--glass-text)]">{children}</code>
              </pre>
            )
          }
          return (
            <code className="px-1.5 py-0.5 rounded-md text-[13px] font-mono bg-[var(--accent-subtle)] text-[var(--accent-light)] border border-[var(--accent)]/10">
              {children}
            </code>
          )
        },
        h1: ({ children }: any) => (
          <h1 className="text-base font-bold mb-2 text-white">{children}</h1>
        ),
        h2: ({ children }: any) => (
          <h2 className="text-sm font-bold mb-1.5 text-white">{children}</h2>
        ),
        h3: ({ children }: any) => (
          <h3 className="text-sm font-semibold mb-1 text-white/90">{children}</h3>
        ),
        hr: () => (
          <div className="my-3 h-px bg-gradient-to-r from-transparent via-[var(--glass-border)] to-transparent" />
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  )
}