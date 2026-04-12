import { BaseEdge, getBezierPath } from "@xyflow/react"
import type { EdgeProps } from "@xyflow/react"

const colors: Record<string, string> = {
  related: "rgba(148,163,184, 0.5)",     // gray
  depends_on: "rgba(37,99,235, 0.8)",    // blue
  extends: "rgba(16,185,129, 0.8)",      // green
  contradicts: "rgba(220,38,38, 0.8)",   // red
  summarizes: "rgba(168,85,247, 0.8)",   // purple
  example_of: "rgba(249,115,22, 0.8)",   // orange
}

const strokeDash: Record<string, string> = {
  related: "5,5",
  contradicts: "2,2",
  summarizes: "5,5",
  example_of: "2,2"
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
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  const edgeType = data?.edgeType as string || "related"
  const color = colors[edgeType] || colors.related
  const dash = strokeDash[edgeType]

  return (
    <>
      <BaseEdge 
         path={edgePath} 
         style={{
            stroke: color,
            strokeWidth: 2,
            strokeDasharray: dash,
         }} 
      />
    </>
  )
}
