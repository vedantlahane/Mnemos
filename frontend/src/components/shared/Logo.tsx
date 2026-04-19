interface Props {
  size?: number
  className?: string
  animated?: boolean
}

export function Logo({ size = 48, className = "", animated = true }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Outer glow ring */}
      <circle
        cx="32" cy="32" r="28"
        stroke="url(#ring-grad)"
        strokeWidth="1"
        opacity="0.3"
        className={animated ? "animate-[spin_20s_linear_infinite]" : ""}
        strokeDasharray="4 6"
      />

      {/* Core nodes — constellation pattern */}
      {/* Center */}
      <circle cx="32" cy="32" r="4" fill="url(#core-grad)">
        {animated && (
          <animate attributeName="r" values="4;4.8;4" dur="3s" repeatCount="indefinite" />
        )}
      </circle>

      {/* Orbital nodes */}
      <circle cx="18" cy="20" r="2.5" fill="url(#node-grad)" opacity="0.9" />
      <circle cx="46" cy="20" r="2" fill="url(#node-grad)" opacity="0.7" />
      <circle cx="14" cy="38" r="2" fill="url(#node-grad)" opacity="0.6" />
      <circle cx="46" cy="42" r="2.5" fill="url(#node-grad)" opacity="0.8" />
      <circle cx="32" cy="50" r="2" fill="url(#node-grad)" opacity="0.7" />
      <circle cx="22" cy="46" r="1.5" fill="url(#node-grad)" opacity="0.5" />
      <circle cx="50" cy="30" r="1.5" fill="url(#node-grad)" opacity="0.5" />

      {/* Connections — neural links */}
      <g stroke="url(#line-grad)" strokeWidth="0.8" opacity="0.4">
        <line x1="32" y1="32" x2="18" y2="20" />
        <line x1="32" y1="32" x2="46" y2="20" />
        <line x1="32" y1="32" x2="14" y2="38" />
        <line x1="32" y1="32" x2="46" y2="42" />
        <line x1="32" y1="32" x2="32" y2="50" />
        <line x1="18" y1="20" x2="46" y2="20" />
        <line x1="14" y1="38" x2="22" y2="46" />
        <line x1="46" y1="42" x2="50" y2="30" />
        <line x1="32" y1="50" x2="22" y2="46" />
        <line x1="46" y1="20" x2="50" y2="30" />
      </g>

      {/* Traveling pulse along connections */}
      {animated && (
        <>
          <circle r="1" fill="var(--accent-light)" opacity="0.6">
            <animateMotion dur="4s" repeatCount="indefinite" path="M32,32 L18,20 L46,20 L32,32" />
          </circle>
          <circle r="0.8" fill="var(--accent-light)" opacity="0.4">
            <animateMotion dur="5s" repeatCount="indefinite" path="M32,32 L46,42 L50,30 L46,20" />
          </circle>
        </>
      )}

      {/* Gradients */}
      <defs>
        <radialGradient id="core-grad" cx="50%" cy="40%">
          <stop offset="0%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#7c3aed" />
        </radialGradient>
        <radialGradient id="node-grad" cx="50%" cy="40%">
          <stop offset="0%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#6d28d9" />
        </radialGradient>
        <linearGradient id="line-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#7c3aed" />
          <stop offset="100%" stopColor="#a78bfa" />
        </linearGradient>
        <linearGradient id="ring-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.6" />
          <stop offset="50%" stopColor="#a78bfa" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#7c3aed" stopOpacity="0.6" />
        </linearGradient>
      </defs>
    </svg>
  )
}