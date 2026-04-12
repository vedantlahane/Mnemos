import { useCallback, useEffect, useState } from "react"
import { useNodesState, useEdgesState } from "@xyflow/react"
import type { Node, Edge } from "@xyflow/react"
import { api } from "../api/client"
import type { CanvasState } from "../types"

export function useCanvas(pageId: string | undefined) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [canvasState, setCanvasState] = useState<CanvasState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // ─── Load full canvas data ─────────────────────

  const loadCanvas = useCallback(async () => {
    if (!pageId) return
    setLoading(true)
    setError(null)

    try {
      const data = await api.getPageCanvas(pageId)
      setCanvasState(data)

      // Map notes → ReactFlow nodes
      const noteNodes: Node[] = (data.notes || []).map((n: any) => ({
        id: n.id,
        type: "note",
        position: {
          x: n.canvas_x ?? Math.random() * 800,
          y: n.canvas_y ?? Math.random() * 600,
        },
        data: { note: n },
        style: { width: n.canvas_width || 280 },
      }))

      // Map canvas elements → ReactFlow nodes
      const elementNodes: Node[] = (data.elements || []).map((el: any) => ({
        id: el.id,
        type: el.element_type === "sticky" ? "sticky" : "annotation",
        position: { x: el.position_x, y: el.position_y },
        data: {
          content: el.content,
          style: el.style,
          elementType: el.element_type,
        },
      }))

      // Map clusters → background group nodes (lowest z-index)
      const clusterNodes: Node[] = (data.clusters || []).map((cl: any) => ({
        id: `cluster-${cl.id}`,
        type: "cluster",
        position: { x: cl.center_x ?? 0, y: cl.center_y ?? 0 },
        data: {
          label: cl.label,
          description: cl.description,
          color: cl.color,
          noteCount: (data.notes || []).filter((n: any) => n.cluster_id === cl.id).length,
        },
        // Clusters render behind everything
        zIndex: -1,
        draggable: false,
        selectable: false,
      }))

      setNodes([...clusterNodes, ...noteNodes, ...elementNodes])

      // Map edges → ReactFlow edges
      const rfEdges: Edge[] = (data.edges || []).map((e: any) => ({
        id: e.id,
        source: e.source_id,
        target: e.target_id,
        type: "sketchy",
        data: { edgeType: e.edge_type, label: e.label, strength: e.strength },
      }))

      setEdges(rfEdges)
    } catch (err) {
      console.error("Canvas load error:", err)
      setError("Failed to load canvas data")
    } finally {
      setLoading(false)
    }
  }, [pageId, setNodes, setEdges])

  // ─── Initial load + refresh listener ───────────

  useEffect(() => {
    loadCanvas()

    function onRefresh() {
      loadCanvas()
    }
    window.addEventListener("canvas:refresh", onRefresh)
    return () => window.removeEventListener("canvas:refresh", onRefresh)
  }, [loadCanvas])

  // ─── Save node position on drag end ────────────

  const onNodeDragStop = useCallback(
    async (_: any, node: Node) => {
      // Don't save cluster positions
      if (node.id.startsWith("cluster-")) return

      const { x, y } = node.position

      try {
        // Determine if it's a note or element
        if (node.type === "note") {
          await api.updateNote(node.id, { canvas_x: x, canvas_y: y })
        } else {
          await api.updateElement(node.id, { position_x: x, position_y: y })
        }
      } catch (err) {
        console.error("Failed to save position:", err)
      }
    },
    []
  )

  // ─── Save viewport state ──────────────────────

  const onViewportChange = useCallback(
    async (viewport: { x: number; y: number; zoom: number }) => {
      if (!pageId) return
      // Debounce this in the component, not here
      try {
        await api.savePageViewport(pageId, viewport)
      } catch {
        // Silent fail — viewport save is non-critical
      }
    },
    [pageId]
  )

  return {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onNodeDragStop,
    onViewportChange,
    canvasState,
    loading,
    error,
    reload: loadCanvas,
  }
}