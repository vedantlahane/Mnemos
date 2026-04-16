import { useEffect, useState } from "react"

const BACKEND_URL =
  (globalThis as { process?: { env?: { PLASMO_PUBLIC_BACKEND_URL?: string } } }).process?.env
    ?.PLASMO_PUBLIC_BACKEND_URL || "http://localhost:8000"
const FRONTEND_URL = "http://localhost:5173"

interface Note {
  id: string
  title: string
  summary?: string
  page_name?: string
  similarity?: number
}

function Popup() {
  const [selectedText, setSelectedText] = useState("")
  const [relatedNotes, setRelatedNotes] = useState<Note[]>([])
  const [pages, setPages] = useState<any[]>([])
  const [selectedPage, setSelectedPage] = useState<string | null>(null)
  const [commandText, setCommandText] = useState("")
  const [saving, setSaving] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      const pgs = await fetch(`${BACKEND_URL}/api/pages`).then(r => r.json())
      setPages(pgs?.pages || [])
      
      const selection = await new Promise<any>((resolve) => {
         chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs[0]?.id) return resolve("");
            chrome.scripting.executeScript({
                target: { tabId: tabs[0].id },
                func: () => window.getSelection()?.toString() || ""
            }, (res) => resolve(res?.[0]?.result || ""));
         });
      })
      if (selection) setSelectedText(selection)

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (tab?.url) {
        const relatedResp = await fetch(`${BACKEND_URL}/api/context`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: tab.url, text: selection || "" })
        }).then((r) => r.json()).catch(() => ({ related_notes: [] }))

        setRelatedNotes(relatedResp?.related_notes || [])
      }
    } catch (err) {
      console.error(err)
    }
  }

  async function handleSave(openLink = false) {
    if (!selectedText.trim() && !commandText.trim()) return
    setSaving(true)

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    
    // We send message to backend directly
    try {
       const res = await fetch(`${BACKEND_URL}/api/capture`, {
           method: "POST",
           headers: { "Content-Type": "application/json" },
           body: JSON.stringify({
               text: selectedText.trim() || commandText.trim(),
               source_url: tab?.url || "",
               source_title: tab?.title || "",
               capture_type: "manual",
               page_hint: selectedPage ? pages.find(p => p.id === selectedPage)?.name : null,
               custom_command: commandText
           })
       }).then(r => r.json())

       if (openLink && res?.note_id) {
           chrome.tabs.create({ url: `${FRONTEND_URL}/note/${res.note_id}` })
       } else if (openLink) {
           chrome.tabs.create({ url: FRONTEND_URL })
       } else {
           window.close()
       }
    } catch(e) {}
    setSaving(false)
  }

  function getPageDisplay() {
    if (!selectedPage) return "Auto-detect (AI decides)"
    return pages.find(p => p.id === selectedPage)?.name || "Auto-detect"
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
           <span style={{ color: "#818cf8", fontSize: 16 }}>✨</span>
           <span style={styles.title}>MNEMOS</span>
        </div>
        <button onClick={() => chrome.tabs.create({ url: FRONTEND_URL })} style={styles.linkBtn}>
          Open Dashboard ↗
        </button>
      </div>

      <div style={styles.section}>
         <div style={styles.label}>SELECTED TEXT</div>
         <div style={styles.glassCard}>
            <div style={styles.selectedText}>
                {selectedText ? `"${selectedText.slice(0, 140)}..."` : "No text selected on page."}
            </div>
            {selectedText && <div style={styles.charCount}>{selectedText.length} chars</div>}
         </div>
      </div>

      <div style={styles.section}>
         <div style={styles.label}>SAVE TO PAGE</div>
         <div style={{ position: "relative" }}>
             <button style={styles.dropdownToggle} onClick={() => setDropdownOpen(!dropdownOpen)}>
                 <span>🔍 {getPageDisplay()}</span>
                 <span>▼</span>
             </button>
             {dropdownOpen && (
                 <div style={styles.dropdownMenu}>
                     <div style={!selectedPage ? styles.dropdownItemActive : styles.dropdownItem} onClick={() => { setSelectedPage(null); setDropdownOpen(false); }}>
                         🔍 Auto-detect (AI decides)
                     </div>
                     {pages.map(p => (
                         <div key={p.id} style={selectedPage === p.id ? styles.dropdownItemActive : styles.dropdownItem} onClick={() => { setSelectedPage(p.id); setDropdownOpen(false); }}>
                             {p.icon || "📄"} {p.name}
                             <span style={{ float: "right", color: "rgba(255, 255, 255, 0.44)", fontSize: 10 }}>{p.note_count} notes</span>
                         </div>
                     ))}
                 </div>
             )}
         </div>
      </div>

      <div style={styles.section}>
         <div style={styles.label}>COMMAND (OPTIONAL)</div>
         <input 
            value={commandText}
            onChange={(e) => setCommandText(e.target.value)}
            style={styles.input} 
            placeholder="e.g., 'also tag as important'" 
         />
      </div>

      <div style={styles.actionRow}>
         <button onClick={() => handleSave(false)} style={styles.btnPrimary} disabled={saving}>
             {saving ? "Saving..." : "Save"}
         </button>
         <button onClick={() => handleSave(true)} style={styles.btnGhost} disabled={saving}>
             {saving ? "..." : "Save & Open"}
         </button>
      </div>

      <div style={{ height: 1, background: "rgba(255,255,255,0.07)", margin: "16px 0" }} />

      {relatedNotes.length > 0 && (
          <div style={styles.section}>
             <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                 <div style={styles.label}>RELATED TO THIS PAGE</div>
                 <div style={{ fontSize: 10, color: "#818cf8" }}>Docker</div>
             </div>
             <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                 {relatedNotes.slice(0, 3).map((note) => (
                     <div key={note.id} style={styles.noteCard}>
                         <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255, 255, 255, 0.88)" }}>{note.title}</div>
                         <div style={{ fontSize: 11, color: "rgba(255, 255, 255, 0.44)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                             {note.summary || "No summary available..."}
                         </div>
                         <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                             <span style={{ fontSize: 10, color: "#818cf8", background: "rgba(99, 102, 241, 0.15)", padding: "2px 6px", borderRadius: 4 }}>{note.page_name || "Uncategorized"}</span>
                             <span style={{ fontSize: 10, color: "#10b981", fontWeight: 600 }}>{Math.round((note.similarity || 0)*100)}%</span>
                         </div>
                     </div>
                 ))}
             </div>
          </div>
      )}

      <div style={styles.footer}>
          ⌨️ Ctrl+Shift+S to quick save
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: 360,
    height: 540,
    fontFamily: "'Inter', sans-serif",
    background: "#08080f",
    color: "rgba(255, 255, 255, 0.88)",
    display: "flex",
    flexDirection: "column",
    overflowY: "auto",
    overflowX: "hidden",
    boxSizing: "border-box"
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    height: 48,
    padding: "0 16px",
    borderBottom: "1px solid rgba(255, 255, 255, 0.07)",
    flexShrink: 0
  },
  title: {
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: "0.05em",
    margin: 0,
    color: "rgba(255, 255, 255, 0.88)"
  },
  linkBtn: {
    background: "transparent",
    border: "none",
    color: "#818cf8",
    fontSize: 11,
    cursor: "pointer"
  },
  section: {
    padding: "14px 16px 0",
  },
  label: {
    fontSize: 9,
    textTransform: "uppercase",
    color: "rgba(255, 255, 255, 0.44)",
    letterSpacing: "0.05em",
    fontWeight: 600,
    marginBottom: 8
  },
  glassCard: {
    background: "rgba(14, 14, 26, 0.55)",
    border: "1px solid rgba(255, 255, 255, 0.07)",
    borderRadius: 8,
    padding: "10px 12px",
    position: "relative"
  },
  selectedText: {
    fontSize: 12,
    fontStyle: "italic",
    color: "rgba(255, 255, 255, 0.88)",
    lineHeight: 1.4,
    display: "-webkit-box",
    WebkitLineClamp: 3,
    WebkitBoxOrient: "vertical",
    overflow: "hidden"
  },
  charCount: {
    position: "absolute",
    bottom: 6,
    right: 8,
    fontSize: 9,
    color: "rgba(255, 255, 255, 0.44)"
  },
  dropdownToggle: {
    width: "100%",
    height: 40,
    background: "rgba(14, 14, 26, 0.75)",
    border: "1px solid rgba(255, 255, 255, 0.07)",
    borderRadius: 8,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0 12px",
    color: "rgba(255, 255, 255, 0.88)",
    fontSize: 13,
    cursor: "pointer",
  },
  dropdownMenu: {
    position: "absolute",
    top: 44,
    left: 0,
    right: 0,
    background: "rgba(14, 14, 26, 0.95)",
    backdropFilter: "blur(20px)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: 8,
    padding: 4,
    zIndex: 10,
    boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
  },
  dropdownItem: {
    padding: "8px 10px",
    fontSize: 12,
    borderRadius: 6,
    cursor: "pointer",
    color: "rgba(255, 255, 255, 0.88)"
  },
  dropdownItemActive: {
    padding: "8px 10px",
    fontSize: 12,
    borderRadius: 6,
    cursor: "pointer",
    color: "#818cf8",
    background: "rgba(99, 102, 241, 0.15)",
    borderLeft: "2px solid #6366f1"
  },
  input: {
    width: "100%",
    height: 36,
    background: "rgba(14, 14, 26, 0.55)",
    border: "1px solid rgba(255, 255, 255, 0.07)",
    borderRadius: 8,
    padding: "0 12px",
    color: "rgba(255, 255, 255, 0.88)",
    fontSize: 13,
    outline: "none",
    boxSizing: "border-box"
  },
  actionRow: {
    display: "flex",
    gap: 8,
    padding: "14px 16px 0",
  },
  btnPrimary: {
    flex: 1,
    height: 36,
    background: "linear-gradient(to right, #6366f1, #4f46e5)",
    border: "none",
    borderRadius: 8,
    color: "#fff",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer"
  },
  btnGhost: {
    flex: 1,
    height: 36,
    background: "transparent",
    border: "1px solid rgba(255, 255, 255, 0.07)",
    borderRadius: 8,
    color: "rgba(255, 255, 255, 0.6)",
    fontSize: 13,
    cursor: "pointer"
  },
  noteCard: {
    background: "rgba(14, 14, 26, 0.75)",
    border: "1px solid rgba(255, 255, 255, 0.07)",
    borderRadius: 8,
    padding: "10px 12px",
  },
  footer: {
    marginTop: "auto",
    height: 32,
    borderTop: "1px solid rgba(255, 255, 255, 0.07)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    fontSize: 10,
    color: "rgba(255, 255, 255, 0.44)"
  }
}

export default Popup
