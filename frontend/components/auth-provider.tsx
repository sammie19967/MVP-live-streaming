"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  getCurrentUser,
  loginUser,
  logoutUser,
  registerUser,
  type AuthResponse,
  type LoginPayload,
  type RegisterPayload,
  type User,
} from "@/lib/api";

type AuthContextValue = {
  isLoading: boolean;
  user: User | null;
  token: string | null;
  login: (payload: LoginPayload) => Promise<AuthResponse>;
  register: (payload: RegisterPayload) => Promise<AuthResponse>;
  logout: () => Promise<void>;
  refreshUser: (tokenOverride?: string | null) => Promise<User | null>;
};

const TOKEN_KEY = "live-mvp-token";

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const persistToken = useCallback((nextToken: string | null) => {
    setToken(nextToken);
    if (typeof window === "undefined") {
      return;
    }
    if (nextToken) {
      window.localStorage.setItem(TOKEN_KEY, nextToken);
      return;
    }
    window.localStorage.removeItem(TOKEN_KEY);
  }, []);

  const refreshUser = useCallback(
    async (tokenOverride?: string | null) => {
      const activeToken = tokenOverride ?? token;
      if (!activeToken) {
        setUser(null);
        return null;
      }

      try {
        const currentUser = await getCurrentUser(activeToken);
        setUser(currentUser);
        return currentUser;
      } catch {
        persistToken(null);
        setUser(null);
        return null;
      }
    },
    [persistToken, token],
  );

  useEffect(() => {
    async function hydrateUser() {
      const storedToken = window.localStorage.getItem(TOKEN_KEY);
      if (!storedToken) {
        setIsLoading(false);
        return;
      }

      setToken(storedToken);
      await refreshUser(storedToken);
      setIsLoading(false);
    }

    void hydrateUser();
  }, [refreshUser]);

  const handleAuthResponse = useCallback(
    async (response: AuthResponse) => {
      persistToken(response.token);
      setUser(response.user);
      return response;
    },
    [persistToken],
  );

  const login = useCallback(
    async (payload: LoginPayload) => handleAuthResponse(await loginUser(payload)),
    [handleAuthResponse],
  );

  const register = useCallback(
    async (payload: RegisterPayload) =>
      handleAuthResponse(await registerUser(payload)),
    [handleAuthResponse],
  );

  const logout = useCallback(async () => {
    if (token) {
      try {
        await logoutUser(token);
      } catch {
        // Clear local state even if the backend token was already invalid.
      }
    }
    persistToken(null);
    setUser(null);
  }, [persistToken, token]);

  const value = useMemo(
    () => ({
      isLoading,
      user,
      token,
      login,
      register,
      logout,
      refreshUser,
    }),
    [isLoading, user, token, login, register, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
