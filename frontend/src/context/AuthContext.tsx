import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '../api/auth';
import { getToken, getStoredUser, storeAuth, clearAuth } from '../utils/authStorage';

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (user: User, token: string, remember?: boolean) => void;
  logout: () => void;
  isAdmin: boolean;
  isTeamleiter: boolean;
  isTeamleiterOrAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    // Beim Start aus dem jeweiligen Speicher laden
    const savedToken = getToken();
    const savedUser = getStoredUser();

    if (savedToken && savedUser) {
      try {
        setToken(savedToken);
        setUser(JSON.parse(savedUser));
      } catch {
        // Kaputter Eintrag - lieber abgemeldet als in einem halben Zustand
        clearAuth();
      }
    }
  }, []);

  const login = (user: User, token: string, remember = true) => {
    setUser(user);
    setToken(token);
    storeAuth(token, user, remember);
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    clearAuth();
  };

  const isAdmin = user?.role === 'admin';
  const isTeamleiter = user?.role === 'teamleiter';
  const isTeamleiterOrAdmin = user?.role === 'admin' || user?.role === 'teamleiter';

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isAdmin, isTeamleiter, isTeamleiterOrAdmin }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
