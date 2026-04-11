import { useEffect, useState } from "react"

const BACKEND_URL =
  (globalThis as { process?: { env?: { PLASMO_PUBLIC_BACKEND_URL?: string } } }).process?.env
    ?.PLASMO_PUBLIC_BACKEND_URL || "http://localhost:8000"
const FRONTEND_URL = "http://localhost:5173"

interface Note {
  id: string
  title: string
  summary?: string
  tags?: string[]
  source_url?: string
  similarity?: number
}

function Popup() {
  const [recentNotes, setRecentNotes] = useState<Note[]>([])
  const [relatedNotes, setRelatedNotes] = useState<Note[]>([])
  const [manualText, setManualText] = useState("")
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const recentResp = await new Promise<any>((resolve) => {
        chrome.runtime.sendMessage({ type: "GET_RECENT_NOTES" }, resolve)
      })
      setRecentNotes(recentResp?.notes || [])

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (tab?.url) {
        const relatedResp = await fetch(`${BACKEND_URL}/api/context`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: tab.url, text: "" })
        })
          .then((r) => r.json())
          .catch(() => ({ related_notes: [] }))

        setRelatedNotes(relatedResp?.related_notes || [])
      }
    } catch (err) {
      setError("Can't connect to backend")
    } finally {
      setLoading(false)
    }
  }

  async function handleManualCapture() {
    if (!manualText.trim()) return
    setSaving(true)

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })

    const result = await new Promise<any>((resolve) => {
      chrome.runtime.sendMessage(
        {
          type: "CAPTURE",
          payload: {
            text: manualText.trim(),
            source_url: tab?.url || "",
            page_title: tab?.title || "",
            capture_type: "manual"
          }
        },
        resolve
      )
    })

    if (result?.success) {
      setManualText("")
      loadData()
    }
    setSaving(false)
  }

  function openDashboard() {
    chrome.tabs.create({ url: FRONTEND_URL })
  }

  function openNote(id: string) {
    chrome.tabs.create({ url: `${FRONTEND_URL}/note/${id}` })
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>🧠 Mnemos</h1>
        <button onClick={openDashboard} style={styles.dashboardBtn}>
          Dashboard →
        </button>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      <div style={styles.section}>
        <textarea
          value={manualText}
          onChange={(e) => setManualText(e.target.value)}
          placeholder="Quick note..."
          style={styles.textarea}
          rows={3}
        />
        <button
          onClick={handleManualCapture}
          disabled={saving || !manualText.trim()}
          style={{
            ...styles.captureBtn,
            opacity: saving || !manualText.trim() ? 0.5 : 1
          }}
        >
          {saving ? "Saving..." : "Save Note"}
        </button>
      </div>

      {loading ? (
        <div style={styles.loading}>Loading...</div>
      ) : (
        <>
          {relatedNotes.length > 0 && (
            <div style={styles.section}>
              <h2 style={styles.sectionTitle}>📌 Related to this page</h2>
              {relatedNotes.map((note) => (
                <NoteItem key={note.id} note={note} onClick={() => openNote(note.id)} />
              ))}
            </div>
          )}

          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>🕐 Recent</h2>
            {recentNotes.length === 0 ? (
              <div style={styles.empty}>
                No notes yet. Highlight text and press Ctrl+Shift+S!
              </div>
            ) : (
              recentNotes.map((note) => (
                <NoteItem key={note.id} note={note} onClick={() => openNote(note.id)} />
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}

function NoteItem({ note, onClick }: { note: Note; onClick: () => void }) {
  return (
    <div style={styles.noteItem} onClick={onClick}>
      <div style={styles.noteTitle}>{note.title || "Untitled"}</div>
      {note.summary && (
        <div style={styles.noteSummary}>
          {note.summary.slice(0, 80)}
          {note.summary.length > 80 ? "..." : ""}
        </div>
      )}
      {note.tags && note.tags.length > 0 && (
        <div style={styles.tags}>
          {note.tags.slice(0, 3).map((tag) => (
            <span key={tag} style={styles.tag}>
              #{tag}
            </span>
          ))}
        </div>
      )}
      {note.similarity !== undefined && (
        <span style={styles.similarity}>{Math.round(note.similarity * 100)}% match</span>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: 360,
    maxHeight: 500,
    overflowY: "auto",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    padding: 16,
    background: "#0f172a",
    color: "#e2e8f0"
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
    margin: 0
  },
  dashboardBtn: {
    background: "transparent",
    border: "1px solid #475569",
    color: "#94a3b8",
    padding: "4px 10px",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 12
  },
  section: {
    marginBottom: 16
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: "#94a3b8",
    marginBottom: 8,
    margin: "0 0 8px 0"
  },
  textarea: {
    width: "100%",
    padding: 10,
    borderRadius: 8,
    border: "1px solid #334155",
    background: "#1e293b",
    color: "#e2e8f0",
    fontSize: 13,
    resize: "vertical" as const,
    boxSizing: "border-box" as const,
    outline: "none"
  },
  captureBtn: {
    width: "100%",
    marginTop: 8,
    padding: "8px 0",
    background: "#6366f1",
    color: "white",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    fontWeight: 600,
    fontSize: 13
  },
  noteItem: {
    padding: 10,
    background: "#1e293b",
    borderRadius: 8,
    marginBottom: 6,
    cursor: "pointer",
    transition: "background 0.15s"
  },
  noteTitle: {
    fontSize: 13,
    fontWeight: 600,
    marginBottom: 4
  },
  noteSummary: {
    fontSize: 12,
    color: "#94a3b8",
    marginBottom: 4
  },
  tags: {
    display: "flex",
    gap: 4,
    flexWrap: "wrap" as const
  },
  tag: {
    fontSize: 11,
    color: "#818cf8",
    background: "#1e1b4b",
    padding: "2px 6px",
    borderRadius: 4
  },
  similarity: {
    fontSize: 11,
    color: "#22c55e",
    float: "right" as const
  },
  loading: {
    textAlign: "center" as const,
    color: "#64748b",
    padding: 20,
    fontSize: 13
  },
  empty: {
    textAlign: "center" as const,
    color: "#64748b",
    padding: 16,
    fontSize: 12
  },
  error: {
    background: "#7f1d1d",
    color: "#fca5a5",
    padding: 8,
    borderRadius: 6,
    fontSize: 12,
    marginBottom: 12,
    textAlign: "center" as const
  }
}

export default Popup
