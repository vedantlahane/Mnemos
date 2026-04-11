// background.ts — Service Worker
// Handles: context menu, keyboard commands, API calls, per-URL cooldown

const BACKEND_URL = process.env.PLASMO_PUBLIC_BACKEND_URL || "http://localhost:8000"

// Track context check cooldowns (URL → timestamp)
const contextCooldowns = new Map<string, number>()
const COOLDOWN_MS = 5 * 60 * 1000 // 5 minutes

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "save-to-mnemos",
    title: "Save to Mnemos",
    contexts: ["selection"]
  })
  console.log("Mnemos: Context menu registered")
})

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "save-to-mnemos" && info.selectionText) {
    const result = await captureNote({
      text: info.selectionText,
      source_url: tab?.url || "",
      page_title: tab?.title || "",
      capture_type: "highlight"
    })

    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, {
        type: "CAPTURE_RESULT",
        success: result.success,
        noteId: result.noteId
      })
    }
  }
})

chrome.commands.onCommand.addListener(async (command) => {
  if (command === "save-selection") {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) return

    chrome.tabs.sendMessage(tab.id, { type: "GET_SELECTION" })
  }
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "CAPTURE") {
    captureNote(message.payload).then(sendResponse)
    return true
  }

  if (message.type === "CHECK_CONTEXT") {
    checkContext(message.payload, sender.tab?.id).then(sendResponse)
    return true
  }

  if (message.type === "GET_RECENT_NOTES") {
    getRecentNotes().then(sendResponse)
    return true
  }

  if (message.type === "GET_RELATED_FOR_POPUP") {
    if (sender.tab?.url) {
      const cached = relatedNotesCache.get(sender.tab.url)
      sendResponse({ related: cached || [] })
    } else {
      sendResponse({ related: [] })
    }
    return false
  }
})

interface CapturePayload {
  text: string
  source_url: string
  page_title: string
  capture_type: string
}

interface CaptureResult {
  success: boolean
  noteId?: string
  error?: string
}

async function captureNote(payload: CapturePayload): Promise<CaptureResult> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/capture`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const data = await response.json()
    return { success: true, noteId: data.note_id }
  } catch (error) {
    console.error("Mnemos capture failed:", error)
    return { success: false, error: String(error) }
  }
}

const relatedNotesCache = new Map<string, any[]>()

async function checkContext(
  payload: { url: string; text: string },
  tabId?: number
) {
  const lastCheck = contextCooldowns.get(payload.url)
  if (lastCheck && Date.now() - lastCheck < COOLDOWN_MS) {
    return { skipped: true }
  }

  try {
    const response = await fetch(`${BACKEND_URL}/api/context`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })

    if (!response.ok) throw new Error(`HTTP ${response.status}`)

    const data = await response.json()
    contextCooldowns.set(payload.url, Date.now())

    relatedNotesCache.set(payload.url, data.related_notes || [])

    const count = data.related_notes?.length || 0
    if (tabId) {
      if (count > 0) {
        chrome.action.setBadgeText({ text: String(count), tabId })
        chrome.action.setBadgeBackgroundColor({ color: "#6366f1", tabId })
      } else {
        chrome.action.setBadgeText({ text: "", tabId })
      }
    }

    return { related_notes: data.related_notes }
  } catch (error) {
    console.error("Mnemos context check failed:", error)
    return { error: String(error) }
  }
}

async function getRecentNotes() {
  try {
    const response = await fetch(`${BACKEND_URL}/api/notes?page=1&limit=5`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const data = await response.json()
    return { notes: data.notes }
  } catch (error) {
    console.error("Mnemos fetch recent failed:", error)
    return { notes: [], error: String(error) }
  }
}

export {}
