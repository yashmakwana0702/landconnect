import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { api, setAuthToken } from './api';
import type { Me, Role, TokenOut } from './types';

const TOKEN_KEY = 'landconnect.token';

interface RegisterInput {
  email: string;
  password: string;
  display_name: string;
  role: Role;
  phone?: string;
}

interface AuthState {
  ready: boolean;
  token: string | null;
  user: Me | null;
  signIn: (email: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  signOut: () => Promise<void>;
  setUser: (user: Me) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<Me | null>(null);

  const applySession = useCallback(async (out: TokenOut) => {
    setAuthToken(out.access_token);
    await SecureStore.setItemAsync(TOKEN_KEY, out.access_token);
    setToken(out.access_token);
    setUser(out.user);
  }, []);

  const signOut = useCallback(async () => {
    setAuthToken(null);
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    (async () => {
      const saved = await SecureStore.getItemAsync(TOKEN_KEY);
      if (saved) {
        setAuthToken(saved);
        try {
          setUser(await api.get<Me>('/me'));
          setToken(saved);
        } catch {
          await signOut();
        }
      }
      setReady(true);
    })();
  }, [signOut]);

  const value = useMemo<AuthState>(
    () => ({
      ready,
      token,
      user,
      signIn: async (email, password) => applySession(await api.post<TokenOut>('/auth/login', { email, password })),
      register: async (input) => applySession(await api.post<TokenOut>('/auth/register', input)),
      signOut,
      setUser,
    }),
    [ready, token, user, applySession, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** The signed-in user; only call from screens behind the auth guard. */
export function useMe(): Me {
  const { user } = useAuth();
  if (!user) throw new Error('Not signed in');
  return user;
}

export const canManageListings = (role: Role): boolean => role === 'seller' || role === 'broker';
