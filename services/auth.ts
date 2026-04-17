import { supabase, supabaseConfigured } from './supabase';
import { User, TipoConta } from '@/types';
import type { RegisterData } from '@/contexts/AuthContext';

// Perfis demo para testar diferentes tipos de conta
const DEMO_PROFILES: Record<string, Partial<User>> = {
  pf: {
    id: 'demo-user-pf',
    email: 'maria@agora.app',
    nome: 'Maria',
    sobrenome: 'Silva',
    username: 'mariasilva',
    tipo_conta: 'pf',
    genero: 'feminino',
    verificado: false,
  },
  pj: {
    id: 'demo-user-pj',
    email: 'empresa@agora.app',
    nome: 'João',
    sobrenome: 'Eventos LTDA',
    username: 'joaoeventos',
    tipo_conta: 'pj',
    cnpj: '12345678000190',
    verificado: true,
  },
  gov: {
    id: 'demo-user-gov',
    email: 'prefeitura@vilhena.ro.gov.br',
    nome: 'Prefeitura',
    sobrenome: 'de Vilhena',
    username: 'prefvilhena',
    tipo_conta: 'gov',
    verificado: true,
  },
  admin: {
    id: 'demo-user-admin',
    email: 'admin@agora.app',
    nome: 'Admin',
    sobrenome: 'AGORA',
    username: 'admin',
    tipo_conta: 'admin',
    verificado: true,
  },
};

// Armazena o tipo de conta selecionado no demo
let _demoTipoConta: TipoConta = (typeof window !== 'undefined' && sessionStorage.getItem('agoraDemoTipo') as TipoConta) || 'pf';

export function setDemoTipoConta(tipo: TipoConta) {
  _demoTipoConta = tipo;
  if (typeof window !== 'undefined') sessionStorage.setItem('agoraDemoTipo', tipo);
}

export function getDemoTipoConta(): TipoConta {
  return _demoTipoConta;
}

// Demo user for offline mode (no Supabase configured)
function createDemoUser(overrides?: Partial<RegisterData>): User {
  const profile = DEMO_PROFILES[overrides?.tipo_conta || _demoTipoConta] || DEMO_PROFILES.pf;
  return {
    id: profile.id || 'demo-user-001',
    email: overrides?.email || profile.email || 'demo@agora.app',
    nome: overrides?.nome || profile.nome || 'Usuário',
    sobrenome: overrides?.sobrenome || profile.sobrenome || 'Demo',
    username: overrides?.username || profile.username || 'demo',
    tipo_conta: overrides?.tipo_conta || profile.tipo_conta || 'pf',
    genero: (overrides?.genero as any) || profile.genero || undefined,
    avatar_url: undefined,
    bio: undefined,
    cnpj: overrides?.cnpj || profile.cnpj,
    verificado: profile.verificado || false,
    criado_em: new Date().toISOString(),
    atualizado_em: new Date().toISOString(),
  };
}

function mapSupabaseUser(supaUser: any, profile: any): User {
  return {
    id: supaUser.id,
    email: supaUser.email || '',
    nome: profile?.nome || '',
    sobrenome: profile?.sobrenome || '',
    username: profile?.username || '',
    tipo_conta: profile?.tipo_conta || 'pf',
    genero: profile?.genero,
    avatar_url: profile?.avatar_url,
    bio: profile?.bio,
    cnpj: profile?.cnpj,
    verificado: profile?.verificado || false,
    criado_em: profile?.criado_em || supaUser.created_at,
    atualizado_em: profile?.atualizado_em || supaUser.created_at,
  };
}

export const authService = {
  async login(email: string, senha: string): Promise<User> {
    if (!supabaseConfigured) {
      if (typeof window !== 'undefined') sessionStorage.setItem('agoraDemoLoggedIn', 'true');
      return createDemoUser({ email });
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: senha,
    });
    if (error) throw new Error(error.message);

    const profile = await this.getProfile(data.user.id);
    return mapSupabaseUser(data.user, profile);
  },

  async loginSocial(provider: 'google' | 'apple' | 'x'): Promise<User> {
    if (!supabaseConfigured) {
      if (typeof window !== 'undefined') sessionStorage.setItem('agoraDemoLoggedIn', 'true');
      return createDemoUser();
    }

    const providerMap = { google: 'google', apple: 'apple', x: 'twitter' } as const;
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: providerMap[provider],
    });
    if (error) throw new Error(error.message);

    // OAuth redirects, so we get user after redirect
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Falha no login social');

    const profile = await this.getProfile(user.id);
    return mapSupabaseUser(user, profile);
  },

  async register(registerData: RegisterData): Promise<User> {
    if (!supabaseConfigured) {
      if (typeof window !== 'undefined') sessionStorage.setItem('agoraDemoLoggedIn', 'true');
      return createDemoUser(registerData);
    }

    const { data, error } = await supabase.auth.signUp({
      email: registerData.email,
      password: registerData.senha,
    });
    if (error) throw new Error(error.message);
    if (!data.user) throw new Error('Erro ao criar conta');

    // Criar perfil na tabela profiles
    const profile = {
      id: data.user.id,
      nome: registerData.nome,
      sobrenome: registerData.sobrenome,
      username: registerData.username,
      tipo_conta: registerData.tipo_conta,
      cnpj: registerData.cnpj || null,
      genero: registerData.genero || null,
      verificado: false,
      criado_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString(),
    };

    const { error: profileError } = await supabase
      .from('profiles')
      .insert(profile);
    if (profileError) throw new Error(profileError.message);

    return mapSupabaseUser(data.user, profile);
  },

  async logout(): Promise<void> {
    if (!supabaseConfigured) {
      if (typeof window !== 'undefined') sessionStorage.removeItem('agoraDemoLoggedIn');
      return;
    }
    await supabase.auth.signOut();
  },

  async getStoredUser(): Promise<User | null> {
    if (!supabaseConfigured) {
      // Em demo, só retorna usuário se já fez login na sessão
      if (typeof window !== 'undefined' && sessionStorage.getItem('agoraDemoLoggedIn')) {
        return createDemoUser();
      }
      return null;
    }
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return null;

    const profile = await this.getProfile(session.user.id);
    return mapSupabaseUser(session.user, profile);
  },

  async getProfile(userId: string) {
    if (!supabaseConfigured) return null;
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    return data;
  },

  async updateUser(userId: string, updates: Partial<User>): Promise<User> {
    if (!supabaseConfigured) return { ...createDemoUser(), ...updates } as User;
    const { data, error } = await supabase
      .from('profiles')
      .update({ ...updates, atualizado_em: new Date().toISOString() })
      .eq('id', userId)
      .select()
      .single();
    if (error) throw new Error(error.message);

    const { data: { user } } = await supabase.auth.getUser();
    return mapSupabaseUser(user, data);
  },
};
