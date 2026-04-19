// === FILE: frontend/src/pages/AuthPage.tsx ===

import { useAuth } from "@/hooks/use-auth-new";

export function AuthPage() {
  const { loginWithGoogle } = useAuth();

  // In production, this would use Google's OAuth library
  const handleLogin = async () => {
    // Placeholder — integrate with @react-oauth/google
    const token = prompt("Enter Google OAuth token:");
    if (token) {
      await loginWithGoogle(token);
    }
  };

  return (
    <div className="flex items-center justify-center h-full"
      style={{
        background: "var(--color-void)",
      }}
    >
      <div className="text-center max-w-sm">
        <p className="text-6xl mb-4">🧠</p>
        <h1 className="text-2xl font-bold mb-2" style={{ color: "var(--glass-text)" }}>
          Mnemos
        </h1>
        <p className="text-sm mb-6" style={{ color: "var(--glass-text-secondary)" }}>
          Your visual knowledge workspace
        </p>
        <button
          onClick={handleLogin}
          className="px-6 py-2.5 rounded-xl font-medium text-sm transition-all"
          style={{
            background: "var(--accent)",
            color: "white",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.opacity = "0.9";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.opacity = "1";
          }}
        >
          Sign in with Google
        </button>
      </div>
    </div>
  );
}
