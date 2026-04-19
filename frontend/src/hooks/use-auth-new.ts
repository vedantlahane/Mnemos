// === FILE: frontend/src/hooks/use-auth-new.ts ===

import { useEffect, useCallback } from "react";
import { api } from "@/lib/client";
import { useAppStore } from "@/store";

export function useAuth() {
  const { setUser, setAuthEnabled } = useAppStore();

  const init = useCallback(async () => {
    try {
      const state = await api.auth.me();
      setAuthEnabled(state.auth_enabled);
      setUser(state.user);
    } catch {
      setUser(null);
    }
  }, [setUser, setAuthEnabled]);

  useEffect(() => {
    init();
  }, [init]);

  const loginWithGoogle = useCallback(
    async (token: string) => {
      const result = await api.auth.loginWithGoogle(token);
      setUser(result.user);
    },
    [setUser],
  );

  const logout = useCallback(() => {
    api.auth.logout();
    setUser(null);
  }, [setUser]);

  return { init, loginWithGoogle, logout };
}
