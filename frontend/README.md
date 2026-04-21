# Mnemos Frontend

React app with an Excalidraw infinite canvas and a floating AI chat overlay.

## Stack

- React 19 + TypeScript 6
- Excalidraw 0.18 (column-locked, zoom-locked canvas)
- Zustand 5 (state management)
- Tailwind CSS v4
- Vite 8
- Lucide React (icons)
- React Markdown
- @chenglou/pretext (pixel-perfect text measurement)

## Getting Started

```bash
npm install
npm run dev       # starts dev server at http://localhost:5173
npm run build     # production build (tsc + vite)
npm run preview   # preview production build
npm run lint      # eslint

The dev server proxies /api and /health to http://localhost:8000 automatically.
Project Structure

text

src/
├── api/
│   ├── client.ts       → HTTP client, auth tokens, SSE subscriptions
│   └── types.ts        → All TypeScript interfaces
│
├── store/
│   ├── app.ts          → User, workspace, preferences, chat toggle
│   ├── chat.ts         → Messages, streaming, loading state
│   ├── canvas.ts       → Scene, version, sync state, reload trigger
│   └── index.ts        → Re-exports
│
├── hooks/
│   ├── useChat.ts      → Send message → API → update stores
│   ├── useCanvas.ts    → Scene load, sync, SSE, onChange handler
│   ├── useAuth.ts      → Init, Google login, logout
│   ├── useDraggable.ts → Pointer-based drag for chat overlay
│   └── useKeyboard.ts  → Cmd/Ctrl+K → focus chat
│
├── lib/
│   ├── constants.ts    → Commands, models, canvas dimensions
│   ├── utils.ts        → Response routing, formatting, debounce, cn()
│   ├── canvasLock.ts   → Prevents onChange↔sync feedback loops
│   ├── sanitizeScene.ts→ Fixes null/undefined before Excalidraw touches elements
│   └── textMeasure.ts  → Browser-accurate text measurement via pretext
│
├── components/
│   ├── App.tsx             → ErrorBoundary → AuthGate → Shell
│   ├── ErrorBoundary.tsx   → Catches React render errors
│   ├── AuthGate.tsx        → Google Sign-In gate (skipped if auth disabled)
│   ├── Shell.tsx           → Canvas + Overlay layout
│   │
│   ├── canvas/
│   │   ├── Canvas.tsx      → Excalidraw wrapper (zoom/scroll lock, gutters)
│   │   └── EmptyCanvas.tsx → Ambient background when no workspace
│   │
│   ├── overlay/
│   │   ├── Overlay.tsx     → Draggable chat panel + home screen
│   │   ├── ChatBox.tsx     → Message list + input + empty states
│   │   ├── ChatInput.tsx   → Textarea with animated placeholder + slash detection
│   │   ├── ChatMessage.tsx → Bubble renderer + inline cards
│   │   ├── CommandPalette.tsx → Slash command picker with keyboard nav
│   │   └── TypingIndicator.tsx → Bouncing dots
│   │
│   ├── cards/
│   │   ├── BoardsCard.tsx  → Board list with open action
│   │   ├── SearchCard.tsx  → Search results with similarity %
│   │   └── SettingsCard.tsx→ Theme, models, toggles, threshold slider
│   │
│   └── shared/
│       ├── Icon.tsx        → Lucide icon wrapper with name mapping
│       ├── Logo.tsx        → Animated SVG constellation logo
│       ├── Markdown.tsx    → Styled ReactMarkdown for chat bubbles
│       └── EmptyState.tsx  → Icon + message + hint component
│
├── main.tsx        → App entry point
└── index.css       → Tailwind config, glass utilities, animations, Excalidraw overrides

Key Concepts
Canvas

    Fixed-width column (800px) centered on screen with translucent gutters
    Zoom is locked to 1x, horizontal scroll is locked — only vertical scroll allowed
    Three-layer zoom prevention: DOM event blocking → onChange correction → periodic enforcement
    canvasLock prevents sync feedback loops during programmatic updateScene() calls
    sanitizeScene patches null/undefined values that crash Excalidraw 0.18

Chat Overlay

    Floating draggable panel when on a workspace, full-screen centered when on home
    Context-aware: workspace hints change based on active board
    Messages can carry inline cards (boards list, search results, settings panel)
    SSE streaming shows live text being written to canvas

Sync Flow

text

User edits → onChange → debounce (2.5s) → POST /sync → save positions
Server changes → SSE event → loadScene(push=true) → updateScene

Slash Commands

Type / to open the command palette. Commands: /boards, /diagram, /compose, /organize, /dark, /light, /search, /settings, /home.
Environment Variables
Variable	Default	Description
VITE_API_URL	(empty — uses proxy)	Backend API base URL
Styling

    Glass morphism theme with CSS custom properties
    Dark-first design with light mode support
    Custom utility classes: .glass, .glass-card, .glass-solid, .glass-pill
    Animations: slide-up, scale-in, fade-in, float, glow-pulse, shimmer
    Staggered children animation via .stagger-children
