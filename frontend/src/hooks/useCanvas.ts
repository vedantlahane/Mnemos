import { useState } from "react"
import type { Node, Edge } from "@xyflow/react"

export function useCanvas() {
  const [nodes, setNodes] = useState<Node[]>([])
  const [edges, setEdges] = useState<Edge[]>([])

  return { nodes, setNodes, edges, setEdges }
}
