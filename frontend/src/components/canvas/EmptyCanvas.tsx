import { Logo } from "@/components/shared/Logo"

export function EmptyCanvas() {
  return (
    <div className="h-full flex flex-col items-center justify-center bg-[var(--color-void)] relative overflow-hidden select-none">
      {/* Ambient */}
      <div
        className="absolute w-[600px] h-[500px] opacity-[0.03] pointer-events-none"
        style={{
          background: "radial-gradient(ellipse, var(--accent), transparent 70%)",
          top: "30%",
          left: "50%",
          transform: "translate(-50%, -50%)",
        }}
      />

      <div className="relative z-10 text-center animate-fade-in">
        <div className="inline-block mb-6">
          <Logo size={52} animated />
        </div>
        <h1 className="text-xl font-semibold text-white tracking-tight mb-2">Mnemos</h1>
        <p className="text-[13px] text-white/30 max-w-[260px] mx-auto leading-relaxed">
          Capture, connect, and recall knowledge through conversation.
        </p>
      </div>
    </div>
  )
}