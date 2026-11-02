import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import {
  api,
  clearAuthTokens,
  ensureCsrfToken,
  getStoredSessionBackup,
  setAuthTokens,
} from '../lib/api';
import type { AuthUser, UserRole } from '../lib/types';

interface RegisterPayload {
  fullName: string;
  email: string;
  password: string;
  phone?: string;
  role: 'USER' | 'PROFESSIONAL';
  title?: string;
  specialty?: string;
  categoryId?: number;
  experienceYears?: number;
  location?: string;
  consultationFee?: number;
  bio?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  register: (payload: RegisterPayload) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  getDashboardPath: (role?: UserRole) => string;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function getDashboardPathForRole(role?: UserRole): string {
  if (role === 'ADMIN') return '/dashboard/admin';
  if (role === 'PROFESSIONAL') return '/dashboard/professional';
  return '/dashboard/user';
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const bootstrapSession = useCallback(async () => {
    try {
      await ensureCsrfToken();
      const backup = getStoredSessionBackup();
      const res = await axios.post<{
        accessToken: string;
        csrfToken: string;
        sessionBackup?: string;
        user: AuthUser;
      }>(
        '/api/auth/refresh',
        {},
        {
          withCredentials: true,
          headers: backup ? { 'X-Session-Backup': backup } : {},
        }
      );

      setAuthTokens({
        accessToken: res.data.accessToken,
        csrfToken: res.data.csrfToken,
        sessionBackup: res.data.sessionBackup,
      });
      setUser(res.data.user);
    } catch {
      clearAuthTokens();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    bootstrapSession();
  }, [bootstrapSession]);

  const login = async (email: string, password: string): Promise<AuthUser> => {
    const res = await api.post<{
      accessToken: string;
      csrfToken: string;
      sessionBackup?: string;
      user: AuthUser;
    }>('/auth/login', { email, password });

    setAuthTokens({
      accessToken: res.data.accessToken,
      csrfToken: res.data.csrfToken,
      sessionBackup: res.data.sessionBackup,
    });
    setUser(res.data.user);
    return res.data.user;
  };

  const register = async (payload: RegisterPayload): Promise<AuthUser> => {
    const res = await api.post<{
      accessToken: string;
      csrfToken: string;
      sessionBackup?: string;
      user: AuthUser;
    }>('/auth/register', payload);

    setAuthTokens({
      accessToken: res.data.accessToken,
      csrfToken: res.data.csrfToken,
      sessionBackup: res.data.sessionBackup,
    });
    setUser(res.data.user);
    return res.data.user;
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout', {});
    } catch {
      // Ignore logout network error
    } finally {
      clearAuthTokens();
      setUser(null);
    }
  };

  const refreshProfile = async () => {
    const res = await api.get<{ user: AuthUser }>('/auth/me');
    setUser(res.data.user);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        logout,
        refreshProfile,
        getDashboardPath: (r) => getDashboardPathForRole(r ?? user?.role),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
