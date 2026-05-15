import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { User, TipoConta } from '@/types';
import { authService } from '@/services/auth';
import { supabase, supabaseConfigured } from '@/services/supabase';
import { doisFA } from '@/services/doisFA';

interface AuthContextData {
  user: User | null;
  loading: boolean;
  signed: boolean;
  login: (email: string, senha: string) => Promise<void>;
  loginDemo: (tipo: 'pf' | 'pj' | 'gov' | 'admin') => Promise<void>;
  loginSocial: (provider: 'google' | 'apple' | 'x') => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (data: Partial<User>) => Promise<void>;
  recuperarSenha: (email: string) => Promise<void>;
  atualizarSenha: (novaSenha: string) => Promise<void>;
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
  // Evita processar onAuthStateChange enquanto o login/logout manual já está rodando
  const _suppressAuthChange = useRef(false);

  useEffect(() => {
    loadStoredUser();

    // ── Listener global de sessão ─────────────────────────────────────
    // Captura SIGNED_IN após redirect OAuth (web) e SIGNED_OUT em qualquer caso.
    // No nativo, setSession() já atualiza o estado manualmente em loginSocial(),
    // então usamos suppressAuthChange para não sobrescrever o estado em dupla.
    if (!supabaseConfigured) return;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (_suppressAuthChange.current) return;

        if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user) {
          // Só atualiza se ainda não temos usuário (evita duplo update no nativo)
          if (user) return;
          try {
            const profile = await authService.getProfile(session.user.id);
            setUser({
              id:           session.user.id,
              email:        session.user.email ?? '',
              nome:         profile?.nome      ?? session.user.user_metadata?.full_name?.split(' ')[0] ?? '',
              sobrenome:    profile?.sobrenome ?? '',
              username:     profile?.username  ?? '',
              tipo_conta:   profile?.tipo_conta ?? 'pf',
              genero:       profile?.genero,
              avatar_url:   profile?.avatar_url ?? session.user.user_metadata?.avatar_url,
              bio:          profile?.bio,
              cnpj:         profile?.cnpj,
              verificado:   profile?.verificado ?? false,
              criado_em:    profile?.criado_em  ?? session.user.created_at,
              atualizado_em: profile?.atualizado_em ?? session.user.created_at,
            });
          } catch { /* se falhar, usuario fica null */ }
          setLoading(false);
        }

        if (event === 'SIGNED_OUT') {
          setUser(null);
          setLoading(false);
        }
      },
    );

    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadStoredUser() {
    try {
      // Passo 1: lê sessão do localStorage (síncrono/rápido) — libera a tela imediatamente
      const sessionUser = await authService.getSessionUser();
      if (sessionUser) {
        setUser(sessionUser);
        setLoading(false); // ← libera a tela AGORA, sem esperar o banco

        // Passo 2: busca perfil completo em segundo plano (atualiza avatar, tipo_conta, etc.)
        authService.getProfile(sessionUser.id)
          .then((profile) => {
            if (profile) {
              setUser((prev) => prev ? { ...prev, ...profile, id: prev.id, email: prev.email } : prev);
            }
          })
          .catch(() => { /* falha silenciosa — já temos dados básicos */ });
        return;
      }
    } catch {
      // no stored user
    } finally {
      setLoading(false);
    }
  }

  async function login(email: string, senha: string) {
    _suppressAuthChange.current = true;
    setLoading(true);
    try {
      const loggedUser = await authService.login(email, senha);
      setUser(loggedUser);
    } finally {
      setLoading(false);
      _suppressAuthChange.current = false;
    }
  }

  async function loginDemo(tipo: 'pf' | 'pj' | 'gov' | 'admin') {
    setLoading(true);
    try {
      const loggedUser = await authService.loginDemo(tipo);
      setUser(loggedUser);
    } finally {
      setLoading(false);
    }
  }

  async function loginSocial(provider: 'google' | 'apple' | 'x') {
    // No nativo, loginSocial() retorna o usuário diretamente (PKCE completo).
    // Na web, loginSocial() redireciona a página — onAuthStateChange captura o retorno.
    // Por isso, só suprimimos no nativo.
    _suppressAuthChange.current = true;
    setLoading(true);
    try {
      const loggedUser = await authService.loginSocial(provider);
      // Na web, o redirect acontece — setUser aqui nunca é chamado de facto.
      // No nativo, loggedUser é o usuário real.
      if (loggedUser?.id && !loggedUser.id.startsWith('demo-')) {
        setUser(loggedUser);
      }
    } finally {
      setLoading(false);
      _suppressAuthChange.current = false;
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
    doisFA.resetar();   // invalida sessão 2FA ao sair
    setUser(null);
  }

  async function updateUser(data: Partial<User>) {
    if (!user) return;
    const updated = await authService.updateUser(user.id, data);
    setUser(updated);
  }

  async function recuperarSenha(email: string) {
    await authService.recuperarSenha(email);
  }

  async function atualizarSenha(novaSenha: string) {
    await authService.atualizarSenha(novaSenha);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signed: !!user,
        login,
        loginDemo,
        loginSocial,
        register,
        logout,
        updateUser,
        recuperarSenha,
        atualizarSenha,
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
