/**
 * useNotebook — manages block state, editing, persistence for the notebook editor.
 *
 * Responsibilities:
 *  - Load PageDocumentBundle from API
 *  - Track local block edits
 *  - Debounced save (batch)
 *  - Block CRUD with ordering
 *  - Dirty / saving / error state
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { api } from "../api/client"
import type { PageBlock, PageDocumentBundle } from "../types"
import { uid } from "../utils"

// ── Types ──────────────────────────────────────────

export interface LocalBlock {
  /** Matches PageBlock.id, or a temp id for new blocks */
  id: string
  pageId: string
  blockType: string
  textContent: string
  depth: number
  orderKey: number
  isNew: boolean
  isDeleted: boolean
  version: number
}

export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error"

export interface NotebookState {
  blocks: LocalBlock[]
  focusedBlockId: string | null
  cursorPosition: "start" | "end" | null
  saveStatus: SaveStatus
  loading: boolean
  error: string | null
  pageName: string
}

const SAVE_DEBOUNCE_MS = 2_000

// ── Conversion helpers ─────────────────────────────

function toLocal(b: PageBlock): LocalBlock {
  return {
    id: b.id,
    pageId: b.page_id,
    blockType: b.block_type || "paragraph",
    textContent: b.text_content || "",
    depth: b.depth || 0,
    orderKey: b.order_key,
    isNew: false,
    isDeleted: b.is_deleted,
    version: b.version,
  }
}

function midKey(a: number, b: number): number {
  return Math.round(((a + b) / 2) * 1000) / 1000
}

// ── Hook ────────────────────────────────────────────

export function useNotebook(pageId: string) {
  const [state, setState] = useState<NotebookState>({
    blocks: [],
    focusedBlockId: null,
    cursorPosition: null,
    saveStatus: "idle",
    loading: true,
    error: null,
    pageName: "",
  })

  const dirtyIds = useRef(new Set<string>())
  const deletedIds = useRef(new Set<string>())
  const createdIds = useRef(new Set<string>())
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isSaving = useRef(false)
  const mounted = useRef(true)

  // ── Helpers ──

  const patch = useCallback(
    (fn: (prev: NotebookState) => Partial<NotebookState>) =>
      setState((prev) => ({ ...prev, ...fn(prev) })),
    []
  )

  const activeBlocks = useMemo(
    () => state.blocks.filter((b) => !b.isDeleted).sort((a, b) => a.orderKey - b.orderKey),
    [state.blocks]
  )

  // ── Load ──

  const load = useCallback(async () => {
    patch(() => ({ loading: true, error: null }))
    dirtyIds.current.clear()
    deletedIds.current.clear()
    createdIds.current.clear()

    try {
      const bundle: PageDocumentBundle = await api.getPageDocument(pageId)
      const blocks = (bundle.blocks || [])
        .filter((b) => !b.is_deleted)
        .sort((a, b) => (a.order_key || 0) - (b.order_key || 0))
        .map(toLocal)

      // Guarantee at least one empty block
      if (blocks.length === 0) {
        blocks.push({
          id: uid(),
          pageId,
          blockType: "paragraph",
          textContent: "",
          depth: 0,
          orderKey: 1,
          isNew: true,
          isDeleted: false,
          version: 1,
        })
        createdIds.current.add(blocks[0].id)
      }

      if (!mounted.current) return
      patch(() => ({
        blocks,
        loading: false,
        pageName: bundle.page?.name || "Untitled",
        focusedBlockId: null,
        saveStatus: "idle",
      }))
    } catch (e) {
      if (!mounted.current) return
      // If the document doesn't exist yet, start with a blank block
      const fallback: LocalBlock = {
        id: uid(),
        pageId,
        blockType: "paragraph",
        textContent: "",
        depth: 0,
        orderKey: 1,
        isNew: true,
        isDeleted: false,
        version: 1,
      }
      createdIds.current.add(fallback.id)

      try {
        const page = await api.getPage(pageId)
        patch(() => ({
          blocks: [fallback],
          loading: false,
          error: null,
          pageName: page?.name || "Untitled",
          focusedBlockId: fallback.id,
          cursorPosition: "start",
        }))
      } catch {
        patch(() => ({
          blocks: [fallback],
          loading: false,
          error: e instanceof Error ? e.message : "Failed to load",
          pageName: "Untitled",
        }))
      }
    }
  }, [pageId, patch])

  useEffect(() => {
    mounted.current = true
    load()
    return () => {
      mounted.current = false
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [load])

  // ── Save (debounced batch) ──

  const scheduleSave = useCallback(() => {
    patch(() => ({ saveStatus: "dirty" }))
    if (saveTimer.current) clearTimeout(saveTimer.current)

    saveTimer.current = setTimeout(async () => {
      if (isSaving.current) return
      if (
        dirtyIds.current.size === 0 &&
        createdIds.current.size === 0 &&
        deletedIds.current.size === 0
      )
        return

      isSaving.current = true
      patch(() => ({ saveStatus: "saving" }))

      try {
        const allBlocks = state.blocks.filter((b) => !b.isDeleted)

        // Create new blocks
        for (const id of createdIds.current) {
          const block = allBlocks.find((b) => b.id === id)
          if (!block) continue
          try {
            await api.createPageBlock(pageId, {
              id: block.id,
              block_type: block.blockType,
              text_content: block.textContent,
              depth: block.depth,
              order_key: block.orderKey,
            })
          } catch {
            // If creation fails with conflict, try updating instead
            try {
              await api.updatePageBlock(pageId, block.id, {
                block_type: block.blockType,
                text_content: block.textContent,
                depth: block.depth,
                order_key: block.orderKey,
              })
            } catch {}
          }
        }

        // Update dirty blocks
        for (const id of dirtyIds.current) {
          if (createdIds.current.has(id)) continue // already handled
          const block = state.blocks.find((b) => b.id === id)
          if (!block || block.isDeleted) continue
          try {
            await api.updatePageBlock(pageId, id, {
              block_type: block.blockType,
              text_content: block.textContent,
              depth: block.depth,
              order_key: block.orderKey,
            })
          } catch {}
        }

        // Delete blocks
        for (const id of deletedIds.current) {
          try {
            await api.deletePageBlock(pageId, id)
          } catch {}
        }

        dirtyIds.current.clear()
        createdIds.current.clear()
        deletedIds.current.clear()

        if (mounted.current) patch(() => ({ saveStatus: "saved" }))

        // Reset status after showing "saved"
        setTimeout(() => {
          if (mounted.current) patch(() => ({ saveStatus: "idle" }))
        }, 2000)
      } catch {
        if (mounted.current) patch(() => ({ saveStatus: "error" }))
      } finally {
        isSaving.current = false
      }
    }, SAVE_DEBOUNCE_MS)
  }, [pageId, state.blocks, patch])

  // ── Block operations ──

  const updateBlockText = useCallback(
    (blockId: string, text: string) => {
      setState((prev) => ({
        ...prev,
        blocks: prev.blocks.map((b) =>
          b.id === blockId ? { ...b, textContent: text } : b
        ),
      }))
      dirtyIds.current.add(blockId)
      scheduleSave()
    },
    [scheduleSave]
  )

  const changeBlockType = useCallback(
    (blockId: string, newType: string, newText?: string) => {
      setState((prev) => ({
        ...prev,
        blocks: prev.blocks.map((b) =>
          b.id === blockId
            ? { ...b, blockType: newType, textContent: newText ?? b.textContent }
            : b
        ),
      }))
      dirtyIds.current.add(blockId)
      scheduleSave()
    },
    [scheduleSave]
  )

  const createBlockBelow = useCallback(
    (afterBlockId: string, type = "paragraph", text = ""): string => {
      const newId = uid()
      setState((prev) => {
        const sorted = [...prev.blocks]
          .filter((b) => !b.isDeleted)
          .sort((a, b) => a.orderKey - b.orderKey)
        const idx = sorted.findIndex((b) => b.id === afterBlockId)
        const current = sorted[idx]
        const next = sorted[idx + 1]
                const newOrder = next
          ? midKey(current?.orderKey ?? 0, next.orderKey)
          : (current?.orderKey ?? 0) + 1

        const newBlock: LocalBlock = {
          id: newId,
          pageId,
          blockType: type,
          textContent: text,
          depth: current?.depth ?? 0,
          orderKey: newOrder,
          isNew: true,
          isDeleted: false,
          version: 1,
        }

        return {
          ...prev,
          blocks: [...prev.blocks, newBlock],
          focusedBlockId: newId,
          cursorPosition: "start",
        }
      })

      createdIds.current.add(newId)
      scheduleSave()
      return newId
    },
    [pageId, scheduleSave]
  )

  const createBlockAbove = useCallback(
    (beforeBlockId: string, type = "paragraph", text = ""): string => {
      const newId = uid()
      setState((prev) => {
        const sorted = [...prev.blocks]
          .filter((b) => !b.isDeleted)
          .sort((a, b) => a.orderKey - b.orderKey)
        const idx = sorted.findIndex((b) => b.id === beforeBlockId)
        const current = sorted[idx]
        const prev_ = sorted[idx - 1]

        const newOrder = prev_
          ? midKey(prev_.orderKey, current?.orderKey ?? 0)
          : (current?.orderKey ?? 0) - 1

        const newBlock: LocalBlock = {
          id: newId,
          pageId,
          blockType: type,
          textContent: text,
          depth: current?.depth ?? 0,
          orderKey: newOrder,
          isNew: true,
          isDeleted: false,
          version: 1,
        }

        return {
          ...prev,
          blocks: [...prev.blocks, newBlock],
          focusedBlockId: newId,
          cursorPosition: "start",
        }
      })

      createdIds.current.add(newId)
      scheduleSave()
      return newId
    },
    [pageId, scheduleSave]
  )

  const deleteBlock = useCallback(
    (blockId: string) => {
      setState((prev) => {
        const sorted = prev.blocks
          .filter((b) => !b.isDeleted)
          .sort((a, b) => a.orderKey - b.orderKey)

        // Don't delete the last remaining block
        if (sorted.length <= 1) return prev

        const idx = sorted.findIndex((b) => b.id === blockId)
        const focusTarget =
          idx > 0 ? sorted[idx - 1].id : sorted[idx + 1]?.id ?? null

        return {
          ...prev,
          blocks: prev.blocks.map((b) =>
            b.id === blockId ? { ...b, isDeleted: true } : b
          ),
          focusedBlockId: focusTarget,
          cursorPosition: "end",
        }
      })

      if (createdIds.current.has(blockId)) {
        // Never persisted — just remove from create queue
        createdIds.current.delete(blockId)
      } else {
        deletedIds.current.add(blockId)
      }
      dirtyIds.current.delete(blockId)
      scheduleSave()
    },
    [scheduleSave]
  )

  const mergeBlockUp = useCallback(
    (blockId: string) => {
      setState((prev) => {
        const sorted = prev.blocks
          .filter((b) => !b.isDeleted)
          .sort((a, b) => a.orderKey - b.orderKey)
        const idx = sorted.findIndex((b) => b.id === blockId)
        if (idx <= 0) return prev

        const current = sorted[idx]
        const above = sorted[idx - 1]

        // Don't merge headings into paragraphs or across type boundaries
        // that don't make sense
        if (above.blockType === "divider") return prev

        const mergedText = above.textContent + current.textContent

        return {
          ...prev,
          blocks: prev.blocks.map((b) => {
            if (b.id === above.id)
              return { ...b, textContent: mergedText }
            if (b.id === blockId)
              return { ...b, isDeleted: true }
            return b
          }),
          focusedBlockId: above.id,
          // Cursor at the join point
          cursorPosition: null, // We'll handle cursor offset separately
        }
      })

      dirtyIds.current.add(
        state.blocks.find((b) => !b.isDeleted && b.id !== blockId)
          ? blockId
          : blockId
      )

      // Mark the above block dirty and current as deleted
      const sorted = state.blocks
        .filter((b) => !b.isDeleted)
        .sort((a, b) => a.orderKey - b.orderKey)
      const idx = sorted.findIndex((b) => b.id === blockId)
      if (idx > 0) {
        dirtyIds.current.add(sorted[idx - 1].id)
      }

      if (createdIds.current.has(blockId)) {
        createdIds.current.delete(blockId)
      } else {
        deletedIds.current.add(blockId)
      }
      dirtyIds.current.delete(blockId)
      scheduleSave()
    },
    [state.blocks, scheduleSave]
  )

  const indentBlock = useCallback(
    (blockId: string, delta: 1 | -1) => {
      setState((prev) => ({
        ...prev,
        blocks: prev.blocks.map((b) =>
          b.id === blockId
            ? { ...b, depth: Math.max(0, Math.min(8, b.depth + delta)) }
            : b
        ),
      }))
      dirtyIds.current.add(blockId)
      scheduleSave()
    },
    [scheduleSave]
  )

  const moveBlock = useCallback(
    (blockId: string, direction: "up" | "down") => {
      setState((prev) => {
        const sorted = prev.blocks
          .filter((b) => !b.isDeleted)
          .sort((a, b) => a.orderKey - b.orderKey)
        const idx = sorted.findIndex((b) => b.id === blockId)
        if (idx < 0) return prev
        if (direction === "up" && idx === 0) return prev
        if (direction === "down" && idx === sorted.length - 1) return prev

        const swapIdx = direction === "up" ? idx - 1 : idx + 1
        const myKey = sorted[idx].orderKey
        const theirKey = sorted[swapIdx].orderKey

        return {
          ...prev,
          blocks: prev.blocks.map((b) => {
            if (b.id === sorted[idx].id) return { ...b, orderKey: theirKey }
            if (b.id === sorted[swapIdx].id) return { ...b, orderKey: myKey }
            return b
          }),
        }
      })
      dirtyIds.current.add(blockId)
      scheduleSave()
    },
    [scheduleSave]
  )

  const setFocus = useCallback(
    (blockId: string | null, cursor: "start" | "end" | null = null) => {
      patch(() => ({ focusedBlockId: blockId, cursorPosition: cursor }))
    },
    [patch]
  )

  const focusRelative = useCallback(
    (currentId: string, direction: "up" | "down") => {
      const sorted = activeBlocks
      const idx = sorted.findIndex((b) => b.id === currentId)
      if (idx < 0) return

      const target =
        direction === "up" ? sorted[idx - 1] : sorted[idx + 1]
      if (target) {
        setFocus(target.id, direction === "up" ? "end" : "start")
      }
    },
    [activeBlocks, setFocus]
  )

  return {
    ...state,
    activeBlocks,
    load,
    updateBlockText,
    changeBlockType,
    createBlockBelow,
    createBlockAbove,
    deleteBlock,
    mergeBlockUp,
    indentBlock,
    moveBlock,
    setFocus,
    focusRelative,
  }
}