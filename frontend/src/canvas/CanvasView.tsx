import { useCallback, useMemo, useRef } from "react"
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  type Connection,
  type ReactFlowInstance,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import NoteNode from "./NoteNode"
import StickyNode from "./StickyNode"
import AnnotationNode from "./AnnotationNode"
import ClusterRegion from "./ClusterRegion"
import SketchyEdge from "./SketchyEdge"
import CanvasControls from "./CanvasControls"
import CanvasMinimap from "./CanvasMinimap"
import CanvasSearch from "./CanvasSearch"
import { useCanvas } from "../hooks/useCanvas"
import { useCanvasSearch } from "../hooks/useCanvasSearch"
import { api } from "../api/client"
import { Loader2 } from "lucide-react"

export default function CanvasView({ pageId }: { pageId: string }) {
  const rfRef = useRef<ReactFlowInstance | null>(null)

  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onNodeDragStop,
    canvasState,
    loading,
    error,
  } = useCanvas(pageId)

  // Memoize to prevent re-renders
  const nodeTypes = useMemo(
    () => ({
      note: NoteNode,
      sticky: StickyNode,
      annotation: AnnotationNode,
      cluster: ClusterRegion,
    }),
    []
  )

  const edgeTypes = useMemo(() => ({ sketchy: SketchyEdge }), [])

  // Canvas search
  const { query, search, matchCount, isOpen, close } = useCanvasSearch(
    nodes,
    // Pass a no-op since useCanvas manages nodes internally
    () => {}
  )

  // Create edge on connect
  const onConnect = useCallback(
    async (connection: Connection) => {
      if (!connection.source || !connection.target) return
      try {
        await api.createEdge({
          source_id: connection.source,
          target_id: connection.target,
          edge_type: "related",
        })
        window.dispatchEvent(new CustomEvent("canvas:refresh"))
      } catch (err) {
        console.error("Failed to create edge:", err)
      }
    },
    []
  )

  // Save viewport on move end
  const onMoveEnd = useCallback(
    (_: any, viewport: { x: number; y: number; zoom: number }) => {
      api.savePageViewport(pageId, viewport).catch(() => {})
    },
    [pageId]
  )

  if (loading) {
    return (
      <div className="w-full h-full canvas-bg flex items-center justify-center">
        <div className="flex items-center gap-3 text-[var(--color-secondary)]">
          <Loader2 className="animate-spin" size={20} />
          <span className="text-[14px]">Loading canvas...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="w-full h-full canvas-bg flex items-center justify-center">
        <div className="text-[var(--color-error)] text-[14px]">{error}</div>
      </div>
    )
  }

  return (
    <div className="w-full h-full relative canvas-bg">
      <ReactFlow
        ref={(instance: any) => { rfRef.current = instance }}
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStop={onNodeDragStop}
        onMoveEnd={onMoveEnd}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultViewport={canvasState?.viewport || { x: 0, y: 0, zoom: 1 }}
        fitView={!canvasState?.viewport}
        minZoom={0.1}
        maxZoom={4}
        proOptions={{ hideAttribution: true }}
        className="!bg-transparent"
      >
        <Background
          color="rgba(255,255,255,0.03)"
          gap={24}
          size={1}
          variant={BackgroundVariant.Dots}
        />
        <CanvasSearch
          isOpen={isOpen}
          query={query}
          onSearch={search}
          onClose={close}
          matchCount={matchCount}
        />
        <CanvasControls reactFlowInstance={rfRef} pageId={pageId} />
        <CanvasMinimap />
      </ReactFlow>
    </div>
  )
}