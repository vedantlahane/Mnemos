import type { RefObject } from "react"
import { TopBar } from "./TopBar"
import { ChatBox } from "./ChatBox"
import { PanelContainer } from "@/components/panels/PanelContainer"
import { useAppStore } from "@/store"

interface Props {
  inputRef: RefObject<HTMLTextAreaElement | null>
}

export function Sidebar({ inputRef }: Props) {
  const panel = useAppStore((s) => s.activePanel)

  return (
    <div
      className="w-[380px] h-full flex flex-col border-l border-[var(--glass-border)]"
      style={{
        background: "var(--glass-bg-medium)",
        backdropFilter: "blur(24px)",
      }}
    >
      <TopBar />

      {panel !== "none" && (
        <div className="flex-shrink-0 max-h-[50%] overflow-y-auto border-b border-[var(--glass-border)] animate-slide-in">
          <PanelContainer />
        </div>
      )}

      <div className="flex-1 min-h-0 flex flex-col">
        <ChatBox inputRef={inputRef} />
      </div>
    </div>
  )
}