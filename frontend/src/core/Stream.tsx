import { useEffect, useRef } from "react"
import { useStream } from "../hooks/useStream"
import StreamMessage from "./StreamMessage"
import StreamBlock from "./StreamBlock"
import { Sparkles } from "lucide-react"

export default function Stream() {
  const { items, isLoading } = useStream()
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [items, isLoading])

  return (
    <div className="flex-1 overflow-y-auto px-4 pt-8 pb-32">
      <div className="max-w-[740px] mx-auto flex flex-col gap-6">
        {items.map((item) => {
          if (item.type === "block") {
            return <StreamBlock key={item.id} item={item} />
          }
          if (item.type === "system") {
            return (
              <div key={item.id} className="text-center text-[12px] text-slate-500 my-4">
                {item.content}
              </div>
            )
          }
          return <StreamMessage key={item.id} item={item} />
        })}

        {isLoading && (
          <div className="flex items-center gap-2 pl-2 text-slate-400 text-sm">
             <div className="w-6 h-6 rounded-full bg-[rgba(255,255,255,0.05)] flex items-center justify-center">
                <Sparkles size={12} className="text-[var(--color-muted)] animate-pulse" />
             </div>
             Thinking...
          </div>
        )}
        <div ref={endRef} />
      </div>
    </div>
  )
}
