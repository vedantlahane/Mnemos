import { memo, useEffect, useRef } from "react"
import { getBezierPath } from "@xyflow/react"
import type { EdgeProps } from "@xyflow/react"
import rough from "roughjs"

const C: Record<string, string> = {
  related: "#94a3b8",
  depends_on: "#6366f1",
  extends: "#22c55e",
  contradicts: "#ef4444",
  summarizes: "#a855f7",
  example_of: "#f59e0b",
}

export default memo(function SketchyEdge({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }: EdgeProps) {
  const g = useRef<SVGGElement>(null)
  const [path] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })
  const color = C[(data?.edgeType as string) || "related"] || C.related

  useEffect(() => {
    if (!g.current) return
    while (g.current.firstChild) g.current.removeChild(g.current.firstChild)

    const tmp = document.createElementNS("http://www.w3.org/2000/svg", "svg")
    document.body.appendChild(tmp)
    try {
      const rc = rough.svg(tmp)
      const el = rc.path(path, { stroke: color, strokeWidth: 1.8, roughness: 0.7, bowing: 0.4, fill: "none" })
      while (el.firstChild) g.current?.appendChild(el.firstChild)
    } finally {
      document.body.removeChild(tmp)
    }
  }, [path, color])

  return <g ref={g} />
})