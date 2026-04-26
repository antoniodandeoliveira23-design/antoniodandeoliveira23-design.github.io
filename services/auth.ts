import { supabase, supabaseConfigured } from './supabase';
import { User, TipoConta } from '@/types';
import type { RegisterData } from '@/contexts/AuthContext';
import { registrarAcao, registrarAcesso, trackLoginFalha } from './auditoria';
import { rateLimiter, validarSenha, storageSeguro, sanitizador } from './seguranca';

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
      storageSeguro.set('agoraDemoLoggedIn', 'true');
      return createDemoUser({ email });
    }

    // A04 — Rate limiting: bloqueia após 5 tentativas
    if (!rateLimiter.verificar('login', email)) {
      const segundos = rateLimiter.tempoRestante('login', email);
      throw new Error(`RATE_LIMIT:${segundos}`);
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: senha,
    });

    if (error) {
      // Rastreia falhas de login para detectar força bruta
      trackLoginFalha(email);
      await registrarAcesso('login_falha');
      await registrarAcao({
        acao: 'login_falha',
        categoria: 'auth',
        severidade: 'aviso',
        detalhes: { email_hash: email.substring(0, 3) + '***', motivo: error.message },
        resultado: 'falha',
      });
      throw new Error(error.message);
    }

    // Reset contador de falhas após sucesso
    rateLimiter.resetar('login', email);

    await registrarAcesso('login', data.user.id);
    await registrarAcao({
      acao: 'login',
      categoria: 'auth',
      severidade: 'info',
      resultado: 'sucesso',
    });

    const profile = await this.getProfile(data.user.id);
    return mapSupabaseUser(data.user, profile);
  },

  async loginSocial(provider: 'google' | 'apple' | 'x'): Promise<User> {
    if (!supabaseConfigured) {
      storageSeguro.set('agoraDemoLoggedIn', 'true');
      return createDemoUser();
    }

    const providerMap = { google: 'google', apple: 'apple', x: 'twitter' } as const;

    // A07 — OAuth com redirect de volta para o app
    const redirectTo = typeof window !== 'undefined'
      ? `${window.location.origin}/auth/callback`
      : undefined;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: providerMap[provider],
      options: {
        redirectTo,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });
    if (error) {
      await registrarAcao({
        acao: 'login_social_falha',
        categoria: 'auth',
        severidade: 'aviso',
        detalhes: { provider, motivo: error.message },
        resultado: 'falha',
      });
      throw new Error(error.message);
    }

    // OAuth redireciona — getUser() é chamado após retorno via callback
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Falha no login social');

    await registrarAcesso('login', user.id);
    await registrarAcao({
      acao: 'login_social',
      categoria: 'auth',
      severidade: 'info',
      detalhes: { provider },
      resultado: 'sucesso',
    });

    const profile = await this.getProfile(user.id);
    return mapSupabaseUser(user, profile);
  },

  // ─────────────────────────────────────────────
  // A07 — MFA: Verificação por telefone (OTP SMS)
  // Requer Twilio configurado no Supabase Dashboard
  // ─────────────────────────────────────────────

  async enviarOtpTelefone(telefone: string): Promise<void> {
    if (!supabaseConfigured) {
      console.log('[demo] OTP enviado para', telefone);
      return;
    }

    if (!rateLimiter.verificar('recuperar_senha', telefone)) {
      const s = rateLimiter.tempoRestante('recuperar_senha', telefone);
      throw new Error(`RATE_LIMIT:${s}`);
    }

    const { error } = await supabase.auth.signInWithOtp({
      phone: telefone,
    });

    if (error) {
      await registrarAcao({
        acao: 'otp_envio_falha',
        categoria: 'auth',
        severidade: 'aviso',
        detalhes: { motivo: error.message },
        resultado: 'falha',
      });
      throw new Error(error.message);
    }

    await registrarAcao({
      acao: 'otp_enviado',
      categoria: 'auth',
      severidade: 'info',
      detalhes: { telefone_hash: telefone.slice(-4).padStart(telefone.length, '*') },
      resultado: 'sucesso',
    });
  },

  async verificarOtpTelefone(telefone: string, codigo: string): Promise<User> {
    if (!supabaseConfigured) {
      storageSeguro.set('agoraDemoLoggedIn', 'true');
      return createDemoUser();
    }

    const { data, error } = await supabase.auth.verifyOtp({
      phone: telefone,
      token: codigo,
      type: 'sms',
    });

    if (error) {
      await registrarAcao({
        acao: 'otp_verificacao_falha',
        categoria: 'auth',
        severidade: 'aviso',
        detalhes: { motivo: error.message },
        resultado: 'falha',
      });
      throw new Error(error.message);
    }

    if (!data.user) throw new Error('Verificação falhou');

    await registrarAcesso('login', data.user.id);
    await registrarAcao({
      acao: 'login_otp_telefone',
      categoria: 'auth',
      severidade: 'info',
      resultado: 'sucesso',
    });

    const profile = await this.getProfile(data.user.id);
    return mapSupabaseUser(data.user, profile);
  },

  async vincularTelefone(telefone: string): Promise<void> {
    if (!supabaseConfigured) return;

    const { error } = await supabase.auth.updateUser({ phone: telefone });

    if (error) throw new Error(error.message);

    await registrarAcao({
      acao: 'telefone_vinculado',
      categoria: 'auth',
      severidade: 'info',
      resultado: 'sucesso',
    });
  },

  async register(registerData: RegisterData): Promise<User> {
    if (!supabaseConfigured) {
      storageSeguro.set('agoraDemoLoggedIn', 'true');
      return createDemoUser(registerData);
    }

    // A04 — Rate limiting no cadastro
    if (!rateLimiter.verificar('cadastro', registerData.email)) {
      const segundos = rateLimiter.tempoRestante('cadastro', registerData.email);
      throw new Error(`RATE_LIMIT:${segundos}`);
    }

    // A07 — Valida força da senha antes de enviar ao Supabase
    const resultadoSenha = validarSenha(registerData.senha);
    if (!resultadoSenha.valida) {
      throw new Error(`SENHA_FRACA:${resultadoSenha.erros.join('|')}`);
    }

    // A03 — Sanitiza dados de entrada
    const dadosSanitizados = sanitizador.objeto({
      nome: registerData.nome,
      sobrenome: registerData.sobrenome,
      username: registerData.username,
    });

    const { data, error } = await supabase.auth.signUp({
      email: registerData.email,
      password: registerData.senha,
    });

    if (error) {
      await registrarAcao({
        acao: 'cadastro_falha',
        categoria: 'auth',
        severidade: 'aviso',
        detalhes: { tipo_conta: registerData.tipo_conta, motivo: error.message },
        resultado: 'falha',
      });
      throw new Error(error.message);
    }
    if (!data.user) throw new Error('Erro ao criar conta');

    // Criar perfil na tabela profiles
    const profile = {
      id: data.user.id,
      nome: dadosSanitizados.nome,
      sobrenome: dadosSanitizados.sobrenome,
      username: dadosSanitizados.username,
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

    await registrarAcesso('cadastro', data.user.id);
    await registrarAcao({
      acao: 'cadastro',
      categoria: 'auth',
      severidade: 'info',
      detalhes: { tipo_conta: registerData.tipo_conta },
      resultado: 'sucesso',
    });

    return mapSupabaseUser(data.user, profile);
  },

  async logout(): Promise<void> {
    if (!supabaseConfigured) {
      storageSeguro.limparTudo();
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    await registrarAcesso('logout', user?.id);
    await registrarAcao({
      acao: 'logout',
      categoria: 'auth',
      severidade: 'info',
      resultado: 'sucesso',
    });
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
