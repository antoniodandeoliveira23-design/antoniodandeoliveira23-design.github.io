import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, TipoConta } from '@/types';
import { authService } from '@/services/auth';

interface AuthContextData {
  user: User | null;
  loading: boolean;
  signed: boolean;
  login: (email: string, senha: string) => Promise<void>;
  loginSocial: (provider: 'google' | 'apple' | 'x') => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (data: Partial<User>) => Promise<void>;
}

export interface RegisterData {
  nome: string;
  sobrenome: string;
  username: string;
  email: string;
  senha: string;
  tipo_conta: TipoConta;
  cnpj?: string;
  genero?: string;
}

const AuthContext = createContext<AuthContextData>({} as AuthContextData);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStoredUser();
  }, []);

  async function loadStoredUser() {
    try {
      const storedUser = await authService.getStoredUser();
      if (storedUser) {
        setUser(storedUser);
      }
    } catch {
      // no stored user
    } finally {
      setLoading(false);
    }
  }

  async function login(email: string, senha: string) {
    setLoading(true);
    try {
      const loggedUser = await authService.login(email, senha);
      setUser(loggedUser);
    } finally {
      setLoading(false);
    }
  }

  async function loginSocial(provider: 'google' | 'apple' | 'x') {
    setLoading(true);
    try {
      const loggedUser = await authService.loginSocial(provider);
      setUser(loggedUser);
    } finally {
      setLoading(false);
    }
  }

  async function register(data: RegisterData) {
    setLoading(true);
    try {
      const newUser = await authService.register(data);
      setUser(newUser);
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await authService.logout();
    setUser(null);
  }

  async function updateUser(data: Partial<User>) {
    if (!user) return;
    const updated = await authService.updateUser(user.id, data);
    setUser(updated);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signed: !!user,
        login,
        loginSocial,
        register,
        logout,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
