import { nanoid } from "../utils"
import { createNoteCard, createEdgeArrow, createClusterFrame, createTextBare } from "./canvasAI"
import { readCanvasContext } from "./canvasContext"

interface TopologyNode {
  id: string
  label: string
  type?: string
  cluster?: string
  summary?: string
}

interface TopologyEdge {
  source: string
  target: string
  label?: string
  type?: string
}

interface TopologyCluster {
  id: string
  label: string
}

export interface DiagramTopology {
  title?: string
  elements: TopologyNode[]
  connections: TopologyEdge[]
  clusters?: TopologyCluster[]
}

/**
 * Calculates a hierarchical layered layout for nodes.
 * Fallback to grid if the graph has complex cycles.
 */
function calculateLayout(nodes: TopologyNode[], edges: TopologyEdge[]) {
  const positions = new Map<string, { x: number; y: number }>()
  const width = 360
  const height = 240
  const gapX = 120
  const gapY = 160

  // 1. Identify roots (nodes with no incoming edges)
  const incomingCount = new Map<string, number>()
  nodes.forEach(n => incomingCount.set(n.id, 0))
  edges.forEach(e => {
    if (incomingCount.has(e.target)) {
      incomingCount.set(e.target, incomingCount.get(e.target)! + 1)
    }
  })

  let queue = nodes.filter(n => incomingCount.get(n.id) === 0).map(n => n.id)
  if (queue.length === 0 && nodes.length > 0) queue = [nodes[0].id] // Handle complete cycle

  const levels = new Map<string, number>()
  queue.forEach(id => levels.set(id, 0))
  
  // 2. Assign levels via BFS
  const visited = new Set<string>(queue)
  while (queue.length > 0) {
    const current = queue.shift()!
    const currentLevel = levels.get(current) || 0

    const outgoing = edges.filter(e => e.source === current)
    for (const edge of outgoing) {
      if (!visited.has(edge.target)) {
        visited.add(edge.target)
        levels.set(edge.target, currentLevel + 1)
        queue.push(edge.target)
      } else {
        // Push target deeper if needed, preventing overlaps
        const existingLevel = levels.get(edge.target) || 0
        if (existingLevel <= currentLevel) {
           levels.set(edge.target, currentLevel + 1)
        }
      }
    }
  }

  // Handle disconnected components
  nodes.forEach(n => {
    if (!levels.has(n.id)) levels.set(n.id, 0)
  })

  // 3. Group by level and assign coordinates
  const levelGroups = new Map<number, string[]>()
  levels.forEach((lvl, id) => {
    if (!levelGroups.has(lvl)) levelGroups.set(lvl, [])
    levelGroups.get(lvl)!.push(id)
  })

  const maxLevel = Math.max(...Array.from(levelGroups.keys()), 0)
  
  let currentY = 0
  for (let i = 0; i <= maxLevel; i++) {
    const rowNodes = levelGroups.get(i) || []
    const totalRowWidth = rowNodes.length * width + (rowNodes.length - 1) * gapX
    let startX = -totalRowWidth / 2

    rowNodes.forEach(id => {
      positions.set(id, { x: startX, y: currentY })
      startX += width + gapX
    })
    currentY += height + gapY
  }

  return positions
}

export function renderTopology(
  topology: DiagramTopology,
  ctx: ReturnType<typeof readCanvasContext>,
  diagramGroupId: string = nanoid() // Unified Grouping for Notebook Mode
) {
  const elements: any[] = []
  const { elements: nodes, connections, clusters } = topology
  
  const layout = calculateLayout(nodes, connections)
  const nodeBounds = new Map<string, { x: number, y: number, w: number, h: number }>()

  // Render Title if present
  let titleYOffset = 0
  if (topology.title) {
    const [titleEl] = createTextBare(topology.title, 0, -100, ctx.backgroundColor, {
       fontSize: 32, fontFamily: 1, customDataType: "diagram-title"
    })
    titleEl.groupIds = [diagramGroupId]
    elements.push(titleEl)
    titleYOffset = 60
  }

  // 1. Render Nodes
  for (const node of nodes) {
    const pos = layout.get(node.id) || { x: 0, y: 0 }
    // Shift nodes down if there's a title
    const finalY = pos.y + titleYOffset
    
    const cardElements = createNoteCard(
      {
        noteId: node.id,
        title: node.label,
        summary: node.summary || `Type: ${node.type || 'Concept'}`,
        tags: node.type ? [node.type] : [],
      },
      { x: pos.x, y: finalY },
      ctx.backgroundColor
    )

    // Bind to diagram group
    cardElements.forEach(el => {
      if (!el.groupIds) el.groupIds = []
      el.groupIds.push(diagramGroupId)
      if (node.cluster) el.groupIds.push(`cluster-group-${node.cluster}`)
    })

    elements.push(...cardElements)
    nodeBounds.set(node.id, { x: pos.x, y: finalY, w: 360, h: 240 })
  }

  // 2. Render Clusters
  if (clusters && clusters.length > 0) {
    for (const cluster of clusters) {
      const clusterNodes = nodes.filter(n => n.cluster === cluster.id)
      if (clusterNodes.length === 0) continue

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      clusterNodes.forEach(n => {
        const b = nodeBounds.get(n.id)
        if (b) {
          minX = Math.min(minX, b.x)
          minY = Math.min(minY, b.y)
          maxX = Math.max(maxX, b.x + b.w)
          maxY = Math.max(maxY, b.y + b.h)
        }
      })

      const clusterFrames = createClusterFrame(
        cluster.label, minX, minY, maxX - minX, maxY - minY, "#6366f1", cluster.id
      )
      
      clusterFrames.forEach(el => {
        if (!el.groupIds) el.groupIds = []
        el.groupIds.push(diagramGroupId)
      })
      
      // Clusters should render behind nodes
      elements.unshift(...clusterFrames)
    }
  }

  // 3. Render Edges
  for (const conn of connections) {
    const sourceBounds = nodeBounds.get(conn.source)
    const targetBounds = nodeBounds.get(conn.target)
    
    if (!sourceBounds || !targetBounds) continue

    // Basic edge routing (center to center)
    const sx = sourceBounds.x + sourceBounds.w / 2
    const sy = sourceBounds.y + sourceBounds.h / 2
    const tx = targetBounds.x + targetBounds.w / 2
    const ty = targetBounds.y + targetBounds.h / 2

    const edge = createEdgeArrow(sx, sy, tx, ty, conn.type || "related", conn.label, nanoid())
    
    // Bind to diagram group
    if (!edge.groupIds) edge.groupIds = []
    edge.groupIds.push(diagramGroupId)
    
    // Bind edge ends to nodes
    edge.startBinding = { elementId: `note-frame-${conn.source}`, focus: 0, gap: 15 }
    edge.endBinding = { elementId: `note-frame-${conn.target}`, focus: 0, gap: 15 }

    elements.push(edge)
  }

  return elements
}