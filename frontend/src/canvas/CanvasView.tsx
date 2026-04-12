import { useCallback, useEffect, useMemo, useState } from "react"
import { ReactFlow, Background, BackgroundVariant, addEdge, useNodesState, useEdgesState } from "@xyflow/react"
import type { Connection, Edge, Node } from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import NoteNode from "./NoteNode"
import StickyNode from "./StickyNode"
import AnnotationNode from "./AnnotationNode"
import ClusterRegion from "./ClusterRegion"
import SketchyEdge from "./SketchyEdge"
import CanvasControls from "./CanvasControls"
import CanvasMinimap from "./CanvasMinimap"
import CanvasChatPanel from "./CanvasChatPanel"
import CanvasSearch from "./CanvasSearch"
import { api } from "../api/client"
import { useContext } from "../hooks/useContext"

// Excalidraw-like background theme
const backgroundColor = "#0d0d14"

export default function CanvasView() {
  const { current } = useContext()
  const pageId = current.pageId!

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [loading, setLoading] = useState(true)

  const nodeTypes = useMemo(() => ({ note: NoteNode, sticky: StickyNode, annotation: AnnotationNode, cluster: ClusterRegion }), [])
  const edgeTypes = useMemo(() => ({ sketchy: SketchyEdge }), [])

  useEffect(() => {
    async function load() {
      try {
        const data = await api.getPageCanvas(pageId)
        
        // Map backend Notes to ReactFlow Nodes
        const initialNodes = data.notes.map((n: any) => ({
           id: n.id,
           type: "note",
           position: { x: n.canvas_x || Math.random()*500, y: n.canvas_y || Math.random()*500 },
           data: { note: n }
        }))

        // Map backend Edges to ReactFlow Edges
        const initialEdges = data.edges.map((e: any) => ({
           id: e.id,
           source: e.source_id,
           target: e.target_id,
           type: "sketchy",
           data: { edgeType: e.edge_type }
        }))

        setNodes(initialNodes)
        setEdges(initialEdges)
      } catch (err) {
        console.error("Canvas load error:", err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [pageId, setNodes, setEdges])

  const onConnect = useCallback((params: Connection | Edge) => {
    setEdges(eds => addEdge({ ...params, type: "sketchy" }, eds))
  }, [setEdges])

  if (loading) return null

  return (
    <div className="w-full h-full relative" style={{ background: backgroundColor }}>
       <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          minZoom={0.1}
          maxZoom={4}
          proOptions={{ hideAttribution: true }}
       >
          <Background 
             color="rgba(255,255,255,0.08)" 
             gap={24} 
             size={1} 
             variant={BackgroundVariant.Dots} 
          />
          <CanvasSearch />
          <CanvasControls />
          <CanvasChatPanel />
          <CanvasMinimap />
       </ReactFlow>
    </div>
  )
}
