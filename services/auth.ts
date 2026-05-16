import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { supabase, supabaseConfigured } from './supabase';
import { User, TipoConta } from '@/types';
import type { RegisterData } from '@/contexts/AuthContext';
import { registrarAcao, registrarAcesso, trackLoginFalha } from './auditoria';
import { rateLimiter, validarSenha, storageSeguro, sanitizador } from './seguranca';
import { emailService } from './email';

// Aquece o WebBrowser no iOS para evitar delay na primeira abertura
WebBrowser.maybeCompleteAuthSession();

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

// ─────────────────────────────────────────────────────────────────
// Helpers internos (não exportados)
// ─────────────────────────────────────────────────────────────────

/** Audit log + boas-vindas para 1º login social */
async function _finalizarLoginSocial(
  user: { id: string; email?: string; created_at?: string },
  provider: string,
): Promise<void> {
  try {
    await registrarAcesso('login', user.id);
    await registrarAcao({
      acao: 'login_social',
      categoria: 'auth',
      severidade: 'info',
      detalhes: { provider },
      resultado: 'sucesso',
    });

    // Envia boas-vindas apenas para novos usuários (conta criada há < 30s)
    const criado = user.created_at ? new Date(user.created_at).getTime() : 0;
    const ehNovo = Date.now() - criado < 30_000;
    if (ehNovo && user.email) {
      emailService.boasVindas({ para: user.email, nome: '' }); // nome preenchido pelo trigger
    }
  } catch { /* audit nunca bloqueia login */ }
}

export const authService = {
  /**
   * Login demo — sempre funciona, mesmo com Supabase configurado.
   * Usado pelos cards de acesso rápido na tela de login.
   */
  async loginDemo(tipo: TipoConta): Promise<User> {
    setDemoTipoConta(tipo);
    storageSeguro.set('agoraDemoLoggedIn', 'true');
    sessionStorage.setItem('agoraDemoTipo', tipo);
    return createDemoUser({ tipo_conta: tipo });
  },

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
    const supabaseProvider = providerMap[provider];

    // ── WEB: redirect flow padrão ─────────────────────────────────────
    if (Platform.OS === 'web') {
      const redirectTo = typeof window !== 'undefined'
        ? `${window.location.origin}/auth/callback`
        : 'https://agora-vilhena.vercel.app/auth/callback';

      const { error } = await supabase.auth.signInWithOAuth({
        provider: supabaseProvider,
        options: {
          redirectTo,
          queryParams: {
            access_type: 'offline',
            prompt:       'consent',
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

      // Web redireciona a página inteira — onAuthStateChange em AuthContext
      // captura a sessão após o retorno. Nunca chegamos aqui na prática.
      return createDemoUser();
    }

    // ── NATIVO (iOS / Android): PKCE via expo-web-browser ────────────
    // Usa o scheme `agora://` registrado no app.json para o deep link de retorno
    const redirectUri = Linking.createURL('/auth/callback');

    // 1. Obtém a URL de autorização do Supabase sem abrir o browser
    const { data: oauthData, error: urlError } = await supabase.auth.signInWithOAuth({
      provider: supabaseProvider,
      options: {
        redirectTo:          redirectUri,
        skipBrowserRedirect: true,   // não abre browser — fazemos isso manualmente
        queryParams: {
          access_type: 'offline',
          ...(provider === 'google' ? { prompt: 'consent' } : {}),
        },
      },
    });

    if (urlError || !oauthData?.url) {
      await registrarAcao({
        acao: 'login_social_falha',
        categoria: 'auth',
        severidade: 'aviso',
        detalhes: { provider, motivo: urlError?.message ?? 'URL vazia' },
        resultado: 'falha',
      });
      throw new Error(urlError?.message ?? 'Não foi possível iniciar o login social.');
    }

    // 2. Abre o browser da plataforma com a URL do provider
    const result = await WebBrowser.openAuthSessionAsync(oauthData.url, redirectUri, {
      showInRecents:       false,
      preferEphemeralSession: provider !== 'apple', // Apple SSO usa sessão persistente
    });

    // Usuário cancelou o login
    if (result.type === 'cancel' || result.type === 'dismiss') {
      throw new Error('LOGIN_CANCELADO');
    }

    if (result.type !== 'success' || !result.url) {
      throw new Error('Autenticação falhou. Tente novamente.');
    }

    // 3. Extrai tokens do URL de retorno (hash ou query params)
    const returnUrl  = result.url;
    const hashPart   = returnUrl.includes('#') ? returnUrl.split('#')[1] : '';
    const queryPart  = returnUrl.includes('?') ? returnUrl.split('?')[1].split('#')[0] : '';
    const params     = new URLSearchParams(hashPart || queryPart);

    const accessToken  = params.get('access_token');
    const refreshToken = params.get('refresh_token');

    if (!accessToken) {
      // PKCE: pode ter retornado um `code` — tentar trocar
      const code = params.get('code');
      if (code) {
        const { data: sessionData, error: exchangeError } =
          await supabase.auth.exchangeCodeForSession(code);

        if (exchangeError || !sessionData.session) {
          throw new Error(exchangeError?.message ?? 'Troca de código falhou.');
        }

        await _finalizarLoginSocial(sessionData.session.user, provider);
        const profile = await this.getProfile(sessionData.session.user.id);
        return mapSupabaseUser(sessionData.session.user, profile);
      }

      throw new Error('Token de acesso não encontrado no retorno do provedor.');
    }

    // 4. Define a sessão no cliente Supabase
    const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
      access_token:  accessToken,
      refresh_token: refreshToken ?? '',
    });

    if (sessionError || !sessionData.session) {
      throw new Error(sessionError?.message ?? 'Falha ao estabelecer sessão.');
    }

    await _finalizarLoginSocial(sessionData.session.user, provider);
    const profile = await this.getProfile(sessionData.session.user.id);
    return mapSupabaseUser(sessionData.session.user, profile);
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
      options: {
        data: {
          nome:       dadosSanitizados.nome,
          sobrenome:  dadosSanitizados.sobrenome,
          username:   dadosSanitizados.username,
          tipo_conta: registerData.tipo_conta,
          cnpj:       registerData.cnpj || null,
          genero:     registerData.genero || null,
        },
      },
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

    // O trigger on_auth_user_created (004_functions.sql) cria o profile
    // automaticamente a partir de raw_user_meta_data. Aguarda até 1s para
    // garantir que o trigger tenha executado antes de ler o perfil.
    await new Promise((resolve) => setTimeout(resolve, 500));

    const profile = await this.getProfile(data.user.id) ?? {
      id:           data.user.id,
      nome:         dadosSanitizados.nome,
      sobrenome:    dadosSanitizados.sobrenome,
      username:     dadosSanitizados.username,
      tipo_conta:   registerData.tipo_conta,
      cnpj:         registerData.cnpj || null,
      genero:       registerData.genero || null,
      verificado:   false,
      criado_em:    new Date().toISOString(),
      atualizado_em: new Date().toISOString(),
    };

    await registrarAcesso('cadastro', data.user.id);
    await registrarAcao({
      acao: 'cadastro',
      categoria: 'auth',
      severidade: 'info',
      detalhes: { tipo_conta: registerData.tipo_conta },
      resultado: 'sucesso',
    });

    // ── Email de boas-vindas (fire-and-forget) ──────────────
    emailService.boasVindas({
      para: registerData.email,
      nome: dadosSanitizados.nome,
    });

    return mapSupabaseUser(data.user, profile as any);
  },

  /**
   * Envia email de redefinição de senha via Supabase Auth.
   * O Supabase usa o template supabase/auth/reset-password.html
   * e redireciona para /auth/callback?type=recovery após o clique.
   */
  async recuperarSenha(email: string): Promise<void> {
    if (!supabaseConfigured) {
      console.log('[demo] Email de recuperação enviado para', email);
      return;
    }

    if (!rateLimiter.verificar('recuperar_senha', email)) {
      const segundos = rateLimiter.tempoRestante('recuperar_senha', email);
      throw new Error(`RATE_LIMIT:${segundos}`);
    }

    const redirectTo = typeof window !== 'undefined'
      ? `${window.location.origin}/auth/callback`
      : 'https://agora-vilhena.vercel.app/auth/callback';

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });

    if (error) {
      await registrarAcao({
        acao: 'recuperacao_senha_falha',
        categoria: 'auth',
        severidade: 'aviso',
        detalhes: { email_hash: email.substring(0, 3) + '***', motivo: error.message },
        resultado: 'falha',
      });
      throw new Error(error.message);
    }

    await registrarAcao({
      acao: 'recuperacao_senha_email_enviado',
      categoria: 'auth',
      severidade: 'info',
      detalhes: { email_hash: email.substring(0, 3) + '***' },
      resultado: 'sucesso',
    });
  },

  /**
   * Atualiza senha após o usuário clicar no link do email de recuperação.
   * Só funciona quando há sessão do tipo 'recovery' ativa.
   * Após atualizar, envia email de confirmação (senha_redefinida).
   */
  async atualizarSenha(novaSenha: string): Promise<void> {
    if (!supabaseConfigured) {
      console.log('[demo] Senha atualizada com sucesso');
      return;
    }

    const resultadoSenha = validarSenha(novaSenha);
    if (!resultadoSenha.valida) {
      throw new Error(`SENHA_FRACA:${resultadoSenha.erros.join('|')}`);
    }

    const { data, error } = await supabase.auth.updateUser({ password: novaSenha });

    if (error) {
      await registrarAcao({
        acao: 'atualizacao_senha_falha',
        categoria: 'auth',
        severidade: 'aviso',
        detalhes: { motivo: error.message },
        resultado: 'falha',
      });
      throw new Error(error.message);
    }

    await registrarAcao({
      acao: 'senha_atualizada',
      categoria: 'auth',
      severidade: 'info',
      resultado: 'sucesso',
    });

    // Confirmação por email (fire-and-forget)
    if (data.user?.email) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('nome')
        .eq('id', data.user.id)
        .single();

      emailService.senhaRedefinida({
        para: data.user.email,
        nome: profile?.nome ?? 'Usuário',
      });
    }
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

  /**
   * Versão rápida do getStoredUser — retorna o usuário só com dados da sessão
   * local (localStorage), sem fazer requisição ao banco.
   * Usado no carregamento inicial para liberar a tela sem esperar a rede.
   */
  async getSessionUser(): Promise<User | null> {
    if (!supabaseConfigured) {
      if (typeof window !== 'undefined' && sessionStorage.getItem('agoraDemoLoggedIn')) {
        return createDemoUser();
      }
      return null;
    }
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return null;
      // Monta usuário apenas com metadados da sessão (sem chamada ao banco)
      return mapSupabaseUser(session.user, null);
    } catch {
      return null;
    }
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
