import { usePanel } from "@/hooks/usePanel"
import { EmptyState } from "@/components/shared/EmptyState"
import { contentTypeIcon, formatSimilarity } from "@/lib/utils"

export function SearchPanel() {
  const { search } = usePanel()

  if (!search?.results.length) {
    return <EmptyState icon="🔍" message="No results" hint="Try a different query" />
  }

  return (
    <div className="p-3 space-y-1">
      <p className="text-xs text-[var(--glass-text-muted)] px-2 mb-2">
        Results for "{search.query}" ({search.results.length})
      </p>
      {search.results.map((result) => (
        <div
          key={result.id}
          className="px-3 py-2.5 rounded-lg bg-[var(--glass-bg-thick)] border border-[var(--glass-border)] transition-all hover:border-[var(--glass-border-hover)]"
        >
          <div className="flex items-center gap-2">
            <span className="text-xs flex-shrink-0">{contentTypeIcon(result.content_type)}</span>
            <p className="text-sm text-white truncate flex-1">{result.title || "Untitled"}</p>
            {result.similarity !== undefined && (
              <span className="text-[10px] font-mono text-[var(--accent)] flex-shrink-0">
                {formatSimilarity(result.similarity)}
              </span>
            )}
          </div>
          {result.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5 ml-5">
              {result.tags.slice(0, 4).map((tag) => (
                <span
                  key={tag}
                  className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--accent-subtle)] text-[var(--accent)]"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}