import { useEffect } from "react"
import { useSearchParams } from "react-router-dom"
import { useSearch } from "../hooks/useSearch"
import NoteCard from "../components/NoteCard"
import EmptyState from "../components/EmptyState"
import ErrorState from "../components/ErrorState"

export default function Search() {
  const [searchParams, setSearchParams] = useSearchParams()
  const urlQuery = searchParams.get("q") || ""
  const { results, loading, error, query, search } = useSearch()

  // Search on mount or when URL query changes
  useEffect(() => {
    if (urlQuery) {
      search(urlQuery)
    }
  }, [urlQuery, search])

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const q = (formData.get("q") as string)?.trim()
    if (q) {
      setSearchParams({ q })
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-100 mb-6">Search Notes</h1>

      {/* Search Input */}
      <form onSubmit={handleSubmit} className="mb-8">
        <div className="relative">
          <input
            name="q"
            type="text"
            defaultValue={urlQuery}
            placeholder="Search by meaning, not just keywords..."
            className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-10 pr-4 py-3 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
            🔍
          </span>
          <button
            type="submit"
            className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs rounded-md transition-colors"
          >
            Search
          </button>
        </div>
        <p className="text-xs text-slate-500 mt-2">
          Uses semantic search — finds notes by meaning, not exact words
        </p>
      </form>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin text-2xl">⟳</div>
        </div>
      )}

      {/* Error */}
      {error && <ErrorState message={error} />}

      {/* Results */}
      {!loading && !error && query && results.length > 0 && (
        <>
          <p className="text-sm text-slate-500 mb-4">
            {results.length} result{results.length !== 1 ? "s" : ""} for "{query}"
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {results.map((note) => (
              <NoteCard key={note.id} note={note} />
            ))}
          </div>
        </>
      )}

      {/* No Results */}
      {!loading && !error && query && results.length === 0 && (
        <EmptyState
          icon="🔍"
          title={`No notes match "${query}"`}
          description="Try different keywords or broader terms"
        />
      )}

      {/* Initial State */}
      {!loading && !error && !query && (
        <EmptyState
          icon="🔍"
          title="Search your knowledge"
          description="Type a question or topic above to find related notes"
        />
      )}
    </div>
  )
}
