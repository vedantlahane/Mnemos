import ReactMarkdown from "react-markdown"

interface Props {
  content: string
}

export function Markdown({ content }: Props) {
  return (
    <ReactMarkdown
      components={{
        p: ({ children }: any) => <p className="mb-1.5 last:mb-0">{children}</p>,
        strong: ({ children }: any) => <strong className="font-semibold text-white">{children}</strong>,
        ul: ({ children }: any) => <ul className="list-disc pl-4 mb-1.5">{children}</ul>,
        ol: ({ children }: any) => <ol className="list-decimal pl-4 mb-1.5">{children}</ol>,
        li: ({ children }: any) => <li className="mb-0.5">{children}</li>,
        code: ({ children, className }: any) => {
          if (className?.includes("language-")) {
            return (
              <pre className="rounded-lg p-3 text-xs overflow-x-auto my-2 bg-[var(--glass-bg-thick)] border border-[var(--glass-border)]">
                <code className="text-[var(--glass-text)]">{children}</code>
              </pre>
            )
          }
          return (
            <code className="px-1 py-0.5 rounded text-xs bg-[var(--glass-bg-thick)] text-[var(--accent)] border border-[var(--glass-border)]">
              {children}
            </code>
          )
        },
        h1: ({ children }: any) => <h1 className="text-base font-bold mb-1.5 text-white">{children}</h1>,
        h2: ({ children }: any) => <h2 className="text-sm font-bold mb-1 text-white">{children}</h2>,
        h3: ({ children }: any) => <h3 className="text-sm font-semibold mb-1 text-white">{children}</h3>,
      }}
    >
      {content}
    </ReactMarkdown>
  )
}