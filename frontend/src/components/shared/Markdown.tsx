// === FILE: frontend/src/components/shared/Markdown.tsx ===

import ReactMarkdown from "react-markdown";

interface Props {
  content: string;
}

export function Markdown({ content }: Props) {
  return (
    <ReactMarkdown
      components={{
        p: ({ children }) => (
          <p className="mb-1.5 last:mb-0" style={{ color: "var(--glass-text)" }}>
            {children}
          </p>
        ),
        strong: ({ children }) => (
          <strong className="font-semibold" style={{ color: "var(--glass-text)" }}>
            {children}
          </strong>
        ),
        ul: ({ children }) => (
          <ul className="list-disc pl-4 mb-1.5" style={{ color: "var(--glass-text)" }}>
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal pl-4 mb-1.5" style={{ color: "var(--glass-text)" }}>
            {children}
          </ol>
        ),
        li: ({ children }) => (
          <li className="mb-0.5">{children}</li>
        ),
        code: ({ children, className }) => {
          const isBlock = className?.includes("language-");
          if (isBlock) {
            return (
              <pre className="rounded-lg p-3 text-xs overflow-x-auto my-2"
                style={{
                  background: "var(--glass-bg-thick)",
                  color: "var(--glass-text)",
                  border: "1px solid var(--glass-border)",
                }}
              >
                <code>{children}</code>
              </pre>
            );
          }
          return (
            <code
              className="px-1 py-0.5 rounded text-xs"
              style={{
                background: "var(--glass-bg-thick)",
                color: "var(--accent)",
                border: "1px solid var(--glass-border)",
              }}
            >
              {children}
            </code>
          );
        },
        h1: ({ children }) => (
          <h1 className="text-base font-bold mb-1.5" style={{ color: "var(--glass-text)" }}>
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-sm font-bold mb-1" style={{ color: "var(--glass-text)" }}>
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-sm font-semibold mb-1" style={{ color: "var(--glass-text)" }}>
            {children}
          </h3>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
