'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface AuthContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (pin: string, expectedRole?: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

const ROLE_HOME: Record<string, string> = {
  admin: '/admin',
  waiter: '/',
  kitchen_staff: '/kitchen',
  cashier: '/',
};

const ROLE_LOGIN: Record<string, string> = {
  admin: '/admin/login',
  kitchen_staff: '/kitchen/login',
  waiter: '/',
  cashier: '/',
};

const PUBLIC_ROUTES = ['/admin/login', '/kitchen/login'];

const ROLE_RESTRICTED: Record<string, string[]> = {
  '/admin': ['admin'],
  '/kitchen': ['kitchen_staff'],
  '/': ['waiter', 'admin', 'cashier'],
};

const API_URL = 'http://localhost:4000';
const STORAGE_KEY = 'pos_auth_user';

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as AuthUser;
        if (parsed.id && parsed.role) setUser(parsed);
      }
    } catch { localStorage.removeItem(STORAGE_KEY); }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (isLoading) return;
    const isPublic = PUBLIC_ROUTES.includes(pathname);
    const isRoot = pathname === '/';
    if (!user && !isPublic && !isRoot) { router.replace('/'); return; }
    if (user) {
      if (isPublic) { router.replace(ROLE_HOME[user.role] || '/'); return; }
      if (isRoot) { return; }
      for (const [route, allowedRoles] of Object.entries(ROLE_RESTRICTED)) {
        if (pathname === route || (route !== '/' && pathname.startsWith(route))) {
          if (!allowedRoles.includes(user.role)) { router.replace(ROLE_HOME[user.role] || '/'); return; }
          break;
        }
      }
    }
  }, [user, isLoading, pathname, router]);

  const login = useCallback(async (pin: string, expectedRole?: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const body: any = { pin };
      if (expectedRole) body.expectedRole = expectedRole;
      const res = await fetch(`${API_URL}/api/auth/pin-login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!json.success) return { success: false, error: json.error || 'Invalid PIN' };
      const authUser: AuthUser = { id: json.data.id, name: json.data.name, email: json.data.email, role: json.data.role };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(authUser));
      setUser(authUser);
      router.replace(ROLE_HOME[authUser.role] || '/');
      return { success: true };
    } catch { return { success: false, error: 'Connection failed. Is the server running?' }; }
  }, [router]);

  const logout = useCallback(() => {
    const currentPath = window.location.pathname;
    localStorage.removeItem(STORAGE_KEY);
    // Determine target login page BEFORE state wipe using path detection
    let targetLogin = '/';
    if (currentPath.startsWith('/admin')) { targetLogin = '/admin/login'; }
    else if (currentPath.startsWith('/kitchen')) { targetLogin = '/kitchen/login'; }
    // Hard navigate to bypass React route guard interference
    window.location.href = targetLogin;
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}