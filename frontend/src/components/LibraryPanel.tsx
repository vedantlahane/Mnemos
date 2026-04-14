/**
 * LibraryPanel — embedded Excalidraw library browser
 * Renders inside the chat overlay's floating panel, showing library items
 * as a visual grid. Users can click items to insert them on the canvas.
 */
import { useEffect, useState, useRef, useCallback } from "react"
import { useExcalidrawAPI } from "../hooks/useExcalidrawAPI"
import { useStream } from "../hooks/useStream"
import {
  BookOpen,
  Plus,
  Trash2,
  Download,
  RefreshCw,
  Package,
  Search,
  Grid3x3,
  List,
} from "lucide-react"

interface LibraryItem {
  id: string
  status: "published" | "unpublished"
  elements: readonly Record<string, unknown>[]
  created: number
  name?: string
  error?: string
}

/** Generate a tiny SVG thumbnail from Excalidraw elements */
function renderMiniThumbnail(
  elements: readonly Record<string, unknown>[],
  size = 80
): string {
  if (!elements || elements.length === 0) return ""

  // Calculate bounding box
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity

  for (const el of elements) {
    const x = (el.x as number) || 0
    const y = (el.y as number) || 0
    const w = (el.width as number) || 0
    const h = (el.height as number) || 0
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x + w)
    maxY = Math.max(maxY, y + h)
  }

  const bw = maxX - minX || 1
  const bh = maxY - minY || 1
  const scale = Math.min((size - 12) / bw, (size - 12) / bh, 1.5)
  const offsetX = (size - bw * scale) / 2 - minX * scale
  const offsetY = (size - bh * scale) / 2 - minY * scale

  const shapes: string[] = []

  for (const el of elements) {
    const x = ((el.x as number) || 0) * scale + offsetX
    const y = ((el.y as number) || 0) * scale + offsetY
    const w = ((el.width as number) || 10) * scale
    const h = ((el.height as number) || 10) * scale
    const stroke = (el.strokeColor as string) || "#a5b4fc"
    const fill = (el.backgroundColor as string) || "transparent"
    const type = el.type as string

    switch (type) {
      case "rectangle":
        shapes.push(
          `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" stroke="${stroke}" fill="${fill === "transparent" ? "rgba(99,102,241,0.08)" : fill}" stroke-width="1.2" />`
        )
        break
      case "ellipse":
        shapes.push(
          `<ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2}" ry="${h / 2}" stroke="${stroke}" fill="${fill === "transparent" ? "rgba(99,102,241,0.08)" : fill}" stroke-width="1.2" />`
        )
        break
      case "diamond":
        shapes.push(
          `<polygon points="${x + w / 2},${y} ${x + w},${y + h / 2} ${x + w / 2},${y + h} ${x},${y + h / 2}" stroke="${stroke}" fill="${fill === "transparent" ? "rgba(99,102,241,0.08)" : fill}" stroke-width="1.2" />`
        )
        break
      case "arrow":
      case "line": {
        const points = el.points as [number, number][] | undefined
        if (points && points.length >= 2) {
          const d = points
            .map(
              ([px, py], i) =>
                `${i === 0 ? "M" : "L"}${px * scale + x} ${py * scale + y}`
            )
            .join(" ")
          shapes.push(
            `<path d="${d}" stroke="${stroke}" fill="none" stroke-width="1.2" stroke-linecap="round" />`
          )
        } else {
          shapes.push(
            `<line x1="${x}" y1="${y + h / 2}" x2="${x + w}" y2="${y + h / 2}" stroke="${stroke}" stroke-width="1.2" />`
          )
        }
        break
      }
      case "freedraw": {
        const points = el.points as [number, number][] | undefined
        if (points && points.length >= 2) {
          const d = points
            .map(
              ([px, py], i) =>
                `${i === 0 ? "M" : "L"}${px * scale + x} ${py * scale + y}`
            )
            .join(" ")
          shapes.push(
            `<path d="${d}" stroke="${stroke}" fill="none" stroke-width="1" stroke-linecap="round" />`
          )
        }
        break
      }
      case "text": {
        const text = (el.text as string) || ""
        const fontSize = Math.max(6, Math.min(11, ((el.fontSize as number) || 14) * scale))
        shapes.push(
          `<text x="${x + 2}" y="${y + fontSize}" fill="${stroke}" font-size="${fontSize}" font-family="Inter, sans-serif">${escapeXml(text.slice(0, 20))}</text>`
        )
        break
      }
      default:
        // Generic fallback: render as rectangle outline
        if (w > 0 && h > 0) {
          shapes.push(
            `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1" stroke="${stroke}" fill="none" stroke-width="0.8" stroke-dasharray="3 2" />`
          )
        }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${shapes.join("")}</svg>`
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

/** Infer a label for a library item */
function getItemLabel(item: LibraryItem): string {
  if (item.name) return item.name
  // Try to extract from element text or type
  for (const el of item.elements) {
    if (el.text) return (el.text as string).slice(0, 24)
  }
  // Describe by shapes
  const types = item.elements.map((e) => e.type as string)
  const unique = [...new Set(types)]
  if (unique.length === 1) return `${unique[0]} (${types.length})`
  return unique.slice(0, 3).join(" + ")
}

export default function LibraryPanel() {
  const excalidrawAPI = useExcalidrawAPI((s) => s.api)
  const { addSystemMessage } = useStream()

  const [items, setItems] = useState<LibraryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Load library items ──
  const loadLibrary = useCallback(async () => {
    if (!excalidrawAPI) {
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      // getLibraryItems might be async or sync depending on version
      const libItems =
        (excalidrawAPI as any).getLibraryItems?.() ??
        (excalidrawAPI as any).library?.getLatestLibrary?.() ??
        []

      // Handle promise
      const resolved = await Promise.resolve(libItems)
      const arr = Array.isArray(resolved) ? resolved : []
      setItems(arr as LibraryItem[])
    } catch (err) {
      console.warn("Failed to load library items:", err)
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [excalidrawAPI])

  useEffect(() => {
    loadLibrary()
  }, [loadLibrary])

  // ── Insert item onto canvas ──
  const insertItem = useCallback(
    (item: LibraryItem) => {
      if (!excalidrawAPI) return

      try {
        const appState = excalidrawAPI.getAppState()
        const zoom =
          appState.zoom && typeof appState.zoom === "object"
            ? (appState.zoom as { value: number }).value
            : 1

        // Calculate center of viewport
        const centerX = (-(appState.scrollX || 0) + window.innerWidth / 2) / zoom
        const centerY = (-(appState.scrollY || 0) + window.innerHeight / 2) / zoom

        // Calculate bounding box for centering
        let minX = Infinity,
          minY = Infinity
        for (const el of item.elements) {
          minX = Math.min(minX, (el.x as number) || 0)
          minY = Math.min(minY, (el.y as number) || 0)
        }

        // Clone elements with new IDs and position at center
        const newElements = item.elements.map((el) => ({
          ...el,
          id: `lib-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          x: ((el.x as number) || 0) - minX + centerX - 50,
          y: ((el.y as number) || 0) - minY + centerY - 50,
          version: 1,
          versionNonce: Math.floor(Math.random() * 2e9),
          seed: Math.floor(Math.random() * 2e9),
          updated: Date.now(),
          isDeleted: false,
        }))

        const currentElements = excalidrawAPI.getSceneElements()
        excalidrawAPI.updateScene({
          elements: [...currentElements, ...newElements],
        })

        addSystemMessage(
          `📐 Inserted "${getItemLabel(item)}" onto canvas`
        )
      } catch (err) {
        console.error("Failed to insert library item:", err)
        addSystemMessage("Failed to insert library item.")
      }
    },
    [excalidrawAPI, addSystemMessage]
  )

  // ── Delete library item ──
  const deleteItem = useCallback(
    async (itemId: string) => {
      if (!excalidrawAPI) return
      try {
        await (excalidrawAPI as any).updateLibrary?.({
          libraryItems: items.filter((i) => i.id !== itemId),
          merge: false,
        })
        setItems((prev) => prev.filter((i) => i.id !== itemId))
        addSystemMessage("Removed from library.")
      } catch (err) {
        console.warn("Delete failed:", err)
      }
    },
    [excalidrawAPI, items, addSystemMessage]
  )

  // ── Import .excalidrawlib file ──
  const handleFileImport = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file || !excalidrawAPI) return

      try {
        const text = await file.text()
        const data = JSON.parse(text)
        const libItems = data.libraryItems || data.library || []

        if (libItems.length > 0) {
          await (excalidrawAPI as any).updateLibrary?.({
            libraryItems: libItems,
            merge: true,
          })
          addSystemMessage(`Imported ${libItems.length} library items.`)
          loadLibrary()
        } else {
          addSystemMessage("No library items found in file.")
        }
      } catch {
        addSystemMessage("Failed to import library file.")
      }

      // Reset input
      if (fileInputRef.current) fileInputRef.current.value = ""
    },
    [excalidrawAPI, addSystemMessage, loadLibrary]
  )

  // ── Filtered items ──
  const filteredItems = searchQuery
    ? items.filter((item) => {
        const label = getItemLabel(item).toLowerCase()
        const q = searchQuery.toLowerCase()
        return label.includes(q)
      })
    : items

  // ── No Excalidraw available ──
  if (!excalidrawAPI) {
    return (
      <div className="text-center py-8">
        <Package size={24} className="mx-auto mb-3 text-[var(--glass-text-dim)]" />
        <p className="text-[12px] text-[var(--glass-text-dim)]">
          Open a page to access the shape library.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 h-full">
      {/* Header actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        <div className="relative flex-1">
          <Search
            size={12}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--glass-text-dim)]"
          />
          <input
            type="text"
            placeholder="Search library…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.08)] rounded-lg pl-7 pr-2.5 py-1.5 text-[11px] text-white outline-none focus:border-[var(--accent)] transition-colors placeholder-[var(--glass-text-dim)]"
          />
        </div>
        <button
          onClick={() => setViewMode(viewMode === "grid" ? "list" : "grid")}
          className="p-1.5 rounded-lg hover:bg-[rgba(255,255,255,0.06)] text-[var(--glass-text-muted)] hover:text-white transition-colors"
          title={viewMode === "grid" ? "List view" : "Grid view"}
        >
          {viewMode === "grid" ? <List size={13} /> : <Grid3x3 size={13} />}
        </button>
        <button
          onClick={loadLibrary}
          className="p-1.5 rounded-lg hover:bg-[rgba(255,255,255,0.06)] text-[var(--glass-text-muted)] hover:text-white transition-colors"
          title="Refresh"
        >
          <RefreshCw size={13} />
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="p-1.5 rounded-lg hover:bg-[rgba(255,255,255,0.06)] text-[var(--glass-text-muted)] hover:text-[var(--accent-light)] transition-colors"
          title="Import .excalidrawlib"
        >
          <Download size={13} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".excalidrawlib,.json"
          onChange={handleFileImport}
          className="hidden"
        />
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <RefreshCw size={16} className="animate-spin text-[var(--accent)]" />
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="text-center py-6 flex-1 flex flex-col items-center justify-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-[var(--accent-subtle)] flex items-center justify-center">
            <BookOpen size={20} className="text-[var(--accent)]" />
          </div>
          <div>
            <p className="text-[12px] text-[var(--glass-text-dim)] mb-1">
              {searchQuery ? "No matching items" : "Library is empty"}
            </p>
            <p className="text-[10px] text-[var(--glass-text-muted)] leading-relaxed max-w-[200px] mx-auto">
              {searchQuery
                ? "Try a different search term."
                : "Select shapes on the canvas and use the Excalidraw menu to add them to the library."}
            </p>
          </div>
          {!searchQuery && (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 text-[11px] text-[var(--accent-light)] hover:text-white font-medium px-3 py-1.5 rounded-lg bg-[var(--accent-subtle)] hover:bg-[rgba(99,102,241,0.15)] transition-colors"
            >
              <Plus size={12} />
              Import Library
            </button>
          )}
        </div>
      ) : viewMode === "grid" ? (
        /* ── Grid View ── */
        <div className="grid grid-cols-3 gap-1.5 overflow-y-auto flex-1 min-h-0 pb-1">
          {filteredItems.map((item) => (
            <LibraryGridItem
              key={item.id}
              item={item}
              onInsert={() => insertItem(item)}
              onDelete={() => deleteItem(item.id)}
            />
          ))}
        </div>
      ) : (
        /* ── List View ── */
        <div className="flex flex-col gap-1 overflow-y-auto flex-1 min-h-0 pb-1">
          {filteredItems.map((item) => (
            <LibraryListItem
              key={item.id}
              item={item}
              onInsert={() => insertItem(item)}
              onDelete={() => deleteItem(item.id)}
            />
          ))}
        </div>
      )}

      {/* Footer count */}
      {items.length > 0 && (
        <div className="text-[10px] text-[var(--glass-text-dim)] text-center py-1 shrink-0 border-t border-[rgba(255,255,255,0.05)]">
          {filteredItems.length} of {items.length} item
          {items.length !== 1 ? "s" : ""}
        </div>
      )}
    </div>
  )
}

// ━━━ Grid Item ━━━━━━━━━━━━━━━━━━━━━━━━━━━

function LibraryGridItem({
  item,
  onInsert,
  onDelete,
}: {
  item: LibraryItem
  onInsert: () => void
  onDelete: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const svgHTML = renderMiniThumbnail(item.elements, 72)
  const label = getItemLabel(item)

  return (
    <div
      className="group relative rounded-lg bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] hover:border-[var(--accent)] hover:bg-[rgba(99,102,241,0.06)] transition-all cursor-pointer overflow-hidden"
      onClick={onInsert}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={`Click to insert: ${label}`}
    >
      {/* Thumbnail */}
      <div className="aspect-square flex items-center justify-center p-1">
        {svgHTML ? (
          <div
            dangerouslySetInnerHTML={{ __html: svgHTML }}
            className="w-full h-full flex items-center justify-center"
          />
        ) : (
          <Package size={20} className="text-[var(--glass-text-dim)]" />
        )}
      </div>

      {/* Label */}
      <div className="px-1.5 pb-1.5">
        <div className="text-[9px] text-[var(--glass-text-dim)] truncate leading-tight text-center">
          {label}
        </div>
      </div>

      {/* Delete button on hover */}
      {hovered && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          className="absolute top-1 right-1 p-1 rounded bg-[rgba(0,0,0,0.6)] hover:bg-[var(--red)] text-[var(--glass-text-dim)] hover:text-white transition-colors"
          title="Remove from library"
        >
          <Trash2 size={9} />
        </button>
      )}
    </div>
  )
}

// ━━━ List Item ━━━━━━━━━━━━━━━━━━━━━━━━━━━

function LibraryListItem({
  item,
  onInsert,
  onDelete,
}: {
  item: LibraryItem
  onInsert: () => void
  onDelete: () => void
}) {
  const svgHTML = renderMiniThumbnail(item.elements, 36)
  const label = getItemLabel(item)
  const typeNames = [
    ...new Set(item.elements.map((e) => e.type as string)),
  ].join(", ")
  const date = new Date(item.created)
  const dateStr = date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })

  return (
    <div
      className="group flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-[rgba(99,102,241,0.06)] border border-transparent hover:border-[rgba(99,102,241,0.15)] transition-all cursor-pointer"
      onClick={onInsert}
      title={`Click to insert: ${label}`}
    >
      {/* Mini thumbnail */}
      <div className="w-9 h-9 rounded-md bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.06)] flex items-center justify-center shrink-0 overflow-hidden">
        {svgHTML ? (
          <div dangerouslySetInnerHTML={{ __html: svgHTML }} />
        ) : (
          <Package size={14} className="text-[var(--glass-text-dim)]" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="text-[11px] text-white truncate font-medium">{label}</div>
        <div className="text-[9px] text-[var(--glass-text-dim)] truncate">
          {item.elements.length} element{item.elements.length !== 1 ? "s" : ""}{" "}
          · {typeNames} · {dateStr}
        </div>
      </div>

      {/* Actions */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-[rgba(239,68,68,0.15)] text-[var(--glass-text-dim)] hover:text-[var(--red)] transition-all shrink-0"
        title="Remove"
      >
        <Trash2 size={11} />
      </button>
    </div>
  )
}
