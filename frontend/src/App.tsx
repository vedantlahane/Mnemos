import { BrowserRouter } from "react-router-dom"
import { ContextProvider } from "./core/ContextProvider"
import Stream from "./core/Stream"
import CommandBar from "./core/CommandBar"
import CanvasOverlay from "./canvas/CanvasOverlay"

export default function App() {
  return (
    <BrowserRouter>
      <ContextProvider>
        <div className="w-full h-screen bg-[#060609] text-slate-200 flex flex-col overflow-hidden relative">
          <CanvasOverlay />
          <Stream />
          <CommandBar />
        </div>
      </ContextProvider>
    </BrowserRouter>
  )
}
