import { Link, useLocation } from "react-router-dom"

const NAV_ITEMS = [
  { path: "/", label: "📋 Notes", exact: true },
  { path: "/search", label: "🔍 Search" },
  { path: "/chat", label: "💬 Chat" },
]

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation()

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      {/* Top Nav */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/" className="text-xl font-bold tracking-tight">
            🧠 <span className="text-indigo-400">Mnemos</span>
          </Link>
          <nav className="flex gap-1">
            {NAV_ITEMS.map((item) => {
              const isActive = item.exact
                ? location.pathname === item.path
                : location.pathname.startsWith(item.path)
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-indigo-500/20 text-indigo-300"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                  }`}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
    </div>
  )
}
