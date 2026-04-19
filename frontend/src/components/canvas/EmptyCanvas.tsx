export function EmptyCanvas() {
  return (
    <div className="h-full w-full bg-[var(--color-void)] relative overflow-hidden">
      {/* Subtle ambient — no text, no logo, just atmosphere */}
      <div
        className="absolute w-[700px] h-[500px] opacity-[0.025] pointer-events-none"
        style={{
          background: "radial-gradient(ellipse, var(--accent), transparent 70%)",
          top: "40%",
          left: "50%",
          transform: "translate(-50%, -50%)",
        }}
      />
      <div
        className="absolute w-[400px] h-[400px] opacity-[0.015] pointer-events-none"
        style={{
          background: "radial-gradient(ellipse, rgba(99,102,241,0.8), transparent 70%)",
          bottom: "10%",
          left: "20%",
        }}
      />
    </div>
  )
}