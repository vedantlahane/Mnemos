interface Props {
  tags: string[]
  selectedTag: string | null
  onSelectTag: (tag: string | null) => void
}

export default function TagFilter({ tags, selectedTag, onSelectTag }: Props) {
  return (
    <div className="space-y-1">
      <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
        Tags
      </h2>
      <button
        onClick={() => onSelectTag(null)}
        className={`block w-full text-left text-sm px-3 py-1.5 rounded-md transition-colors ${
          !selectedTag
            ? "bg-indigo-500/20 text-indigo-300"
            : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
        }`}
      >
        All Notes
      </button>
      {tags.map((tag) => (
        <button
          key={tag}
          onClick={() => onSelectTag(tag === selectedTag ? null : tag)}
          className={`block w-full text-left text-sm px-3 py-1.5 rounded-md transition-colors ${
            tag === selectedTag
              ? "bg-indigo-500/20 text-indigo-300"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
          }`}
        >
          #{tag}
        </button>
      ))}
      {tags.length === 0 && (
        <p className="text-xs text-slate-600 px-3 py-2">No tags yet</p>
      )}
    </div>
  )
}
