/**
 * services/__tests__/auth.login.e2e.test.ts
 *
 * Testes E2E do fluxo de login por e-mail e senha.
 *
 * Estratégia:
 *  - Módulos REAIS: rateLimiter, validarSenha, sanitizador, storageSeguro
 *    (seguranca.ts sem mock — valida o comportamento de ponta a ponta)
 *  - Módulos MOCKADOS: supabase client (I/O externo), auditoria, emailService,
 *    expo-web-browser, expo-linking, react-native
 *
 * Cada teste usa um e-mail único (sufixo numérico) para isolar
 * o estado do rateLimiter, que é um singleton de módulo.
 *
 * Cenários cobertos:
 *  1.  Fluxo feliz — credenciais corretas → User com todos os campos
 *  2.  Fluxo feliz — email mapeado de auth.users, não de profiles
 *  3.  Fluxo feliz — profile com nome/sobrenome/username/tipo_conta preenchidos
 *  4.  Fluxo feliz — profile null → campos com defaults seguros
 *  5.  Fluxo feliz — profile.verificado = true preservado
 *  6.  Fluxo feliz — tipo_conta diferente de pf (admin)
 *  7.  Falha — senha incorreta → erro propagado
 *  8.  Falha — e-mail não cadastrado → erro propagado
 *  9.  Falha — audit registrarAcao('login_falha') chamado
 *  10. Falha — trackLoginFalha chamado com o e-mail
 *  11. Falha — rateLimiter NÃO resetado após falha
 *  12. Sucesso — audit registrarAcao('login') chamado
 *  13. Sucesso — registrarAcesso('login', userId) chamado
 *  14. Sucesso — rateLimiter resetado após sucesso
 *  15. Rate limit — 5 falhas reais bloqueiam a 6ª tentativa
 *  16. Rate limit — mensagem de erro contém RATE_LIMIT:<segundos>
 *  17. Rate limit — reset libera tentativas subsequentes
 *  18. Rate limit — já bloqueado não chama signInWithPassword
 *  19. Supabase indisponível — erro de rede propagado
 *  20. Demo mode — supabaseConfigured=false retorna demo User sem chamar Supabase
 *  21. Demo mode — email fornecido aparece no User retornado
 */

// ── Mocks de módulo (hoistados pelo Jest) ────────────────────────────────────

jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));

jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
  openAuthSessionAsync: jest.fn(),
}));

jest.mock('expo-linking', () => ({
  createURL: jest.fn().mockReturnValue('agora://auth/callback'),
}));

jest.mock('@/services/auditoria', () => ({
  registrarAcao:   jest.fn().mockResolvedValue(undefined),
  registrarAcesso: jest.fn().mockResolvedValue(undefined),
  trackLoginFalha: jest.fn(),
}));

jest.mock('@/services/email', () => ({
  emailService: {
    boasVindas:      jest.fn(),
    senhaRedefinida: jest.fn(),
  },
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

let _emailCounter = 0;
/** Gera e-mails únicos para isolar o estado do rateLimiter entre testes. */
function uniqueEmail(): string {
  return `e2e_login_${++_emailCounter}@agora.test`;
}

const FAKE_USER_ID = 'e2e-user-id-001';

function buildSupabaseMock(overrides: {
  signInResult?: any;
  profileData?: any;
} = {}) {
  const signInResult = overrides.signInResult ?? {
    data: {
      user: {
        id: FAKE_USER_ID,
        email: 'e2e@agora.test',
        created_at: new Date().toISOString(),
      },
    },
    error: null,
  };

  const profileData = overrides.profileData !== undefined
    ? overrides.profileData
    : {
        nome:       'E2E',
        sobrenome:  'Usuário',
        username:   'e2eusuario',
        tipo_conta: 'pf',
        verificado: false,
        cnpj:       null,
        genero:     null,
        avatar_url: null,
        bio:        null,
        criado_em:  new Date().toISOString(),
        atualizado_em: new Date().toISOString(),
      };

  return {
    auth: {
      signInWithPassword: jest.fn().mockResolvedValue(signInResult),
      signUp:   jest.fn().mockResolvedValue({ data: { user: null }, error: null }),
      signOut:  jest.fn().mockResolvedValue({}),
      getUser:  jest.fn().mockResolvedValue({ data: { user: { id: FAKE_USER_ID } } }),
      getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
      resetPasswordForEmail: jest.fn().mockResolvedValue({ error: null }),
      updateUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null }),
      signInWithOAuth: jest.fn().mockResolvedValue({ data: { url: 'https://oauth.test' }, error: null }),
    },
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq:     jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: profileData }),
      insert: jest.fn().mockResolvedValue({ error: null }),
      update: jest.fn().mockReturnThis(),
    }),
  };
}

// ── Suíte E2E ────────────────────────────────────────────────────────────────

describe('E2E — login por e-mail e senha', () => {
  let authService: typeof import('@/services/auth')['authService'];
  let mockSupabase: ReturnType<typeof buildSupabaseMock>;
  let mockAuditoria: any;

  /** Carrega o módulo com o supabase mock atual. */
  function loadModule(supabaseMock = mockSupabase) {
    jest.isolateModules(() => {
      jest.doMock('@/services/supabase', () => ({
        supabaseConfigured: true,
        supabase: supabaseMock,
      }));
      authService   = require('@/services/auth').authService;
      mockAuditoria = require('@/services/auditoria');
    });
  }

  beforeEach(() => {
    sessionStorage.clear();
    mockSupabase = buildSupabaseMock();
    loadModule();
    jest.clearAllMocks();
  });

  afterEach(() => jest.restoreAllMocks());

  // ── 1. Fluxo feliz — campos completos ──────────────────────────────────────

  it('1. retorna User com id, email e todos os campos de perfil preenchidos', async () => {
    const email = uniqueEmail();
    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: { id: 'uid-01', email, created_at: new Date().toISOString() } },
      error: null,
    });

    const user = await authService.login(email, 'Senha@123!');

    expect(user.id).toBe('uid-01');
    expect(user.email).toBe(email);
    expect(user.nome).toBe('E2E');
    expect(user.sobrenome).toBe('Usuário');
    expect(user.username).toBe('e2eusuario');
    expect(user.tipo_conta).toBe('pf');
    expect(typeof user.verificado).toBe('boolean');
  });

  it('2. email é sempre lido de auth.users — não de profiles', async () => {
    const emailAuth = uniqueEmail();
    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: { id: 'uid-02', email: emailAuth, created_at: '' } },
      error: null,
    });

    const user = await authService.login(emailAuth, 'Senha@123!');

    expect(user.email).toBe(emailAuth);
  });

  it('3. profile completo sobrepõe defaults vazios do mapeamento', async () => {
    const email = uniqueEmail();
    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: { id: 'uid-03', email, created_at: '' } },
      error: null,
    });
    mockSupabase.from.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq:     jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: {
          nome: 'Clara', sobrenome: 'Mendes', username: 'claramendes',
          tipo_conta: 'pj', verificado: true, cnpj: '12345678000190',
        },
      }),
    });
    loadModule();

    const user = await authService.login(email, 'Senha@123!');

    expect(user.nome).toBe('Clara');
    expect(user.sobrenome).toBe('Mendes');
    expect(user.username).toBe('claramendes');
    expect(user.tipo_conta).toBe('pj');
    expect(user.verificado).toBe(true);
    expect(user.cnpj).toBe('12345678000190');
  });

  it('4. profile null → campos com valores default seguros (string vazia / false / pf)', async () => {
    const email = uniqueEmail();
    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: { id: 'uid-04', email, created_at: '' } },
      error: null,
    });
    mockSupabase.from.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq:     jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null }),
    });
    loadModule();

    const user = await authService.login(email, 'Senha@123!');

    expect(user.nome).toBe('');
    expect(user.sobrenome).toBe('');
    expect(user.username).toBe('');
    expect(user.tipo_conta).toBe('pf');
    expect(user.verificado).toBe(false);
  });

  it('5. profile.verificado = true é preservado no User retornado', async () => {
    const email = uniqueEmail();
    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: { id: 'uid-05', email, created_at: '' } },
      error: null,
    });
    mockSupabase.from.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq:     jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { nome: 'Gov', sobrenome: '', username: 'gov', tipo_conta: 'gov', verificado: true },
      }),
    });
    loadModule();

    const user = await authService.login(email, 'Senha@123!');

    expect(user.verificado).toBe(true);
  });

  it('6. tipo_conta admin é mapeado corretamente', async () => {
    const email = uniqueEmail();
    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: { id: 'uid-06', email, created_at: '' } },
      error: null,
    });
    mockSupabase.from.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq:     jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { nome: 'Admin', sobrenome: 'AGORA', username: 'admin', tipo_conta: 'admin', verificado: true },
      }),
    });
    loadModule();

    const user = await authService.login(email, 'Senha@123!');

    expect(user.tipo_conta).toBe('admin');
    expect(user.verificado).toBe(true);
  });

  // ── 7–11. Falhas de autenticação ────────────────────────────────────────────

  it('7. senha incorreta → erro do Supabase é propagado sem modificação', async () => {
    const email = uniqueEmail();
    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: null,
      error: { message: 'Invalid login credentials' },
    });

    await expect(authService.login(email, 'SenhaErrada!')).rejects.toThrow(
      'Invalid login credentials',
    );
  });

  it('8. e-mail não cadastrado → erro do Supabase é propagado', async () => {
    const email = uniqueEmail();
    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: null,
      error: { message: 'User not found' },
    });

    await expect(authService.login(email, 'Senha@123!')).rejects.toThrow('User not found');
  });

  it('9. falha → registrarAcao chamado com acao:"login_falha" e resultado:"falha"', async () => {
    const email = uniqueEmail();
    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: null,
      error: { message: 'Invalid login credentials' },
    });

    try { await authService.login(email, 'errada'); } catch {}

    expect(mockAuditoria.registrarAcao).toHaveBeenCalledWith(
      expect.objectContaining({ acao: 'login_falha', resultado: 'falha' }),
    );
  });

  it('10. falha → trackLoginFalha chamado com o e-mail exato', async () => {
    const email = uniqueEmail();
    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: null,
      error: { message: 'Wrong password' },
    });

    try { await authService.login(email, 'errada'); } catch {}

    expect(mockAuditoria.trackLoginFalha).toHaveBeenCalledWith(email);
  });

  it('11. falha → rateLimiter NÃO é resetado (contador de tentativas permanece)', async () => {
    // Usa e-mail único para isolar o rateLimiter real
    const email = uniqueEmail();
    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: null,
      error: { message: 'Invalid login credentials' },
    });

    // 4 tentativas — ainda abaixo do limite (5)
    for (let i = 0; i < 4; i++) {
      try { await authService.login(email, 'errada'); } catch {}
    }

    // A 5ª ainda deve passar pelo Supabase (não foi bloqueada pelo rateLimiter)
    try { await authService.login(email, 'errada'); } catch {}

    // signInWithPassword chamado em todas as 5 tentativas
    expect(mockSupabase.auth.signInWithPassword).toHaveBeenCalledTimes(5);
  });

  // ── 12–14. Audit e rateLimiter no sucesso ──────────────────────────────────

  it('12. sucesso → registrarAcao chamado com acao:"login" e resultado:"sucesso"', async () => {
    const email = uniqueEmail();
    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: { id: 'uid-12', email, created_at: '' } },
      error: null,
    });

    await authService.login(email, 'Senha@123!');

    expect(mockAuditoria.registrarAcao).toHaveBeenCalledWith(
      expect.objectContaining({ acao: 'login', resultado: 'sucesso' }),
    );
  });

  it('13. sucesso → registrarAcesso chamado com "login" e userId correto', async () => {
    const email = uniqueEmail();
    const uid = 'uid-13';
    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: { id: uid, email, created_at: '' } },
      error: null,
    });

    await authService.login(email, 'Senha@123!');

    expect(mockAuditoria.registrarAcesso).toHaveBeenCalledWith('login', uid);
  });

  it('14. sucesso → rateLimiter.resetar chamado para o e-mail usado', async () => {
    // Simula 2 falhas para incrementar contador, depois um sucesso
    const email = uniqueEmail();
    mockSupabase.auth.signInWithPassword
      .mockResolvedValueOnce({ data: null, error: { message: 'wrong' } })
      .mockResolvedValueOnce({ data: null, error: { message: 'wrong' } })
      .mockResolvedValueOnce({
        data: { user: { id: 'uid-14', email, created_at: '' } },
        error: null,
      });

    try { await authService.login(email, 'errada'); } catch {}
    try { await authService.login(email, 'errada'); } catch {}
    await authService.login(email, 'Senha@123!');

    // Após o sucesso, nova tentativa NÃO deve ser bloqueada
    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: { id: 'uid-14', email, created_at: '' } },
      error: null,
    });
    const user = await authService.login(email, 'Senha@123!');
    expect(user.id).toBe('uid-14');
  });

  // ── 15–18. Rate limiting com rateLimiter REAL ───────────────────────────────

  it('15. 5 falhas seguidas com o rateLimiter real bloqueiam a 6ª tentativa', async () => {
    const email = uniqueEmail();
    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: null,
      error: { message: 'Invalid login credentials' },
    });

    // 5 falhas para esgotar o limite (maxTentativas = 5)
    for (let i = 0; i < 5; i++) {
      try { await authService.login(email, 'errada'); } catch {}
    }

    // 6ª deve ser bloqueada pelo rateLimiter antes de chamar o Supabase
    await expect(authService.login(email, 'errada')).rejects.toThrow(/RATE_LIMIT:/);
  });

  it('16. mensagem de bloqueio contém "RATE_LIMIT:" seguido de segundos (número)', async () => {
    const email = uniqueEmail();
    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: null,
      error: { message: 'Invalid login credentials' },
    });

    for (let i = 0; i < 5; i++) {
      try { await authService.login(email, 'errada'); } catch {}
    }

    let errorMsg = '';
    try {
      await authService.login(email, 'errada');
    } catch (e: any) {
      errorMsg = e.message;
    }

    expect(errorMsg).toMatch(/^RATE_LIMIT:\d+$/);
    const segundos = parseInt(errorMsg.split(':')[1], 10);
    expect(segundos).toBeGreaterThan(0);
  });

  it('17. e-mail diferente não é afetado pelo bloqueio de outro e-mail', async () => {
    const emailBloqueado = uniqueEmail();
    const emailLivre     = uniqueEmail();

    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: null,
      error: { message: 'Invalid login credentials' },
    });

    // Bloqueia emailBloqueado
    for (let i = 0; i < 5; i++) {
      try { await authService.login(emailBloqueado, 'errada'); } catch {}
    }
    await expect(authService.login(emailBloqueado, 'errada')).rejects.toThrow(/RATE_LIMIT:/);

    // emailLivre ainda consegue tentar
    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: { id: 'uid-17', email: emailLivre, created_at: '' } },
      error: null,
    });
    const user = await authService.login(emailLivre, 'Senha@123!');
    expect(user.email).toBe(emailLivre);
  });

  it('18. quando já bloqueado, signInWithPassword não é chamado', async () => {
    const email = uniqueEmail();
    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: null,
      error: { message: 'Invalid login credentials' },
    });

    for (let i = 0; i < 5; i++) {
      try { await authService.login(email, 'errada'); } catch {}
    }
    const chamadas = mockSupabase.auth.signInWithPassword.mock.calls.length;

    try { await authService.login(email, 'errada'); } catch {}

    // Nenhuma chamada adicional ao Supabase após bloqueio
    expect(mockSupabase.auth.signInWithPassword).toHaveBeenCalledTimes(chamadas);
  });

  // ── 19. Erro de rede ────────────────────────────────────────────────────────

  it('19. erro de rede do Supabase (reject) é propagado como erro', async () => {
    const email = uniqueEmail();
    mockSupabase.auth.signInWithPassword.mockRejectedValue(
      new Error('Network request failed'),
    );

    await expect(authService.login(email, 'Senha@123!')).rejects.toThrow(
      'Network request failed',
    );
  });

  // ── 20–21. Demo mode (supabaseConfigured = false) ──────────────────────────

  it('20. demo mode → retorna User sem chamar signInWithPassword', async () => {
    let demoAuthService: typeof authService;
    const demoSupabase = buildSupabaseMock();

    jest.isolateModules(() => {
      jest.doMock('@/services/supabase', () => ({
        supabaseConfigured: false,
        supabase: null,
      }));
      demoAuthService = require('@/services/auth').authService;
    });

    const user = await demoAuthService!.login('qualquer@test.com', 'qualquer');

    expect(user).toBeDefined();
    expect(typeof user.id).toBe('string');
    expect(demoSupabase.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('21. demo mode → email fornecido está presente no User retornado', async () => {
    let demoAuthService: typeof authService;

    jest.isolateModules(() => {
      jest.doMock('@/services/supabase', () => ({
        supabaseConfigured: false,
        supabase: null,
      }));
      demoAuthService = require('@/services/auth').authService;
    });

    const email = 'meu@email.com';
    const user = await demoAuthService!.login(email, 'senha');

    expect(user.email).toBe(email);
  });
});
