// background.ts — Service Worker

declare const process: {
  env: Record<string, string | undefined>
}

const BACKEND_URL = process.env.PLASMO_PUBLIC_BACKEND_URL || "http://localhost:8000"

const contextCooldowns = new Map<string, number>()
const COOLDOWN_MS = 5 * 60 * 1000
const relatedNotesCache = new Map<string, any[]>()

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "save-to-mnemos",
    title: "Save to Mnemos",
    contexts: ["selection"]
  })
})

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "save-to-mnemos" && info.selectionText) {
    const result = await captureNote({
      text: info.selectionText,
      source_url: tab?.url || "",
      source_title: tab?.title || "",
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

  if (message.type === "GET_PAGES") {
    getPages().then(sendResponse)
    return true
  }

  if (message.type === "GET_RELATED_FOR_POPUP") {
    if (sender.tab?.url) {
      sendResponse({ related: relatedNotesCache.get(sender.tab.url) || [] })
    } else {
      sendResponse({ related: [] })
    }
    return false
  }
})

interface CapturePayload {
  text: string
  source_url: string
  source_title: string
  capture_type: string
  page_hint?: string
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

    if (!response.ok) throw new Error(`HTTP ${response.status}`)

    const data = await response.json()
    return { success: true, noteId: data.note_id }
  } catch (error) {
    console.error("Mnemos capture failed:", error)
    return { success: false, error: String(error) }
  }
}

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

async function getPages() {
  try {
    const response = await fetch(`${BACKEND_URL}/api/pages`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.json()
  } catch (error) {
    console.error("Mnemos fetch pages failed:", error)
    return { pages: [], error: String(error) }
  }
}

export {}