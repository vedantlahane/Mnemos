import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  run_at: "document_idle"
}

function showToast(message: string, isError = false) {
  const existing = document.getElementById("mnemos-toast")
  if (existing) existing.remove()

  const toast = document.createElement("div")
  toast.id = "mnemos-toast"
  toast.textContent = message
  toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    padding: 12px 20px;
    background: ${isError ? "#ef4444" : "#6366f1"};
    color: white;
    border-radius: 8px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 14px;
    font-weight: 500;
    z-index: 2147483647;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    transition: opacity 0.3s ease;
    opacity: 0;
  `

  document.body.appendChild(toast)

  requestAnimationFrame(() => {
    toast.style.opacity = "1"
  })

  setTimeout(() => {
    toast.style.opacity = "0"
    setTimeout(() => toast.remove(), 300)
  }, 3000)
}

chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
  if (message.type === "GET_SELECTION") {
    const selectedText = window.getSelection()?.toString().trim()

    if (!selectedText) {
      showToast("No text selected!", true)
      return
    }

    chrome.runtime.sendMessage(
      {
        type: "CAPTURE",
        payload: {
          text: selectedText,
          source_url: window.location.href,
          page_title: document.title,
          capture_type: "highlight"
        }
      },
      (response) => {
        if (response?.success) {
          showToast("✓ Saved to Mnemos!")
        } else {
          showToast("✗ Backend offline. Try again.", true)
        }
      }
    )
  }

  if (message.type === "CAPTURE_RESULT") {
    if (message.success) {
      showToast("✓ Saved to Mnemos!")
    } else {
      showToast("✗ Failed to save. Is backend running?", true)
    }
  }
})

function runContextCheck() {
  setTimeout(() => {
    const pageText = document.body?.innerText?.slice(0, 1000) || ""
    const url = window.location.href

    if (pageText.length < 200) return

    chrome.runtime.sendMessage({
      type: "CHECK_CONTEXT",
      payload: { url, text: pageText }
    })
  }, 2000)
}

runContextCheck()
