import { useCallback, useMemo, useRef } from "react"
import {
  ReactFlow, Background, BackgroundVariant,
  type Connection, type ReactFlowInstance,
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
  const { nodes, edges, onNodesChange, onEdgesChange, onNodeDragStop, canvasState, loading, error } = useCanvas(pageId)

  const nodeTypes = useMemo(() => ({ note: NoteNode, sticky: StickyNode, annotation: AnnotationNode, cluster: ClusterRegion }), [])
  const edgeTypes = useMemo(() => ({ sketchy: SketchyEdge }), [])

  const { query, search, matchCount, isOpen, close } = useCanvasSearch(nodes, () => {})

  const onConnect = useCallback(async (c: Connection) => {
    if (!c.source || !c.target) return
    await api.createEdge({ source_id: c.source, target_id: c.target, edge_type: "related" }).catch(() => {})
    window.dispatchEvent(new CustomEvent("canvas:refresh"))
  }, [])

  const onMoveEnd = useCallback((_: unknown, vp: { x: number; y: number; zoom: number }) => {
    api.savePageViewport(pageId, vp).catch(() => {})
  }, [pageId])

  if (loading) {
    return (
      <div className="w-full h-full canvas-bg flex items-center justify-center">
        <Loader2 className="animate-spin text-[var(--accent)]" size={22} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="w-full h-full canvas-bg flex items-center justify-center text-[var(--red)] text-sm">{error}</div>
    )
  }

  return (
    <div className="w-full h-full canvas-bg">
      <ReactFlow
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
        minZoom={0.08}
        maxZoom={5}
        proOptions={{ hideAttribution: true }}
        className="!bg-transparent"
        snapToGrid
        snapGrid={[14, 14]}
      >
        <Background color="rgba(255,255,255,0.03)" gap={28} size={1} variant={BackgroundVariant.Dots} />
        <CanvasSearch isOpen={isOpen} query={query} onSearch={search} onClose={close} matchCount={matchCount} />
        <CanvasControls reactFlowInstance={rfRef} pageId={pageId} />
        <CanvasMinimap />
      </ReactFlow>
    </div>
  )
}