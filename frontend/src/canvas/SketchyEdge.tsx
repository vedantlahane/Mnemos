import { useEffect, useRef } from "react"
import { getBezierPath } from "@xyflow/react"
import type { EdgeProps } from "@xyflow/react"
import rough from "roughjs"

const COLORS: Record<string, string> = {
  related: "rgba(148,163,184,0.6)",
  depends_on: "rgba(99,102,241,0.8)",
  extends: "rgba(34,197,94,0.8)",
  contradicts: "rgba(239,68,68,0.8)",
  summarizes: "rgba(168,85,247,0.8)",
  example_of: "rgba(249,115,22,0.8)",
}

export default function SketchyEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps) {
  const svgRef = useRef<SVGGElement>(null)

  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  const edgeType = (data?.edgeType as string) || "related"
  const color = COLORS[edgeType] || COLORS.related

  useEffect(() => {
    if (!svgRef.current) return

    // Clear previous
    while (svgRef.current.firstChild) {
      svgRef.current.removeChild(svgRef.current.firstChild)
    }

    // Create a temporary SVG to parse the path
    const tempSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
    document.body.appendChild(tempSvg)

    try {
      const rc = rough.svg(tempSvg)
      const node = rc.path(edgePath, {
        stroke: color,
        strokeWidth: 1.5,
        roughness: 1.2,
        bowing: 1,
        fill: "none",
      })

      // Copy the rough path elements into our ref
      while (node.firstChild) {
        svgRef.current.appendChild(node.firstChild)
      }
    } finally {
      document.body.removeChild(tempSvg)
    }
  }, [edgePath, color])

  return (
    <g ref={svgRef} className="react-flow__edge-path" />
  )
}