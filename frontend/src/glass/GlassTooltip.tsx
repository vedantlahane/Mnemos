import { useState } from "react"
export function GlassTooltip({ content, children }: any) {
  const [show, setShow] = useState(false)
  return (
    <div 
       className="relative inline-block" 
       onMouseEnter={() => setShow(true)} 
       onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
         <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 glass-elevated border border-[rgba(255,255,255,0.08)] rounded text-[10px] text-white whitespace-nowrap shadow-xl z-50 pointer-events-none">
            {content}
         </div>
      )}
    </div>
  )
}
