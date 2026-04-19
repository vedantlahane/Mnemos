export function TypingIndicator() {
  return (
    <div className="flex justify-start animate-slide-up">
      <div className="glass rounded-[20px] rounded-bl-lg px-5 py-3 flex items-center gap-2">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-[5px] h-[5px] rounded-full bg-[var(--accent-light)]/60"
            style={{
              animation: `bounce 1.2s ease-in-out ${i * 0.15}s infinite`,
            }}
          />
        ))}
        <style>{`
          @keyframes bounce {
            0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
            30% { transform: translateY(-6px); opacity: 1; }
          }
        `}</style>
      </div>
    </div>
  )
}