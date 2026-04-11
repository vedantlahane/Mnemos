import { useEffect, useState } from "react"
import { api } from "../api/client"
import { useNotes } from "../hooks/useNotes"
import NoteCard from "../components/NoteCard"
import TagFilter from "../components/TagFilter"
import SearchBar from "../components/SearchBar"
import EmptyState from "../components/EmptyState"
import ErrorState from "../components/ErrorState"

export default function Dashboard() {
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [tags, setTags] = useState<string[]>([])
  const { notes, total, page, setPage, loading, error, refetch } =
    useNotes(selectedTag)

  useEffect(() => {
    api.getTags().then((data) => setTags(data.tags)).catch(() => {})
  }, [])

  const totalPages = Math.ceil(total / 20)

  return (
    <div className="flex gap-6">
      {/* Sidebar */}
      <aside className="w-48 shrink-0 hidden md:block">
        <TagFilter
          tags={tags}
          selectedTag={selectedTag}
          onSelectTag={setSelectedTag}
        />
        {/* Stats */}
        <div className="mt-6 pt-4 border-t border-slate-800">
          <p className="text-xs text-slate-500">{total} total notes</p>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 min-w-0">
        {/* Search */}
        <div className="mb-6">
          <SearchBar />
        </div>

        {/* Mobile tag selector */}
        <div className="md:hidden mb-4">
          <select
            value={selectedTag || ""}
            onChange={(e) => setSelectedTag(e.target.value || null)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200"
          >
            <option value="">All Notes</option>
            {tags.map((tag) => (
              <option key={tag} value={tag}>
                #{tag}
              </option>
            ))}
          </select>
        </div>

        {/* Error State */}
        {error && <ErrorState message={error} onRetry={refetch} />}

        {/* Loading */}
        {loading && !error && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="bg-slate-900 border border-slate-800 rounded-lg p-4 animate-pulse"
              >
                <div className="h-4 bg-slate-800 rounded w-3/4 mb-3" />
                <div className="h-3 bg-slate-800 rounded w-full mb-2" />
                <div className="h-3 bg-slate-800 rounded w-2/3" />
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && notes.length === 0 && (
          <EmptyState
            icon="📝"
            title="No notes yet"
            description="Capture your first note! Use Ctrl+Shift+S on any page with text selected."
          />
        )}

        {/* Notes Grid */}
        {!loading && !error && notes.length > 0 && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {notes.map((note) => (
                <NoteCard key={note.id} note={note} />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-8">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 text-sm rounded-md bg-slate-800 text-slate-400 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  ← Prev
                </button>
                <span className="text-sm text-slate-500">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 text-sm rounded-md bg-slate-800 text-slate-400 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
